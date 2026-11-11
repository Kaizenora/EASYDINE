import { randomBytes } from 'node:crypto';
import { forwardRef, Inject } from '@nestjs/common';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  BulkTableCreateDto,
  FloorDto,
  FloorUpdateDto,
  TableDto,
  TableLayoutUpdateDto,
  TableStatusDto,
  TableUpdateDto,
} from '@easydine/types';
import { PrismaService } from '../../prisma/prisma.service';
import { RealtimeGateway } from '../../realtime/realtime.gateway';
import { OrdersService } from '../orders/orders.service';

@Injectable()
export class TablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeGateway,
    @Inject(forwardRef(() => OrdersService))
    private readonly ordersService: OrdersService,
  ) {}

  async listFloors(branchId: string) {
    const [floors, openOrders, activeRequests, activeReservations] =
      await Promise.all([
        this.prisma.floor.findMany({
          where: { branchId },
          orderBy: { sortOrder: 'asc' },
          include: {
            tables: {
              orderBy: { number: 'asc' },
              include: {
                assignedWaiter: { select: { id: true, name: true } },
              },
            },
          },
        }),
        this.prisma.order.findMany({
          where: {
            branchId,
            status: { notIn: ['PAID', 'CANCELLED'] },
            tableId: { not: null },
          },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            tableId: true,
            orderNumber: true,
            totalAmount: true,
            guestName: true,
            guestCount: true,
            customer: { select: { name: true, phone: true } },
            items: { select: { id: true, status: true, quantity: true } },
          },
        }),
        this.prisma.tableRequest.findMany({
          where: {
            branchId,
            resolvedAt: null,
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.reservation.findMany({
          where: {
            branchId,
            status: { in: ['RESERVED', 'CONFIRMED'] },
            tableId: { not: null },
          },
          orderBy: { reservedAt: 'asc' },
        }),
      ]);

    const ordersByTable = new Map<string, (typeof openOrders)[0]>();
    for (const o of openOrders) {
      if (o.tableId && !ordersByTable.has(o.tableId)) {
        ordersByTable.set(o.tableId, o);
      }
    }

    const requestsByTable = new Map<string, (typeof activeRequests)[0]>();
    for (const r of activeRequests) {
      if (r.tableId && !requestsByTable.has(r.tableId)) {
        requestsByTable.set(r.tableId, r);
      }
    }

    const reservationsByTable = new Map<string, (typeof activeReservations)[0]>();
    for (const res of activeReservations) {
      if (res.tableId && !reservationsByTable.has(res.tableId)) {
        reservationsByTable.set(res.tableId, res);
      }
    }

    return floors.map((floor) => ({
      ...floor,
      tables: floor.tables.map((table) => {
        const activeOrder = ordersByTable.get(table.id);
        const activeRequest = requestsByTable.get(table.id);
        const activeReservation = reservationsByTable.get(table.id);

        const customerName =
          activeOrder?.guestName ||
          activeOrder?.customer?.name ||
          activeReservation?.customerName ||
          null;

        const guestCount =
          activeOrder?.guestCount ||
          activeReservation?.guestCount ||
          null;

        const dishesCount = activeOrder
          ? activeOrder.items.reduce((sum, item) => sum + item.quantity, 0)
          : 0;

        const totalAmount =
          activeOrder && activeOrder.totalAmount != null
            ? String(activeOrder.totalAmount)
            : null;
        const serviceRequest = activeRequest ? activeRequest.type : null;

        const hasPreparing = activeOrder?.items.some((i) => i.status === 'PREPARING') ?? false;
        const allServed =
          Boolean(activeOrder && activeOrder.items.length > 0 && activeOrder.items.every((i) => i.status === 'SERVED'));

        return {
          ...table,
          customerName,
          guestCount,
          orderNumber: activeOrder?.orderNumber || null,
          orderId: activeOrder?.id || null,
          totalAmount,
          dishesCount,
          serviceRequest,
          hasPreparing,
          allServed,
          activeReservation: activeReservation
            ? {
                id: activeReservation.id,
                customerName: activeReservation.customerName,
                guestCount: activeReservation.guestCount,
                reservedAt: activeReservation.reservedAt,
              }
            : null,
        };
      }),
    }));
  }

  createFloor(branchId: string, dto: FloorDto) {
    return this.prisma.floor.create({ data: { ...dto, branchId } });
  }

  async updateFloor(branchId: string, id: string, dto: FloorUpdateDto) {
    await this.assertFloorInBranch(branchId, id);
    return this.prisma.floor.update({ where: { id }, data: dto });
  }

  async createTable(branchId: string, dto: TableDto) {
    await this.assertFloorInBranch(branchId, dto.floorId);
    const qrToken = randomBytes(16).toString('hex');
    const table = await this.prisma.table.create({ data: { ...dto, qrToken } });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async createTables(branchId: string, dto: BulkTableCreateDto) {
    await this.assertFloorInBranch(branchId, dto.floorId);

    const numbers = dto.numbers.map((n) => n.trim()).filter(Boolean);
    const duplicatesInBatch = numbers.filter(
      (n, i) => numbers.indexOf(n) !== i,
    );
    if (duplicatesInBatch.length > 0) {
      throw new BadRequestException(
        `Table numbers must be unique: ${[...new Set(duplicatesInBatch)].join(', ')} ${duplicatesInBatch.length > 1 ? 'are' : 'is'} repeated.`,
      );
    }

    const existing = await this.prisma.table.findMany({
      where: { floorId: dto.floorId, number: { in: numbers } },
      select: { number: true },
    });
    if (existing.length > 0) {
      const clashes = existing.map((t) => t.number).join(', ');
      throw new BadRequestException(
        `These table numbers already exist on this floor: ${clashes}. Choose different numbers.`,
      );
    }

    const tables = await this.prisma.$transaction(
      numbers.map((number, index) =>
        this.prisma.table.create({
          data: {
            floorId: dto.floorId,
            number,
            capacity: dto.capacity,
            shape: dto.shape,
            color: dto.color,
            posX: 20 + (index % 5) * 100,
            posY: 20 + Math.floor(index / 5) * 100,
            qrToken: randomBytes(16).toString('hex'),
          },
        }),
      ),
    );
    tables.forEach((table) =>
      this.realtime.emitToBranch(branchId, 'table.updated', table),
    );
    return tables;
  }

  async updateTable(branchId: string, id: string, dto: TableUpdateDto) {
    await this.assertTableInBranch(branchId, id);
    const table = await this.prisma.table.update({ where: { id }, data: dto });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async updateTableLayout(branchId: string, updates: TableLayoutUpdateDto[]) {
    const owned = await this.prisma.table.findMany({
      where: { id: { in: updates.map((u) => u.id) }, floor: { branchId } },
      select: { id: true },
    });
    if (owned.length !== updates.length) {
      throw new BadRequestException(
        'One or more tables are invalid for this branch',
      );
    }

    const results = await this.prisma.$transaction(
      updates.map(({ id, ...rest }) =>
        this.prisma.table.update({ where: { id }, data: rest }),
      ),
    );
    this.realtime.emitToBranch(branchId, 'table.layout.updated', results);
    return results;
  }

  async updateTableStatus(
    branchId: string,
    id: string,
    status: TableStatusDto,
    assignedWaiterId?: string,
  ) {
    await this.assertTableInBranch(branchId, id);
    // A table with an unpaid bill cannot be marked free/reserved/cleaning by
    // hand - that is how a live order ended up hidden behind an "Available"
    // tile. Pay or cancel the bill first (both release the table themselves).
    if (status !== 'OCCUPIED') {
      const open = await this.prisma.order.findFirst({
        where: { tableId: id, status: 'OPEN' },
        select: { orderNumber: true },
      });
      if (open) {
        throw new ConflictException(
          `This table has an open bill (#${open.orderNumber}) - pay or cancel it first`,
        );
      }
    }
    const table = await this.prisma.table.update({
      where: { id },
      data: {
        status,
        statusSince: new Date(),
        ...(assignedWaiterId ? { assignedWaiterId } : {}),
      },
    });
    this.realtime.emitToBranch(branchId, 'table.updated', table);
    return table;
  }

  async deleteTable(branchId: string, id: string) {
    await this.assertTableInBranch(branchId, id);
    await this.prisma.table.delete({ where: { id } });
    this.realtime.emitToBranch(branchId, 'table.deleted', { id });
    return { ok: true };
  }

  async rotateQrToken(branchId: string, id: string) {
    const table = await this.prisma.table.findFirst({
      where: { id, floor: { branchId } },
    });
    if (!table) throw new NotFoundException('Table not found');

    // opaque, unguessable token — not the table's own id, so a leaked QR
    // image can't be used to enumerate other tables' ids/data
    const qrToken = randomBytes(16).toString('hex');
    return this.prisma.table.update({ where: { id }, data: { qrToken } });
  }

  private async assertFloorInBranch(branchId: string, floorId: string) {
    const floor = await this.prisma.floor.findFirst({
      where: { id: floorId, branchId },
    });
    if (!floor) throw new NotFoundException('Floor not found');
  }

  private async assertTableInBranch(branchId: string, tableId: string) {
    const table = await this.prisma.table.findFirst({
      where: { id: tableId, floor: { branchId } },
    });
    if (!table) throw new NotFoundException('Table not found');
  }

  /** Open guest requests (call waiter / bring bill) for a branch. */
  listOpenRequests(branchId: string) {
    return this.prisma.tableRequest.findMany({
      where: { branchId, resolvedAt: null },
      include: { table: { select: { id: true, number: true, name: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async resolveRequest(branchId: string, id: string) {
    const request = await this.prisma.tableRequest.findFirst({
      where: { id, branchId },
    });
    if (!request) throw new NotFoundException('Request not found');
    const updated = await this.prisma.tableRequest.update({
      where: { id },
      data: { resolvedAt: new Date() },
    });
    this.realtime.emitToBranch(branchId, 'table.request', { id });
    return updated;
  }

  async settleTable(
    branchId: string,
    tableId: string,
    userId: string,
    method: 'CASH' | 'UPI' | 'CARD' | 'OTHER' = 'CASH',
  ) {
    await this.assertTableInBranch(branchId, tableId);
    const table = await this.prisma.table.findUniqueOrThrow({
      where: { id: tableId },
    });

    const order = await this.prisma.order.findFirst({
      where: { tableId, branchId, status: 'OPEN' },
      include: { items: true, customer: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });

    let checkoutResult: any = null;
    let customerName = order?.customer?.name || order?.guestName || 'Guest';

    if (order) {
      if (!order.customerId && (order.guestName || order.deliveryPhone)) {
        // Same safe logic as checkout: phone identifies (normalized, per
        // branch), a name alone never merges and a name-only guest simply
        // gets no shared record.
        try {
          const resolvedId = await this.ordersService.resolveOrCreateCustomer(
            branchId,
            { name: order.guestName, phone: order.deliveryPhone },
          );
          if (resolvedId) {
            const linked = await this.prisma.order.update({
              where: { id: order.id },
              data: { customerId: resolvedId },
              include: { customer: true },
            });
            customerName = linked.customer?.name || customerName;
          }
        } catch {
          // customer linking must never block settling the table
        }
      }

      const preview = await this.ordersService.previewBill(branchId, order.id, {});
      checkoutResult = await this.ordersService.checkout(
        branchId,
        order.id,
        userId,
        {
          payments: [
            {
              method: method as any,
              amount: preview.totalDue,
            },
          ],
        },
      );
    }

    await this.prisma.tableRequest.updateMany({
      where: { tableId, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
      },
    });

    const updatedTable = await this.prisma.table.update({
      where: { id: tableId },
      data: {
        status: 'AVAILABLE',
        statusSince: new Date(),
      },
    });

    this.realtime.emitToBranch(branchId, 'table.updated', updatedTable);
    this.realtime.emitToBranch(branchId, 'table.requests.updated', { tableId });

    const billNumber = order?.orderNumber || `BILL-${Date.now().toString().slice(-6)}`;
    const subtotal = checkoutResult?.subtotal !== undefined ? Number(checkoutResult.subtotal).toFixed(2) : '0.00';
    const tax = checkoutResult?.taxAmount !== undefined ? Number(checkoutResult.taxAmount).toFixed(2) : '0.00';
    const totalAmount = checkoutResult?.totalAmount !== undefined ? Number(checkoutResult.totalAmount).toFixed(2) : '0.00';

    return {
      success: true,
      ok: true,
      tableId,
      tableNumber: String(table.number),
      tableName: table.name || `Table ${table.number}`,
      billNumber,
      orderNumber: order?.orderNumber ?? null,
      customerName,
      paymentMethod: method,
      subtotal,
      tax,
      totalAmount,
      date: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
    };
  }

  async getTableBranch(tableId: string): Promise<string> {
    const table = await this.prisma.table.findUnique({
      where: { id: tableId },
      include: { floor: { select: { branchId: true } } },
    });
    if (!table) throw new NotFoundException("Table not found");
    return table.floor.branchId;
  }
}
