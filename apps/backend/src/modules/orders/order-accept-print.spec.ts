import { ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { KotPrintService } from './kot-print.service';

describe('OrdersService - acceptOrder print pipeline', () => {
  let service: OrdersService;
  let prisma: any;
  let kotPrint: jest.Mocked<KotPrintService>;
  let realtime: any;
  let audit: any;
  let notifications: any;

  beforeEach(() => {
    prisma = {
      order: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'ord-1',
          orderNumber: '101',
          branchId: 'b-1',
          status: 'OPEN',
          acceptance: 'PENDING',
          items: [],
          type: 'DINE_IN',
        }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      menuItem: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      kot: {
        create: jest.fn().mockResolvedValue({ id: 'k-1' }),
      },
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    };

    realtime = { emitToBranch: jest.fn() };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = { notifyByPermission: jest.fn().mockResolvedValue(undefined) };

    kotPrint = {
      printOrder: jest.fn(),
    } as any;

    service = new OrdersService(
      prisma,
      realtime,
      {} as any,
      {} as any,
      audit,
      notifications,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      kotPrint,
    );

    jest.spyOn(service as any, 'generateKots').mockResolvedValue(undefined);
    jest.spyOn(service, 'getOrder').mockResolvedValue({
      id: 'ord-1',
      orderNumber: '101',
      status: 'OPEN',
      acceptance: 'ACCEPTED',
    } as any);
  });

  it('returns printStatus SENT when printer accepts ticket', async () => {
    kotPrint.printOrder.mockResolvedValue({ ok: true, printed: [], unsupportedChars: [] });

    const result = await service.acceptOrder('b-1', 'ord-1', 'u-1');

    expect(result.acceptance).toBe('ACCEPTED');
    expect(result).toHaveProperty('printStatus', 'SENT');
  });

  it('returns printStatus NO_PRINTER when no printer is configured, without rolling back accept', async () => {
    kotPrint.printOrder.mockRejectedValue(
      new ConflictException({ code: 'NO_TICKETS', message: 'No tickets or no printer configured' }),
    );

    const result = await service.acceptOrder('b-1', 'ord-1', 'u-1');

    expect(result.acceptance).toBe('ACCEPTED');
    expect(result).toHaveProperty('printStatus', 'NO_PRINTER');
  });

  it('returns printStatus FAILED when printer offline, without rolling back accept', async () => {
    kotPrint.printOrder.mockRejectedValue(
      new ServiceUnavailableException('Kitchen printer error: paper out'),
    );

    const result = await service.acceptOrder('b-1', 'ord-1', 'u-1');

    expect(result.acceptance).toBe('ACCEPTED');
    expect(result).toHaveProperty('printStatus', 'FAILED');
  });

  it('returns printStatus UNKNOWN on timeout, without rolling back accept', async () => {
    kotPrint.printOrder.mockRejectedValue(new Error('connect ETIMEDOUT 192.168.1.50:9100'));

    const result = await service.acceptOrder('b-1', 'ord-1', 'u-1');

    expect(result.acceptance).toBe('ACCEPTED');
    expect(result).toHaveProperty('printStatus', 'UNKNOWN');
  });
});
