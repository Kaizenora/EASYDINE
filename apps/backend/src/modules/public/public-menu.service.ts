import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CartItemDto } from '@easydine/types';
import { NotificationsService } from '../../notifications/notifications.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { OrdersService } from '../orders/orders.service';

/** Branch.takeawayToken is randomBytes(16).toString('hex'). */
const TAKEAWAY_TOKEN_RE = /^[0-9a-f]{32}$/;

/** Shown to a guest who scans the QR of a table staff marked Out of service. */
export const OUT_OF_SERVICE_MESSAGE =
  'This table is out of service. Please move to another table. Thank you.';

@Injectable()
export class PublicMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * Maps a public QR token to its branch. Takeaway QRs are
   * `takeaway-<Branch.takeawayToken>`; the token is opaque (32 hex chars) and
   * is the only thing that identifies the branch. There is deliberately no
   * fallback: bare `takeaway` / `qr-takeaway` and `takeaway-<branchId>` must
   * never resolve, or anyone could order at (and poll) another restaurant.
   */
  private async resolveTarget(qrToken: string) {
    if (qrToken.startsWith('takeaway')) {
      const token = qrToken.startsWith('takeaway-') ? qrToken.slice('takeaway-'.length) : '';
      if (!TAKEAWAY_TOKEN_RE.test(token)) {
        throw new NotFoundException('This QR code is not recognized');
      }
      const branch = await this.prisma.branch.findUnique({
        where: { takeawayToken: token },
        include: { restaurant: true },
      });
      if (!branch || !branch.isActive) {
        throw new NotFoundException('This QR code is not recognized');
      }
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
    // Out-of-service table: the guest gets the notice only, never the menu.
    if (!isTakeaway && table?.status === 'OUT_OF_SERVICE') {
      return {
        restaurantName: (branch as any).restaurant?.name ?? branch.name,
        branchName: branch.name,
        tableName: table.name ?? `Table ${table.number}`,
        tableNumber: table.number,
        isTakeaway: false,
        outOfService: true,
        message: OUT_OF_SERVICE_MESSAGE,
        categories: [],
      };
    }
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
    // Never flip an out-of-service table to OCCUPIED from a guest scan.
    if (table.status === 'OUT_OF_SERVICE') {
      return { ok: false, outOfService: true, message: OUT_OF_SERVICE_MESSAGE };
    }
    const branchId = table.floor.branchId;

    const cleanPhone = phone ? phone.replace(/\D/g, '').slice(0, 10) : undefined;
    if (guestName || cleanPhone) {
      await this.ordersService.resolveOrCreateCustomer(branchId, {
        name: guestName,
        phone: cleanPhone,
      });
    }

    if (table.status === 'AVAILABLE') {
      const noteParts = [guestName?.trim(), cleanPhone].filter(Boolean);
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
      const cleanGuestPhone = guestPhone ? guestPhone.replace(/\D/g, '').slice(0, 10) : undefined;

      // Resolve or create customer from guest details so they appear in
      // the Customers section even before the cashier marks the order paid.
      const takeawayCustomerId = await this.ordersService.resolveOrCreateCustomer(
        branchId,
        { name: cleanGuestName, phone: cleanGuestPhone },
      );

      return this.ordersService.createOrder(
        branchId,
        createdById,
        {
          type: 'TAKEAWAY',
          guestName: cleanGuestName,
          guestPhone: cleanGuestPhone,
          notes: notes ? `Takeaway · ${notes}` : 'Takeaway Order',
          clientRequestId: requestId,
          customerId: takeawayCustomerId,
          items: normalizedItems,
        } as any,
        { channel: 'ONLINE', requireAcceptance: true },
      );
    }

    if (!table) {
      throw new NotFoundException('Table not found');
    }
    // Out of service: no new guest orders for this table. Orders that already
    // exist are left alone (staff still see and settle them).
    if (table.status === 'OUT_OF_SERVICE') {
      throw new ConflictException(OUT_OF_SERVICE_MESSAGE);
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
      // Update phone and link customer if not done yet
      const updateData: any = {};
      if (guestPhone && !openOrder.deliveryPhone) updateData.deliveryPhone = guestPhone;
      if (!openOrder.customerId) {
        const existingCustomerId = await this.ordersService.resolveOrCreateCustomer(
          branchId,
          { name: guestName, phone: guestPhone },
        );
        if (existingCustomerId) updateData.customerId = existingCustomerId;
      }
      if (Object.keys(updateData).length > 0) {
        await this.prisma.order.update({ where: { id: openOrder.id }, data: updateData });
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
    const cleanGuestPhone = guestPhone ? guestPhone.replace(/\D/g, '').slice(0, 10) : undefined;

    // Resolve or create customer from guest name/phone so they appear in
    // the Customers section immediately when order is placed.
    const qrCustomerId = await this.ordersService.resolveOrCreateCustomer(
      branchId,
      { name: cleanGuestName, phone: cleanGuestPhone },
    );

    return this.ordersService.createOrder(
      branchId,
      createdById,
      {
        type: 'QR_ORDER',
        tableId: table.id,
        guestName: cleanGuestName,
        guestPhone: cleanGuestPhone,
        notes,
        clientRequestId: requestId,
        customerId: qrCustomerId,
        items: normalizedItems,
      } as any,
      { channel: 'ONLINE', requireAcceptance: true },
    );
  }

  /** Live status of the table or takeaway tab, for the guest's QR page. */
  async getStatus(qrToken: string, requestedOrderId?: string) {
    const { isTakeaway, branch, table } = await this.resolveTarget(qrToken);

    const orderSelect = {
      id: true,
      orderNumber: true,
      status: true,
      acceptance: true,
      totalAmount: true,
      createdAt: true,
      acceptedAt: true,
      kots: {
        select: {
          id: true,
          status: true,
          acceptedAt: true,
          readyAt: true,
          servedAt: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' as const },
      },
      items: {
        where: { status: { not: 'CANCELLED' as const } },
        select: {
          id: true,
          nameSnapshot: true,
          quantity: true,
          unitPriceSnapshot: true,
          lineTotal: true,
          status: true,
          kitchenNote: true,
          modifiers: {
            select: {
              id: true,
              nameSnapshot: true,
              priceAdjSnapshot: true,
            },
          },
        },
      },
    };

    let order: any = null;

    if (isTakeaway || !table) {
      // Takeaway: only return an active (non-paid) order if we have a specific orderId
      if (requestedOrderId) {
        order = await this.prisma.order.findFirst({
          where: {
            id: requestedOrderId,
            branchId: branch.id,
            type: 'TAKEAWAY',
            // NEVER return a PAID order — once paid the guest sees the menu fresh
            status: { in: ['OPEN', 'BILLED'] },
          },
          select: orderSelect,
        });
      }
    } else {
      // Dine-in table: ALWAYS only return OPEN or BILLED orders.
      // If the order is PAID, we return null so the next guest gets a fresh menu.
      // We do NOT rely on table.status because releaseTableIfIdle may be async.
      order = await this.prisma.order.findFirst({
        where: {
          tableId: table.id,
          status: { in: ['OPEN', 'BILLED'] },
        },
        orderBy: { createdAt: 'desc' },
        select: orderSelect,
      });
    }

    const requests = (!isTakeaway && table)
      ? await this.prisma.tableRequest.findMany({
          where: { tableId: table.id, resolvedAt: null },
          select: { type: true },
        })
      : [];

    if (!order) {
      return { order: null, openRequests: requests.map((r) => r.type) };
    }

    // Derive aggregated cooking status from active items and kots
    const activeItems = order.items;
    const kots = (order as any).kots || [];
    let cookingStatus = 'PENDING';

    const allKotStatuses = kots.map((k: any) => k.status);
    const allItemStatuses = activeItems.map((i: any) => i.status);
    const combinedStatuses = [...allKotStatuses, ...allItemStatuses];

    if (combinedStatuses.length > 0) {
      if (combinedStatuses.every((s: string) => s === 'SERVED')) {
        cookingStatus = 'SERVED';
      } else if (combinedStatuses.every((s: string) => s === 'READY' || s === 'SERVED')) {
        cookingStatus = 'READY';
      } else if (combinedStatuses.some((s: string) => s === 'SERVED')) {
        cookingStatus = 'SERVED';
      } else if (combinedStatuses.some((s: string) => s === 'READY')) {
        cookingStatus = 'READY';
      } else if (combinedStatuses.some((s: string) => s === 'PREPARING')) {
        cookingStatus = 'PREPARING';
      } else if (combinedStatuses.some((s: string) => s === 'ACCEPTED') || order.acceptance === 'ACCEPTED') {
        cookingStatus = 'ACCEPTED';
      }
    } else if (order.acceptance === 'ACCEPTED') {
      cookingStatus = 'ACCEPTED';
    }

    const isServed = cookingStatus === 'SERVED' || order.status === 'PAID';

    const placedAt = order.createdAt ? new Date(order.createdAt).toISOString() : undefined;
    const acceptedAt = order.acceptedAt ? new Date(order.acceptedAt).toISOString() : undefined;
    const latestKot = kots[0];
    const preparedAt = latestKot?.readyAt ? new Date(latestKot.readyAt).toISOString() : undefined;
    const servedAt = latestKot?.servedAt ? new Date(latestKot.servedAt).toISOString() : undefined;

    return {
      order: {
        orderNumber: order.orderNumber,
        status: order.status === 'PAID' ? 'PAID' : cookingStatus,
        orderStatus: order.status,
        cookingStatus,
        acceptance: order.acceptance,
        totalAmount: order.totalAmount ? String(order.totalAmount) : '0.00',
        placedAt,
        acceptedAt,
        preparedAt,
        servedAt,
        isServed,
        items: order.items.map((it) => ({
          id: it.id,
          nameSnapshot: it.nameSnapshot,
          quantity: it.quantity,
          unitPriceSnapshot: String(it.unitPriceSnapshot),
          lineTotal: String(it.lineTotal),
          status: it.status,
          kitchenNote: it.kitchenNote,
          modifiers: ((it as any).modifiers || []).map((m: any) => ({
            id: m.id,
            nameSnapshot: m.nameSnapshot,
            priceAdjSnapshot: m.priceAdjSnapshot ? Number(m.priceAdjSnapshot) : 0,
          })),
        })),
      },
      openRequests: requests.map((r) => r.type),
      tableStatus: table?.status ?? null,
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
