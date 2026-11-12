import { OrdersService } from './orders.service';

// Past orders' guest name + phone copied into Customers. Prisma is mocked.
describe('OrdersService.backfillCustomersFromOrders', () => {
  function make(orders: any[]) {
    const prisma: any = {
      order: {
        findMany: jest.fn().mockResolvedValue(orders),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const svc = Object.create(OrdersService.prototype) as OrdersService;
    (svc as any).prisma = prisma;
    (svc as any).logger = { warn: jest.fn() };
    const resolve = jest
      .spyOn(svc, 'resolveOrCreateCustomer')
      .mockImplementation(async (_b, p) => `cust-${p.phone}`);
    return { svc, prisma, resolve };
  }

  it('links each order with a phone to its customer, only inside the branch', async () => {
    const { svc, prisma, resolve } = make([
      { id: 'o1', guestName: 'Priya', deliveryPhone: '+91 98765 43210' },
      { id: 'o2', guestName: 'Rahul', deliveryPhone: '9123456789' },
    ]);
    const r = await svc.backfillCustomersFromOrders('b1');
    expect(r).toEqual({ scanned: 2, linked: 2, skipped: 0 });
    expect(prisma.order.findMany.mock.calls[0][0].where).toMatchObject({ branchId: 'b1', customerId: null });
    expect(resolve).toHaveBeenCalledWith('b1', { name: 'Priya', phone: '+91 98765 43210' });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', branchId: 'b1', customerId: null },
      data: { customerId: 'cust-+91 98765 43210' },
    });
  });

  it('skips numbers that are not real phones and never fails the whole run', async () => {
    const { svc, resolve } = make([
      { id: 'o1', guestName: 'X', deliveryPhone: '12' },
      { id: 'o2', guestName: 'Y', deliveryPhone: '9123456789' },
    ]);
    resolve.mockRejectedValueOnce(new Error('db busy'));
    const r = await svc.backfillCustomersFromOrders('b1');
    expect(r.linked + r.skipped).toBe(2);
    expect(r.skipped).toBeGreaterThanOrEqual(1);
  });

  it('refuses to run without a branch', async () => {
    const { svc } = make([]);
    await expect(svc.backfillCustomersFromOrders('' as any)).rejects.toThrow();
  });
});
