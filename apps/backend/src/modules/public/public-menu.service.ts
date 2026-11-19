import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { normalizePhone, type CartItemDto } from '@easydine/types';
import { NotificationsService } from '../../notifications/notifications.service';
import { findCustomerByPhone } from '../customers/customer-phone';
import { usableBalance } from '../loyalty/loyalty';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { OrdersService } from '../orders/orders.service';

/**
 * What a guest's phone gets back after placing a QR order. The order row
 * itself carries things a stranger holding the same table QR must never
 * receive: the first guest's name and phone, the table's notes, staff ids.
 */
/** The restaurant-level settings the customer menu needs; nothing else leaves. */
export function publicRestaurantExtras(r: any) {
  const zomato = r?.zomatoUrl || null;
  const swiggy = r?.swiggyUrl || null;
  return {
    loyalty: {
      enabled: !!r?.loyaltyEnabled,
      earnPerCurrency: r?.loyaltyEarnPerCurrency ?? null,
      pointValue: r ? Number(r.loyaltyPointValue) : null,
      minOrderAmount: r ? Number(r.loyaltyMinOrderAmount) : 0,
    },
    deliveryRedirect:
      r?.deliveryRedirectEnabled && (zomato || swiggy)
        ? { zomatoUrl: zomato, swiggyUrl: swiggy }
        : null,
    reviewUrl: r?.reviewUrl || null,
  };
}

export function toPublicOrder(order: any) {
  if (!order) return order;
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    type: order.type,
    status: order.status,
    acceptance: order.acceptance,
    totalAmount: order.totalAmount != null ? String(order.totalAmount) : null,
    createdAt: order.createdAt,
    items: (order.items ?? []).map((it: any) => ({
      id: it.id,
      menuItemId: it.menuItemId,
      nameSnapshot: it.nameSnapshot,
      quantity: it.quantity,
      unitPriceSnapshot:
        it.unitPriceSnapshot != null ? String(it.unitPriceSnapshot) : null,
      lineTotal: it.lineTotal != null ? String(it.lineTotal) : null,
      status: it.status,
      kitchenNote: it.kitchenNote ?? null,
      modifiers: (it.modifiers ?? []).map((m: any) => ({
        id: m.id,
        nameSnapshot: m.nameSnapshot,
        priceAdjSnapshot:
          m.priceAdjSnapshot != null ? Number(m.priceAdjSnapshot) : 0,
      })),
    })),
  };
}

@Injectable()
export class PublicMenuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ordersService: OrdersService,
    private readonly notifications: NotificationsService,
    private readonly realtime: RealtimeGateway,
  ) {}

  /**
   * The branch a generic link (no branch in it) may stand for: only on an
   * install that hosts a single restaurant. With several restaurants on one
   * server a generic link must never land in somebody else's branch.
   */
  async soleRestaurantBranch(extraWhere: Prisma.BranchWhereInput = {}) {
    const restaurants = await this.prisma.restaurant.findMany({
      select: { id: true },
      take: 2,
    });
    if (restaurants.length !== 1) return null;
    const where = {
      restaurantId: restaurants[0].id,
      isActive: true,
      ...extraWhere,
    };
    return (
      (await this.prisma.branch.findFirst({
        where: { ...where, categories: { some: {} } },
        orderBy: { createdAt: 'asc' },
        include: { restaurant: true },
      })) ??
      (await this.prisma.branch.findFirst({
        where,
        orderBy: { createdAt: 'asc' },
        include: { restaurant: true },
      }))
    );
  }

  private async resolveTarget(qrToken: string) {
    if (qrToken === 'takeaway' || qrToken.startsWith('takeaway-') || qrToken === 'qr-takeaway') {
      // "takeaway-<branchId>" names its branch and must match it exactly: an
      // unknown or switched-off branch is refused, never swapped for another.
      const branch = qrToken.startsWith('takeaway-')
        ? await this.prisma.branch.findFirst({
            where: { id: qrToken.slice('takeaway-'.length), isActive: true },
            include: { restaurant: true },
          })
        : await this.soleRestaurantBranch();
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
      ...publicRestaurantExtras((branch as any).restaurant),
    };
  }

  /**
   * A guest's points balance for the phone they typed. Needs the QR token (so
   * it is scoped to that restaurant's branch) and only ever returns the
   * number; never a name, history or any other detail.
   */
  async getLoyaltyBalance(qrToken: string, rawPhone?: string) {
    const { branch } = await this.resolveTarget(qrToken);
    const restaurant = (branch as any).restaurant;
    if (!restaurant?.loyaltyEnabled) return { enabled: false, points: 0 };
    const phone = normalizePhone(rawPhone);
    if (!phone) return { enabled: true, points: 0, known: false };
    const found = await findCustomerByPhone(this.prisma, branch.id, phone);
    if (!found) return { enabled: true, points: 0, known: false };
    const customer = await this.prisma.customer.findUniqueOrThrow({
      where: { id: found.id },
      select: { loyaltyPoints: true, loyaltyLastEarnedAt: true },
    });
    return {
      enabled: true,
      known: true,
      points: usableBalance(restaurant, customer),
      pointValue: Number(restaurant.loyaltyPointValue),
    };
  }

  /** Customer check-in from QR scan. Marks table OCCUPIED for the cashier grid. */
  async checkIn(qrToken: string, guestName?: string, phone?: string) {
    const { isTakeaway, table } = await this.resolveTarget(qrToken);
    if (isTakeaway || !table) return { ok: true };
    const branchId = table.floor.branchId;

    // Scanning a QR and typing a name creates NO customer record: that only
    // happens once an order is actually paid (OrdersService.checkout).
    const cleanPhone = normalizePhone(phone) ?? undefined;

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
      // Kept on the order; saved to Customers only when the order is paid.
      const cleanGuestPhone = normalizePhone(guestPhone) ?? undefined;

      return this.ordersService.createOrder(
        branchId,
        createdById,
        {
          type: 'TAKEAWAY',
          guestName: cleanGuestName,
          guestPhone: cleanGuestPhone,
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
      // Fill in contact details the tab does not have yet. They stay on the
      // order; the customer record is created when the order is paid.
      const updateData: any = {};
      const addPhone = normalizePhone(guestPhone);
      if (addPhone && !openOrder.deliveryPhone) updateData.deliveryPhone = addPhone;
      const addName = guestName?.trim();
      if (
        addName &&
        addName.toLowerCase() !== 'guest' &&
        (!openOrder.guestName || openOrder.guestName.toLowerCase() === 'guest')
      ) {
        updateData.guestName = addName;
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
    // Kept on the order; saved to Customers only when the order is paid.
    const cleanGuestPhone = normalizePhone(guestPhone) ?? undefined;

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
      // The guest's own order, once paid: show what they earned. The order id
      // is an unguessable token only their device holds, and only two numbers
      // leave the server.
      let paid: Record<string, unknown> | undefined;
      if (requestedOrderId) {
        const done = await this.prisma.order.findFirst({
          where: { id: requestedOrderId, branchId: branch.id, status: 'PAID' },
          select: {
            orderNumber: true,
            loyaltyPointsEarned: true,
            customer: {
              select: { loyaltyPoints: true, loyaltyLastEarnedAt: true },
            },
          },
        });
        if (done) {
          const restaurant = (branch as any).restaurant;
          paid = {
            orderNumber: done.orderNumber,
            loyaltyEnabled: !!restaurant?.loyaltyEnabled,
            pointsEarned: done.loyaltyPointsEarned,
            pointsBalance: done.customer
              ? usableBalance(restaurant, done.customer)
              : null,
          };
        }
      }
      return {
        order: null,
        openRequests: requests.map((r) => r.type),
        ...(paid && { paid }),
      };
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
