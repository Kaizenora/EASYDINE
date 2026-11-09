import { PublicMenuService } from './public-menu.service';

describe('PublicMenuService - First QR order guestPhone persistence', () => {
  let service: PublicMenuService;
  let prisma: any;
  let ordersService: any;
  let notifications: any;
  let realtime: any;

  const mockTable = {
    id: 'tbl-1',
    number: '5',
    qrToken: 'test-qr-token',
    floor: { branchId: 'branch-1' },
  };

  beforeEach(() => {
    prisma = {
      table: {
        findUnique: jest.fn().mockResolvedValue(mockTable),
        findFirst: jest.fn().mockResolvedValue(mockTable),
      },
      order: {
        findFirst: jest.fn().mockResolvedValue(null), // First QR order (no open order yet)
      },
      userBranch: {
        findFirst: jest.fn().mockResolvedValue({ userId: 'staff-auto' }),
      },
    };

    ordersService = {
      createOrder: jest.fn().mockImplementation((branchId, userId, dto) => {
        return Promise.resolve({
          id: 'ord-123',
          orderNumber: '20261109-0001',
          branchId,
          tableId: dto.tableId,
          guestName: dto.guestName,
          deliveryPhone: dto.guestPhone ?? null,
          status: 'OPEN',
          acceptance: 'PENDING',
        });
      }),
      addItems: jest.fn(),
    };

    notifications = { notifyByPermission: jest.fn() };
    realtime = { emitToBranch: jest.fn() };

    service = new PublicMenuService(prisma, ordersService, notifications, realtime);
  });

  it('persists guestPhone on first QR order when provided', async () => {
    const items = [{ menuItemId: 'item-1', quantity: 2 }];
    const order = await service.createOrder(
      'test-qr-token',
      items,
      'Siddharth',
      '+91 9876543210',
      'req-001',
      'Extra spicy',
    );

    expect(ordersService.createOrder).toHaveBeenCalledWith(
      'branch-1',
      'staff-auto',
      expect.objectContaining({
        type: 'QR_ORDER',
        tableId: 'tbl-1',
        guestName: 'Siddharth',
        guestPhone: '+91 9876543210',
        notes: 'Extra spicy',
      }),
      { channel: 'ONLINE' },
    );

    expect(order.deliveryPhone).toBe('+91 9876543210');
    expect(order.guestName).toBe('Siddharth');
  });

  it('ordering works seamlessly without guestPhone (optional, never blocks)', async () => {
    const items = [{ menuItemId: 'item-1', quantity: 1 }];
    const order = await service.createOrder(
      'test-qr-token',
      items,
      undefined,
      undefined,
      'req-002',
    );

    expect(ordersService.createOrder).toHaveBeenCalledWith(
      'branch-1',
      'staff-auto',
      expect.objectContaining({
        type: 'QR_ORDER',
        tableId: 'tbl-1',
        guestName: 'Guest',
        guestPhone: undefined,
      }),
      { channel: 'ONLINE' },
    );

    expect(order.deliveryPhone).toBeNull();
    expect(order.guestName).toBe('Guest');
  });
});
