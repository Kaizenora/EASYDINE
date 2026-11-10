import { Injectable, NotFoundException } from '@nestjs/common';
import type { CartItemDto } from '@easydine/types';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class PublicMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  private async resolveTarget(qrToken: string) {
    if (qrToken === 'takeaway' || qrToken.startsWith('takeaway-') || qrToken === 'qr-takeaway') {
      const branchId = qrToken.startsWith('takeaway-') ? qrToken.replace('takeaway-', '') : null;
      let branch = branchId
        ? await this.prisma.branch.findUnique({ where: { id: branchId }, include: { restaurant: true } })
        : null;
      if (!branch) {
        branch =
          (await this.prisma.branch.findFirst({
            where: { isActive: true, categories: { some: {} } },
            include: { restaurant: true },
          })) ??
          (await this.prisma.branch.findFirst({
            where: { isActive: true },
            orderBy: { createdAt: 'desc' },
            include: { restaurant: true },
          }));
      }
      if (!branch) throw new NotFoundException('Restaurant branch not found');
      return { isTakeaway: true, branch, table: null };
    }

    const table = await this.prisma.table.findUnique({
      where: { qrToken },
      include: { floor: { include: { branch: { include: { restaurant: true } } } } },
    });
    if (!table) throw new NotFoundException('This QR code is not recognized');
    return { isTakeaway: false, branch: table.floor.branch, table };
  }

  async getMenuByQrToken(qrToken: string) {
    const { isTakeaway, branch, table } = await this.resolveTarget(qrToken);
    const categories = await this.menuCategoriesForBranch(branch.id);
    return {
      restaurantName: (branch as any).restaurant?.name ?? branch.name,
      branchName: branch.name,
      tableName: isTakeaway ? 'Takeaway & Pickup' : (table?.name ?? `Table ${table?.number}`),
      tableNumber: isTakeaway ? 'Takeaway' : table?.number,
      isTakeaway,
      categories,
    };
  }

  /** Customer check-in from QR scan. Marks table OCCUPIED for the cashier grid. */
  async checkIn(qrToken: string, guestName?: string, phone?: string) {
    const { isTakeaway, table } = await this.resolveTarget(qrToken);
    if (isTakeaway || !table) return { ok: true };
    const branchId = table.floor.branchId;

    if (table.status === 'AVAILABLE') {
      const noteParts = [guestName?.trim(), phone?.trim()].filter(Boolean);
      await this.prisma.table.update({
        where: { id: table.id },
        data: {
          status: 'OCCUPIED',
          statusSince: new Date(),
          notes: noteParts.length > 0 ? noteParts.join(' · ') : undefined,
        },
      });
      this.realtime.emitToBranch(branchId, 'table.updated', {
        id: table.id,
        status: 'OCCUPIED',
      });
    }

    return {
      ok: true,
      table: {
        id: table.id,
        number: table.number,
        name: table.name ?? `Table ${table.number}`,
        status: 'OCCUPIED',
      },
    };
  }

  /** Customer-visible menu tree, shared by the table-QR page and the kiosk. */
  menuCategoriesForBranch(branchId: string) {
    return this.prisma.menuCategory.findMany({
      where: { branchId, isActive: true, showOnWebsite: true },
      orderBy: { sortOrder: 'asc' },
      include: {
        items: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' },
          select: {
            id: true,
            name: true,
            description: true,
            imageUrl: true,
            price: true,
            taxRatePercent: true,
            isVeg: true,
            isVegan: true,
            spiceLevel: true,
            allergens: true,
            modifierGroups: {
              orderBy: { sortOrder: 'asc' },
              select: {
                modifierGroup: {
                  select: {
                    id: true,
                    name: true,
                    minSelect: true,
                    maxSelect: true,
                    isRequired: true,
                    modifiers: {
                      orderBy: { sortOrder: 'asc' },
                      select: {
                        id: true,
                        name: true,
                        priceAdjustment: true,
                        isDefault: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async createOrder(
    qrToken: string,
    items: CartItemDto[],
    guestName?: string,
    guestPhone?: string,
    requestId?: string,
    notes?: string,
  ) {
    const { isTakeaway, branch, table } = await this.resolveTarget(qrToken);
    const branchId = branch.id;
    const normalizedItems = (items || []).map((it) => ({
      ...it,
      modifierIds: it.modifierIds ?? [],
    }));

    if (isTakeaway) {
      if (requestId) {
        const existing = await this.prisma.order.findFirst({
          where: { branchId, clientRequestId: requestId },
          include: { items: true },
        });
        if (existing) return existing;
      }

      const createdById = (
        await this.prisma.userBranch.findFirst({
          where: { branchId },
          orderBy: { userId: 'asc' },
        })
      )?.userId;
      if (!createdById) throw new NotFoundException('This branch has no staff to receive the order');

      const cleanGuestName = guestName?.trim() || 'Takeaway Guest';

      return this.ordersService.createOrder(
        branchId,
        createdById,
        {
          type: 'TAKEAWAY',
          guestName: cleanGuestName,
          guestPhone,
          notes: notes ? `Takeaway · ${notes}` : 'Takeaway Order',
          clientRequestId: requestId,
          items: normalizedItems,
        } as any,
        { channel: 'ONLINE', requireAcceptance: true },
      );
    }

    if (!table) {
      throw new NotFoundException('Table not found');
    }

    // Dine-in Table Order
    // Idempotency: retry of the exact same request key returns the existing order
    if (requestId) {
      const existing = await this.prisma.order.findFirst({
        where: {
          branchId,
          tableId: table.id,
          clientRequestId: requestId,
        },
        include: { items: true },
      });
      if (existing) {
        return existing;
      }
    }

    // A guest who already ordered once this visit and scans again to add
    // more lands on the same tab, not opening a second order for the table.
    const openOrder = await this.prisma.order.findFirst({
      where: { branchId, tableId: table.id, status: 'OPEN' },
    });
    if (openOrder) {
      if (guestPhone && !openOrder.deliveryPhone) {
        await this.prisma.order.update({
          where: { id: openOrder.id },
          data: { deliveryPhone: guestPhone },
        });
      }
      return this.ordersService.addItems(branchId, openOrder.id, normalizedItems, {
        enforceModifierLimits: true,
        websiteOnly: true,
      });
    }

    const createdById =
      table.assignedWaiterId ??
      (
        await this.prisma.userBranch.findFirst({
          where: { branchId },
          orderBy: { userId: 'asc' },
        })
      )?.userId;
    if (!createdById) {
      throw new NotFoundException(
        'This branch has no staff to receive the order',
      );
    }

    const cleanGuestName = guestName?.trim() || 'Guest';

    return this.ordersService.createOrder(
      branchId,
      createdById,
      {
        type: 'QR_ORDER',
        tableId: table.id,
        guestName: cleanGuestName,
        guestPhone,
        notes,
        clientRequestId: requestId,
        items: normalizedItems,
      } as any,
      { channel: 'ONLINE', requireAcceptance: true },
    );
  }

  /** Live status of the table or takeaway tab, for the guest's QR page. */
  async getStatus(qrToken: string) {
    const { isTakeaway, branch, table } = await this.resolveTarget(qrToken);
    
    const order = await this.prisma.order.findFirst({
      where:
        isTakeaway || !table
          ? {
              branchId: branch.id,
              type: 'TAKEAWAY',
              status: { in: ['OPEN', 'BILLED', 'PAID'] },
            }
          : {
              tableId: table.id,
              status: { in: ['OPEN', 'BILLED', 'PAID'] },
            },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        acceptance: true,
        totalAmount: true,
        createdAt: true,
        acceptedAt: true,
        items: {
          where: { status: { not: 'CANCELLED' } },
          select: {
            id: true,
            nameSnapshot: true,
            quantity: true,
            unitPriceSnapshot: true,
            lineTotal: true,
            status: true,
            kitchenNote: true,
          },
        },
      },
    });

    const requests = (!isTakeaway && table)
      ? await this.prisma.tableRequest.findMany({
          where: { tableId: table.id, resolvedAt: null },
          select: { type: true },
        })
      : [];

    if (!order) {
      return { order: null, openRequests: requests.map((r) => r.type) };
    }

    // Derive aggregated cooking status from active items
    const activeItems = order.items;
    let cookingStatus = 'PENDING';
    if (activeItems.length > 0) {
      const allServed = activeItems.every((it) => it.status === 'SERVED');
      const allReadyOrServed = activeItems.every((it) => it.status === 'READY' || it.status === 'SERVED');
      const anyPreparing = activeItems.some((it) => it.status === 'PREPARING');
      const anyAccepted = activeItems.some((it) => it.status === 'ACCEPTED') || order.acceptance === 'ACCEPTED';

      if (allServed) {
        cookingStatus = 'SERVED';
      } else if (allReadyOrServed) {
        cookingStatus = 'READY';
      } else if (anyPreparing) {
        cookingStatus = 'PREPARING';
      } else if (anyAccepted) {
        cookingStatus = 'ACCEPTED';
      }
    } else if (order.acceptance === 'ACCEPTED') {
      cookingStatus = 'ACCEPTED';
    }

    const isServed = cookingStatus === 'SERVED';

    const placedAt = order.createdAt
      ? new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : undefined;
    const acceptedAt = order.acceptedAt
      ? new Date(order.acceptedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : undefined;

    return {
      order: {
        orderNumber: order.orderNumber,
        status: cookingStatus,
        cookingStatus,
        acceptance: order.acceptance,
        totalAmount: order.totalAmount ? String(order.totalAmount) : '0.00',
        placedAt,
        acceptedAt,
        isServed,
        items: order.items.map((it) => ({
          id: it.id,
          nameSnapshot: it.nameSnapshot,
          quantity: it.quantity,
          unitPriceSnapshot: String(it.unitPriceSnapshot),
          lineTotal: String(it.lineTotal),
          status: it.status,
          kitchenNote: it.kitchenNote,
        })),
      },
      openRequests: requests.map((r) => r.type),
    };
  }

  /** "Call waiter" / "Bring the bill". One open request per type per table. */
  async createRequest(qrToken: string, type: 'WAITER' | 'BILL') {
    const { isTakeaway, table } = await this.resolveTarget(qrToken);
    if (isTakeaway || !table) return { ok: true, alreadyRequested: false };
    const branchId = table.floor.branchId;
    const existing = await this.prisma.tableRequest.findFirst({
      where: { tableId: table.id, type, resolvedAt: null },
    });
    if (existing) return { ok: true, alreadyRequested: true };

    const request = await this.prisma.tableRequest.create({
      data: { branchId, tableId: table.id, type },
    });
    this.realtime.emitToBranch(branchId, 'table.request', { id: request.id });
    const tableName = table.name ?? `Table ${table.number}`;
    try {
      await this.notifications.notifyByPermission(branchId, 'tables.manage', {
        type: type === 'BILL' ? 'table.bill' : 'table.waiter',
        title:
          type === 'BILL'
            ? `${tableName} wants the bill`
            : `${tableName} needs a waiter`,
        body: 'Requested from the table QR code',
        entity: 'Table',
        entityId: table.id,
      });
    } catch {
      // Best-effort: the request row and live event already exist.
    }
    return { ok: true, alreadyRequested: false };
  }
}
