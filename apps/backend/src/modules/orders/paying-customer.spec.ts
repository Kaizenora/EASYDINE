import { BadRequestException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { PublicMenuService } from '../public/public-menu.service';

// Customer details saved at payment (dine-in QR, takeaway QR, POS takeaway).
// Prisma is mocked; no database.

function makeOrders(customers: { id: string; branchId: string; name: string | null }[]) {
  const prisma: any = {
    customer: {
      findFirst: jest.fn(async ({ where }: any) =>
        customers.find((c) => c.id === where.id && c.branchId === where.branchId) ?? null,
      ),
      update: jest.fn(async ({ where, data }: any) => {
        const c = customers.find((x) => x.id === where.id)!;
        Object.assign(c, data);
        return c;
      }),
    },
  };
  const svc = Object.create(OrdersService.prototype) as OrdersService;
  (svc as any).prisma = prisma;
  const resolve = jest
    .spyOn(svc, 'resolveOrCreateCustomer')
    .mockImplementation(async (_b, p) => (p.phone ? `cust-${p.phone}` : p.name ? 'cust-name-only' : null));
  return { svc, prisma, resolve, customers };
}

const order = (o: Partial<{ customerId: string | null; guestName: string | null; deliveryPhone: string | null }> = {}) => ({
  customerId: null,
  guestName: null,
  deliveryPhone: null,
  ...o,
});

describe('OrdersService.resolvePayingCustomer', () => {
  it('QR dine-in/takeaway: the guest details on the order are saved when nothing is typed', async () => {
    const { svc, resolve } = makeOrders([]);
    const id = await svc.resolvePayingCustomer('b1', order({ guestName: 'Priya', deliveryPhone: '9876543210' }), {});
    expect(id).toBe('cust-9876543210');
    expect(resolve).toHaveBeenCalledWith('b1', { name: 'Priya', phone: '9876543210' });
  });

  it('keeps the QR customer already linked to the order', async () => {
    const { svc, resolve } = makeOrders([{ id: 'qr-cust', branchId: 'b1', name: 'Priya' }]);
    const id = await svc.resolvePayingCustomer('b1', order({ customerId: 'qr-cust' }), {});
    expect(id).toBe('qr-cust');
    expect(resolve).not.toHaveBeenCalled();
  });

  it('takeaway: name and phone the cashier typed on the bill are saved', async () => {
    const { svc, resolve } = makeOrders([]);
    const id = await svc.resolvePayingCustomer('b1', order({ guestName: 'Takeaway Guest' }), {
      customerName: 'Rahul',
      customerPhone: '+91 98765-43210',
    });
    expect(id).toBe('cust-9876543210');
    expect(resolve).toHaveBeenCalledWith('b1', { name: 'Rahul', phone: '9876543210' });
  });

  it('a phone typed on the bill wins over the customer the order carried', async () => {
    const { svc } = makeOrders([{ id: 'qr-cust', branchId: 'b1', name: 'Priya' }]);
    const id = await svc.resolvePayingCustomer('b1', order({ customerId: 'qr-cust' }), {
      customerName: 'Rahul',
      customerPhone: '9123456789',
    });
    expect(id).toBe('cust-9123456789');
  });

  it('a name typed for a placeholder customer fills it in; a real name is never overwritten', async () => {
    const { svc, customers } = makeOrders([
      { id: 'c-guest', branchId: 'b1', name: 'Guest' },
      { id: 'c-real', branchId: 'b1', name: 'Priya' },
    ]);
    await svc.resolvePayingCustomer('b1', order({ customerId: 'c-guest' }), { customerName: 'Rahul' });
    await svc.resolvePayingCustomer('b1', order({ customerId: 'c-real' }), { customerName: 'Rahul' });
    expect(customers.find((c) => c.id === 'c-guest')!.name).toBe('Rahul');
    expect(customers.find((c) => c.id === 'c-real')!.name).toBe('Priya');
  });

  it('a customer picked on the bill wins; one from another branch is refused', async () => {
    const { svc } = makeOrders([
      { id: 'picked', branchId: 'b1', name: 'Asha' },
      { id: 'other-branch', branchId: 'b2', name: 'X' },
    ]);
    expect(await svc.resolvePayingCustomer('b1', order({ customerId: 'qr-cust' }), { customerId: 'picked' })).toBe('picked');
    await expect(
      svc.resolvePayingCustomer('b1', order(), { customerId: 'other-branch' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('a true walk-in with nothing typed stays anonymous', async () => {
    const { svc } = makeOrders([]);
    expect(await svc.resolvePayingCustomer('b1', order(), {})).toBeNull();
  });
});

describe('QR guest phone is normalised, not cut to the first 10 digits', () => {
  const TOKEN = 'a'.repeat(32);
  function makePublic() {
    const branch = { id: 'b1', isActive: true, takeawayToken: TOKEN, restaurant: { name: 'R', approvalStatus: 'APPROVED' } };
    const table = { id: 't1', number: 4, name: null, status: 'AVAILABLE', floor: { branchId: 'b1', branch } };
    const prisma: any = {
      branch: { findUnique: jest.fn().mockResolvedValue(branch) },
      table: { findUnique: jest.fn().mockResolvedValue(table), update: jest.fn().mockResolvedValue({}) },
      order: { findFirst: jest.fn().mockResolvedValue(null) },
      userBranch: { findFirst: jest.fn().mockResolvedValue({ userId: 'staff' }) },
    };
    const ordersService: any = {
      resolveOrCreateCustomer: jest.fn().mockResolvedValue('cust-1'),
      createOrder: jest.fn().mockResolvedValue({ id: 'o1' }),
      addItems: jest.fn(),
    };
    const svc = new PublicMenuService(prisma, ordersService, { notifyByPermission: jest.fn() } as any, { emitToBranch: jest.fn() } as any);
    return { svc, ordersService };
  }
  const items = [{ menuItemId: 'm1', quantity: 1, modifierIds: [] }] as any;

  it('takeaway QR: +91 number saved as the 10-digit mobile', async () => {
    const { svc, ordersService } = makePublic();
    await svc.createOrder(`takeaway-${TOKEN}`, items, 'Rahul', '+91 98765 43210');
    expect(ordersService.resolveOrCreateCustomer).toHaveBeenCalledWith('b1', { name: 'Rahul', phone: '9876543210' });
    expect(ordersService.createOrder.mock.calls[0][2]).toMatchObject({ guestPhone: '9876543210', customerId: 'cust-1' });
  });

  it('dine-in QR: 0-prefixed number saved as the 10-digit mobile', async () => {
    const { svc, ordersService } = makePublic();
    await svc.createOrder('table-token', items, 'Priya', '09876543210');
    expect(ordersService.resolveOrCreateCustomer).toHaveBeenCalledWith('b1', { name: 'Priya', phone: '9876543210' });
  });

  it('check-in with a name only does not create a customer (the order saves it, no duplicate)', async () => {
    const { svc, ordersService } = makePublic();
    await svc.checkIn('table-token', 'Sid');
    expect(ordersService.resolveOrCreateCustomer).not.toHaveBeenCalled();
    await svc.checkIn('table-token', 'Sid', '+91 74993 00147');
    expect(ordersService.resolveOrCreateCustomer).toHaveBeenCalledWith('b1', { name: 'Sid', phone: '7499300147' });
  });
});
