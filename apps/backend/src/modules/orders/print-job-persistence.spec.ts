import { KotPrintService } from './kot-print.service';
import { OrdersService } from './orders.service';
import { ConflictException } from '@nestjs/common';

describe('B5: Print Job Persistence & Safeguards', () => {
  let kotPrintService: KotPrintService;
  let ordersService: OrdersService;
  let mockPrisma: any;
  let mockRealtime: any;

  beforeEach(() => {
    mockPrisma = {
      kot: {
        findMany: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      order: {
        findFirst: jest.fn(),
      },
      printJob: {
        create: jest.fn().mockResolvedValue({ id: 'job-1', status: 'SENT' }),
      },
      branch: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
    };
    mockRealtime = {
      emitToBranch: jest.fn(),
    };
    kotPrintService = new KotPrintService(mockPrisma as any, mockRealtime as any);
  });

  it('dedupes double accept: throws ALREADY_PRINTED and does not resend bytes', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'ord-1' });
    // First print already has printedCount = 1
    mockPrisma.kot.findMany.mockResolvedValue([
      {
        id: 'kot-1',
        ticketNumber: '101',
        printedCount: 1,
        status: 'NEW',
        order: { branchId: 'b-1' },
      },
    ]);

    await expect(
      kotPrintService.printOrder('b-1', 'ord-1', false),
    ).rejects.toThrow(ConflictException);

    // No print job created for duplicate
    expect(mockPrisma.printJob.create).not.toHaveBeenCalled();
  });

  it('manual reprint stamps reprint count and persists job', async () => {
    mockPrisma.order.findFirst.mockResolvedValue({ id: 'ord-1' });
    const mockKot = {
      id: 'kot-1',
      ticketNumber: '101',
      printedCount: 1,
      status: 'NEW',
      items: [],
      order: {
        id: 'ord-1',
        orderNumber: '001',
        type: 'DINE_IN',
        createdAt: new Date(),
        branch: {
          name: 'Main',
          printerConnection: 'USB',
          printerPaperWidthMm: 80,
          printerCodepage: 'CP858',
          printerColumns: null,
        },
      },
    };
    mockPrisma.kot.findMany.mockResolvedValue([mockKot]);
    mockPrisma.kot.update.mockResolvedValue({ id: 'kot-1', printedCount: 2 });

    // Mock sendToBranchPrinter
    jest.spyOn(require('./printer-transport'), 'sendToBranchPrinter').mockResolvedValue(undefined);

    const result = await kotPrintService.printOrder('b-1', 'ord-1', true);
    expect(result.printed[0].reprint).toBe(1);
    expect(mockPrisma.printJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branchId: 'b-1',
          orderId: 'ord-1',
          kotId: 'kot-1',
          jobType: 'KOT',
          status: 'SENT',
          reprint: true,
        }),
      }),
    );
  });

  it('staff confirmation sets CONFIRMED_BY_STAFF on branch', async () => {
    const service = new OrdersService(
      mockPrisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      kotPrintService,
    );

    mockPrisma.branch.update.mockResolvedValue({
      id: 'b-1',
      printerStatus: 'CONFIRMED_BY_STAFF',
    });

    const res = await service.confirmPrintStatus('b-1', 'KITCHEN', true);
    expect(mockPrisma.branch.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { printerStatus: 'CONFIRMED_BY_STAFF' },
    });
    expect(res.printerStatus).toBe('CONFIRMED_BY_STAFF');
  });

  it('staff confirmation failure sets FAILED on bill printer', async () => {
    const service = new OrdersService(
      mockPrisma as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      kotPrintService,
    );

    mockPrisma.branch.update.mockResolvedValue({
      id: 'b-1',
      billPrinterStatus: 'FAILED',
    });

    const res = await service.confirmPrintStatus('b-1', 'BILL', false);
    expect(mockPrisma.branch.update).toHaveBeenCalledWith({
      where: { id: 'b-1' },
      data: { billPrinterStatus: 'FAILED' },
    });
    expect(res.billPrinterStatus).toBe('FAILED');
  });
});
