import { Prisma } from '@prisma/client';
import { OrdersService } from './orders.service';
import { PublicMenuService } from '../public/public-menu.service';

// One logical order (one client requestId) = one server order, also when two
// attempts race. Prisma is mocked; no database.
describe('OrdersService.createOrder request-id dedup', () => {
  function make() {
    const prisma: any = { order: { findFirst: jest.fn() } };
    const svc = Object.create(OrdersService.prototype) as OrdersService;
    (svc as any).prisma = prisma;
    jest.spyOn(svc, 'getOrder').mockImplementation(async (_b, id) => ({ id }) as any);
    return { svc, prisma };
  }
  const dto: any = { type: 'TAKEAWAY', items: [{ menuItemId: 'm', quantity: 1, modifierIds: [] }] };

  it('passes the body requestId through as the stored clientRequestId', async () => {
    const { svc } = make();
    const once = jest.spyOn(svc as any, 'createOrderOnce').mockResolvedValue({ id: 'o1' });
    await svc.createOrder('b1', 'u1', { ...dto, requestId: 'pos_abc12345' });
    expect(once.mock.calls[0][3]).toMatchObject({ clientRequestId: 'pos_abc12345' });
  });

  it('QR orders (clientRequestId in the body) are stored with their id too', async () => {
    const { svc } = make();
    const once = jest.spyOn(svc as any, 'createOrderOnce').mockResolvedValue({ id: 'o1' });
    await svc.createOrder('b1', 'u1', { ...dto, clientRequestId: 'req_123_abcdefg' }, { channel: 'ONLINE' });
    expect(once.mock.calls[0][3]).toMatchObject({ clientRequestId: 'req_123_abcdefg', channel: 'ONLINE' });
  });

  it('a racing duplicate (unique index P2002) returns the order the winner saved', async () => {
    const { svc, prisma } = make();
    jest.spyOn(svc as any, 'createOrderOnce').mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x', meta: { target: ['branchId', 'clientRequestId'] } }),
    );
    prisma.order.findFirst.mockResolvedValue({ id: 'winner' });
    const out: any = await svc.createOrder('b1', 'u1', { ...dto, requestId: 'pos_race0001' });
    expect(out.id).toBe('winner');
    expect(prisma.order.findFirst).toHaveBeenCalledWith({ where: { branchId: 'b1', clientRequestId: 'pos_race0001' }, select: { id: true } });
  });

  it('other errors (and P2002 without a request id) are not swallowed', async () => {
    const { svc } = make();
    jest.spyOn(svc as any, 'createOrderOnce').mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }),
    );
    await expect(svc.createOrder('b1', 'u1', dto)).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('findByRequestId is branch-scoped and ignores malformed ids', async () => {
    const { svc, prisma } = make();
    prisma.order.findFirst.mockResolvedValue({ id: 'o9' });
    expect(await svc.findByRequestId('b1', 'pos_abc12345')).toEqual({ id: 'o9' });
    expect(prisma.order.findFirst).toHaveBeenCalledWith({ where: { branchId: 'b1', clientRequestId: 'pos_abc12345' }, select: { id: true } });
    prisma.order.findFirst.mockClear();
    expect(await svc.findByRequestId('b1', "x' or 1=1")).toBeNull();
    expect(prisma.order.findFirst).not.toHaveBeenCalled();
    await expect(svc.findByRequestId('' as any, 'pos_abc12345')).rejects.toThrow();
  });
});

describe('QR guest order: the same request id never makes a second order', () => {
  it('a retry with the same requestId returns the first order without creating', async () => {
    const table = { id: 't1', number: 2, status: 'OCCUPIED', assignedWaiterId: null, floor: { branchId: 'b1', branch: { id: 'b1', isActive: true } } };
    const prisma: any = {
      table: { findUnique: jest.fn().mockResolvedValue(table) },
      order: { findFirst: jest.fn().mockResolvedValueOnce({ id: 'first', items: [] }) },
    };
    const orders: any = { createOrder: jest.fn(), addItems: jest.fn(), resolveOrCreateCustomer: jest.fn() };
    const svc = new PublicMenuService(prisma, orders, { notifyByPermission: jest.fn() } as any, { emitToBranch: jest.fn() } as any);
    const out: any = await svc.createOrder('tbl-token', [{ menuItemId: 'm', quantity: 1, modifierIds: [] }] as any, 'G', undefined, 'req_1_abcdefgh');
    expect(out.id).toBe('first');
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(orders.addItems).not.toHaveBeenCalled();
  });
});
