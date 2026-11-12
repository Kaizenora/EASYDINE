import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { BranchAccessService } from '../../common/services/branch-access.service';
import { KotPrintService } from './kot-print.service';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

// Tenant isolation of every /orders route, end to end through the real
// controller, BranchAccessService, OrdersService and KotPrintService. Only
// Prisma is faked, and it behaves like Prisma where it matters: a filter key
// whose value is `undefined` is dropped (that is how a missing branchId used
// to turn "this branch's order" into "any order"). Any write is a test
// failure — a foreign order must never be touched.

const A_RESTAURANT = 'rest-A';
const A_BRANCH = 'branch-A';
const B_RESTAURANT = 'rest-B';
const B_BRANCH = 'branch-B';
const A_ORDER = 'order-A';
const B_ORDER = 'order-B';

const rows: Record<string, any[]> = {
  branch: [
    { id: A_BRANCH, restaurantId: A_RESTAURANT, name: 'A main' },
    { id: B_BRANCH, restaurantId: B_RESTAURANT, name: 'B main' },
  ],
  order: [
    { id: A_ORDER, branchId: A_BRANCH, orderNumber: 'A-1', status: 'OPEN', acceptance: 'PENDING', items: [], payments: [], kots: [] },
    { id: B_ORDER, branchId: B_BRANCH, orderNumber: 'B-1', status: 'OPEN', acceptance: 'PENDING', items: [], payments: [], kots: [] },
  ],
  kot: [
    { id: 'kot-B', orderId: B_ORDER, status: 'NEW', printedCount: 0, order: { branchId: B_BRANCH }, items: [] },
  ],
};

function matches(row: any, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, cond]) => {
    if (cond === undefined) return true; // Prisma drops undefined filters
    if (key === 'OR') return (cond as any[]).some((c) => matches(row, c));
    if (key === 'AND') return (cond as any[]).every((c) => matches(row, c));
    const value = row[key];
    if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as any;
      if ('in' in c) return c.in.includes(value);
      if ('not' in c) return value !== c.not;
      if ('equals' in c) return value === c.equals;
      if (value !== null && typeof value === 'object') return matches(value, c);
      return true; // gte/lte/etc. are irrelevant here
    }
    return value === cond;
  });
}

function fakePrisma() {
  const writes: string[] = [];
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => {
          const list = rows[name] ?? [];
          switch (method) {
            case 'findFirst':
            case 'findUnique':
              return async (args: any = {}) => list.find((r) => matches(r, args.where)) ?? null;
            case 'findFirstOrThrow':
            case 'findUniqueOrThrow':
              return async (args: any = {}) => {
                const r = list.find((x) => matches(x, args.where));
                if (!r) throw new NotFoundException(`${name} not found`);
                return r;
              };
            case 'findMany':
              return async (args: any = {}) => list.filter((r) => matches(r, args.where));
            case 'count':
              return async (args: any = {}) => list.filter((r) => matches(r, args.where)).length;
            case 'aggregate':
            case 'groupBy':
              return async () => ({ _sum: {}, _count: 0 });
            default:
              return async () => {
                writes.push(`${name}.${method}`);
                throw new Error(`unexpected write ${name}.${method}`);
              };
          }
        },
      },
    );
  const prisma: any = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        if (prop === '$transaction') {
          return async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg));
        }
        if (prop === 'then') return undefined;
        return model(prop);
      },
    },
  );
  return { prisma, writes };
}

const userA: any = {
  id: 'user-A',
  restaurantId: A_RESTAURANT,
  roleName: 'OWNER',
  permissions: ['orders.create', 'orders.edit', 'orders.cancel', 'orders.accept', 'bills.print', 'discounts.apply', 'discounts.unlimited', 'orders.refund'],
};

function build() {
  const { prisma, writes } = fakePrisma();
  const realtime: any = { emitToBranch: jest.fn() };
  const kotPrint = new KotPrintService(prisma, realtime);
  const orders = new OrdersService(
    prisma,
    realtime,
    {} as any,
    {} as any,
    { record: jest.fn() } as any,
    { notifyByPermission: jest.fn() } as any,
    {} as any,
    { emitForBranch: jest.fn() } as any,
    {} as any,
    {} as any,
    kotPrint,
  );
  const branchAccess = new BranchAccessService(prisma);
  const controller = new OrdersController(orders, branchAccess, kotPrint, {} as any);
  return { controller, writes };
}

const res: any = { setHeader: jest.fn(), type: () => ({ send: jest.fn() }), send: jest.fn() };

// Every order-by-id route, called as user A for order `id` in branch `branchId`.
const routes: Record<string, (c: OrdersController, branchId: any, id: string) => Promise<unknown>> = {
  getOrder: (c, b, id) => c.getOrder(userA, b, id),
  addItems: (c, b, id) => c.addItems(userA, b, id, { items: [{ menuItemId: 'm1', quantity: 1, modifierIds: [] }] }),
  accept: (c, b, id) => c.accept(userA, b, id, 'browser'),
  reject: (c, b, id) => c.reject(userA, b, id, { reason: 'x' }),
  cancel: (c, b, id) => c.cancel(userA, b, id, { reason: 'x' }),
  patch: (c, b, id) => c.update(userA, b, id, { notes: 'x' }),
  discountPreview: (c, b, id) => c.discountPreview(userA, b, id, {}),
  billPreview: (c, b, id) => c.billPreview(userA, b, id, {}),
  checkout: (c, b, id) => c.checkout(userA, b, id, { payments: [{ method: 'CASH', amount: 1 }] }),
  receipt: (c, b, id) => c.receipt(userA, b, id, {}, res),
  kot: (c, b, id) => c.kot(userA, b, id, res),
  kotForOneTicket: (c, b, id) => c.kot(userA, b, id, res, undefined, undefined, undefined, 'kot-B'),
  printBill: (c, b, id) => c.printUsb(userA, b, id),
  printKot: (c, b, id) => c.printKot(userA, b, id),
  printKotDevice: (c, b, id) => c.printKot(userA, b, id, 'true', 'device', 'html', '80mm', undefined, 'true', undefined, 'kot-B'),
  printKotUsb: (c, b, id) => c.printKotUsb(userA, b, id),
  refund: (c, b, id) => c.refund(userA, b, id, { amount: 1, reason: 'x', method: 'CASH' }),
  merge: (c, b, id) => c.merge(userA, b, id, { sourceOrderId: A_ORDER }),
  mergeForeignSource: (c, b) => c.merge(userA, b, A_ORDER, { sourceOrderId: B_ORDER }),
};

describe('BranchAccessService.assertAccess', () => {
  const { prisma } = fakePrisma();
  const svc = new BranchAccessService(prisma);

  it.each([undefined, null, '', '   ', ['branch-A', 'branch-B'], 42])('rejects branchId %p with 400', async (b) => {
    await expect(svc.assertAccess(A_RESTAURANT, b as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects another restaurant’s branch with 403', async () => {
    await expect(svc.assertAccess(A_RESTAURANT, B_BRANCH)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('accepts its own branch', async () => {
    await expect(svc.assertAccess(A_RESTAURANT, A_BRANCH)).resolves.toBeUndefined();
  });
});

describe('GET /orders/manage tenant scope', () => {
  it('returns 400 without branchId (used to list every restaurant’s orders)', async () => {
    const { controller } = build();
    await expect(controller.listForManagement(userA, undefined as any, 'all')).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.listForManagement(userA, '' as any, 'all')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns 403 for another restaurant’s branch', async () => {
    const { controller } = build();
    await expect(controller.listForManagement(userA, B_BRANCH, 'all')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('returns only the caller’s own orders', async () => {
    const { controller } = build();
    const list = (await controller.listForManagement(userA, A_BRANCH, 'active')) as any[];
    // 'active' excludes PENDING; use 'pending' to see order A.
    const pending = (await controller.listForManagement(userA, A_BRANCH, 'pending')) as any[];
    expect([...list, ...pending].map((o) => o.id)).toEqual([A_ORDER]);
  });
});

describe('order-by-id routes: knowing an order id is not authorization', () => {
  for (const [name, call] of Object.entries(routes)) {
    it(`${name}: missing branchId → 400`, async () => {
      const { controller, writes } = build();
      await expect(call(controller, undefined, B_ORDER)).rejects.toBeInstanceOf(BadRequestException);
      expect(writes).toEqual([]);
    });

    it(`${name}: restaurant B's branchId → 403`, async () => {
      const { controller, writes } = build();
      await expect(call(controller, B_BRANCH, B_ORDER)).rejects.toBeInstanceOf(ForbiddenException);
      expect(writes).toEqual([]);
    });

    it(`${name}: own branchId + restaurant B's order id → 404, nothing changed`, async () => {
      const { controller, writes } = build();
      await expect(call(controller, A_BRANCH, B_ORDER)).rejects.toBeInstanceOf(NotFoundException);
      expect(writes).toEqual([]);
    });
  }

  it('getOrder still returns the caller’s own order', async () => {
    const { controller } = build();
    const o = (await controller.getOrder(userA, A_BRANCH, A_ORDER)) as any;
    expect(o.id).toBe(A_ORDER);
  });
});
