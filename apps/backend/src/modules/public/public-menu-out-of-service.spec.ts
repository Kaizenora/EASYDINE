import { ConflictException } from '@nestjs/common';
import { OUT_OF_SERVICE_MESSAGE, PublicMenuService } from './public-menu.service';

// A guest scanning the QR of a table staff marked Out of service gets the
// notice only: no menu, no check-in, no new order. Existing orders of that
// table are not touched (nothing is written at all).
describe('PublicMenuService - out-of-service table', () => {
  const table = {
    id: 'tbl-9',
    number: '9',
    name: null,
    status: 'OUT_OF_SERVICE',
    qrToken: 'qr-9',
    assignedWaiterId: null,
    floor: { branchId: 'branch-1', branch: { id: 'branch-1', name: 'Main', restaurant: { name: 'Cafe' } } },
  };
  let prisma: any;
  let orders: any;
  let service: PublicMenuService;

  beforeEach(() => {
    prisma = {
      table: { findUnique: jest.fn().mockResolvedValue(table), update: jest.fn() },
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'open-1', status: 'OPEN' }), update: jest.fn() },
      userBranch: { findFirst: jest.fn().mockResolvedValue({ userId: 'u1' }) },
      menuCategory: { findMany: jest.fn().mockResolvedValue([{ id: 'c1' }]) },
    };
    orders = { createOrder: jest.fn(), addItems: jest.fn(), resolveOrCreateCustomer: jest.fn() };
    service = new PublicMenuService(prisma, orders, { notifyByPermission: jest.fn() } as any, { emitToBranch: jest.fn() } as any);
  });

  it('menu returns only the out-of-service notice, no categories', async () => {
    const menu: any = await service.getMenuByQrToken('qr-9');
    expect(menu.outOfService).toBe(true);
    expect(menu.message).toBe('This table is out of service. Please move to another table. Thank you.');
    expect(menu.message).toBe(OUT_OF_SERVICE_MESSAGE);
    expect(menu.categories).toEqual([]);
    expect(prisma.menuCategory.findMany).not.toHaveBeenCalled();
  });

  it('check-in does not mark the table occupied', async () => {
    const r: any = await service.checkIn('qr-9', 'Asha', '9876543210');
    expect(r.outOfService).toBe(true);
    expect(prisma.table.update).not.toHaveBeenCalled();
    expect(orders.resolveOrCreateCustomer).not.toHaveBeenCalled();
  });

  it('blocks new orders and adding to the open order', async () => {
    await expect(
      service.createOrder('qr-9', [{ menuItemId: 'm1', quantity: 1, modifierIds: [] }] as any),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(orders.createOrder).not.toHaveBeenCalled();
    expect(orders.addItems).not.toHaveBeenCalled();
    expect(prisma.order.update).not.toHaveBeenCalled();
  });

  it('an available table still orders normally', async () => {
    prisma.table.findUnique.mockResolvedValue({ ...table, status: 'AVAILABLE' });
    prisma.order.findFirst.mockResolvedValue(null);
    orders.createOrder.mockResolvedValue({ id: 'new' });
    await service.createOrder('qr-9', [{ menuItemId: 'm1', quantity: 1, modifierIds: [] }] as any);
    expect(orders.createOrder).toHaveBeenCalledTimes(1);
  });
});
