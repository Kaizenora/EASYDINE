import { ConflictException } from '@nestjs/common';
import { readJob } from './escpos/read-job';
import { AWAITING_DEVICE_RESULT, KotPrintService, safeTimeZone } from './kot-print.service';
import { OrdersService } from './orders.service';
import {
  deviceKotResultSchema,
  parseDeviceKotOptions,
  parseKotVia,
} from './device-print-params';
import { buildKotHtml } from './kot.html';
import * as transport from './printer-transport';

// Cashier-PC ("device") KOT printing: tickets are claimed on the server, handed
// to the PC's local print bridge, and the PC reports QUEUED/FAILED/UNKNOWN.

function kotFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'kot-1',
    ticketNumber: '101-1',
    printedCount: 0,
    status: 'NEW',
    station: { name: 'Grill' },
    items: [
      {
        orderItem: {
          nameSnapshot: 'Paneer Tikka (Half)',
          quantity: 2,
          unitPriceSnapshot: '240.00',
          lineTotal: '480.00',
          kitchenNote: 'less spicy',
          modifiers: [{ nameSnapshot: 'Extra cheese', priceAdjSnapshot: '30.00' }],
        },
      },
    ],
    order: {
      id: 'ord-1',
      orderNumber: '101',
      type: 'DINE_IN',
      createdAt: new Date('2026-11-12T08:30:00Z'),
      table: { number: 4, name: null },
      customer: null,
      guestName: null,
      branch: {
        name: 'Main',
        printerConnection: 'USB',
        printerPaperWidthMm: 80,
        printerCodepage: 'CP858',
        printerColumns: 42,
      },
    },
    ...over,
  };
}

describe('Device KOT printing (cashier PC local bridge)', () => {
  let prisma: any;
  let realtime: any;
  let svc: KotPrintService;
  let sendSpy: jest.SpyInstance;

  beforeEach(() => {
    prisma = {
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'ord-1' }) },
      kot: {
        findMany: jest.fn().mockResolvedValue([kotFixture()]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockImplementation(async ({ where }) => ({ id: where.id, printedCount: 1 })),
      },
      printJob: { create: jest.fn().mockResolvedValue({}) },
    };
    realtime = { emitToBranch: jest.fn() };
    svc = new KotPrintService(prisma, realtime);
    sendSpy = jest.spyOn(transport, 'sendToBranchPrinter').mockResolvedValue(undefined);
  });

  afterEach(() => sendSpy.mockRestore());

  it('claims the ticket, returns bytes for the device and never uses the server printer', async () => {
    const r = await svc.printOrder('b-1', 'ord-1', false, true, { format: 'escpos', paper: '58mm', track: true });
    expect(sendSpy).not.toHaveBeenCalled();
    expect(r.escpos).toHaveLength(1);
    expect(r.printed).toEqual([{ id: 'kot-1', ticketNumber: '101-1', reprint: 0 }]);
    expect(prisma.kot.updateMany).toHaveBeenCalledWith({
      where: { id: 'kot-1', printedCount: 0 },
      data: expect.objectContaining({ printedCount: 1, lastPrintError: AWAITING_DEVICE_RESULT }),
    });
    // Until the PC reports, the ticket honestly says the outcome is unknown.
    expect(prisma.kot.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ lastPrintError: AWAITING_DEVICE_RESULT }) }),
    );
  });

  it('a 58 mm device ticket is laid out for 58 mm, independent of the branch width', async () => {
    const r58 = await svc.printOrder('b-1', 'ord-1', false, true, { format: 'escpos', paper: '58mm' });
    prisma.kot.findMany.mockResolvedValue([kotFixture()]);
    const r80 = await svc.printOrder('b-1', 'ord-1', false, true, { format: 'escpos', paper: '80mm' });
    // Text lines only: readJob skips the raster logo's image bytes.
    const longest = (b64: string) => Math.max(...readJob(Buffer.from(b64, 'base64')).lines.map((l) => l.length));
    expect(longest(r58.escpos![0])).toBeLessThan(longest(r80.escpos![0]));
  });

  it('html format returns a rendered ticket with items, quantities, variants and notes but no prices', async () => {
    const r = await svc.printOrder('b-1', 'ord-1', false, true, { format: 'html', paper: 'A4', timeZone: 'Asia/Kolkata' });
    expect(r.escpos).toBeUndefined();
    const html = r.html![0];
    expect(html).toContain('Paneer Tikka (Half)');
    expect(html).toContain('2×');
    expect(html).toContain('Extra cheese');
    expect(html).toContain('less spicy');
    expect(html).toContain('#101');
    expect(html).toContain('Table');
    expect(html).toContain('Ticket 101-1 - Grill');
    expect(html).toContain('size: A4');
    expect(html).not.toMatch(/240|480|30\.00|₹/);
  });

  it('a second request for an already-claimed ticket gets ALREADY_PRINTED and no bytes (double click / retry)', async () => {
    prisma.kot.findMany.mockResolvedValue([kotFixture({ printedCount: 1 })]);
    await expect(svc.printOrder('b-1', 'ord-1', false, true, { track: true })).rejects.toThrow(ConflictException);
  });

  it('a concurrent claim that loses the race gets nothing', async () => {
    prisma.kot.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.printOrder('b-1', 'ord-1', false, true, { track: true })).rejects.toThrow(ConflictException);
  });

  describe('recordDeviceResult', () => {
    beforeEach(() => {
      prisma.kot.findMany.mockResolvedValue([{ id: 'kot-1', printedCount: 1 }]);
    });

    it('QUEUED clears the pending note and keeps the claim', async () => {
      const r = await svc.recordDeviceResult('b-1', 'ord-1', {
        results: [{ kotId: 'kot-1', status: 'QUEUED' }],
        reprint: false,
        printerName: 'Kitchen Thermal',
        deviceId: 'dev-1',
      });
      expect(r.recorded).toEqual([{ kotId: 'kot-1', status: 'QUEUED' }]);
      expect(prisma.kot.update).toHaveBeenCalledWith({ where: { id: 'kot-1' }, data: { lastPrintError: null } });
      expect(prisma.printJob.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'QUEUED', target: 'DEVICE:Kitchen Thermal@dev-1' }) }),
      );
    });

    it('FAILED on a first print releases the claim so an explicit print can send it', async () => {
      await svc.recordDeviceResult('b-1', 'ord-1', {
        results: [{ kotId: 'kot-1', status: 'FAILED', error: 'Printer not found' }],
        reprint: false,
        printerName: 'Kitchen Thermal',
        deviceId: null,
      });
      expect(prisma.kot.update).toHaveBeenCalledWith({
        where: { id: 'kot-1' },
        data: expect.objectContaining({ printedCount: 0, printedAt: null, lastPrintError: expect.stringContaining('Printer not found') }),
      });
    });

    it('FAILED on a reprint never touches the print count', async () => {
      prisma.kot.findMany.mockResolvedValue([{ id: 'kot-1', printedCount: 2 }]);
      await svc.recordDeviceResult('b-1', 'ord-1', {
        results: [{ kotId: 'kot-1', status: 'FAILED', error: 'x' }],
        reprint: true,
        printerName: 'K',
        deviceId: null,
      });
      expect(prisma.kot.update.mock.calls[0][0].data).not.toHaveProperty('printedCount');
    });

    it('UNKNOWN keeps the claim (no silent second copy) and says so', async () => {
      await svc.recordDeviceResult('b-1', 'ord-1', {
        results: [{ kotId: 'kot-1', status: 'UNKNOWN', error: 'timed out' }],
        reprint: false,
        printerName: 'K',
        deviceId: null,
      });
      const data = prisma.kot.update.mock.calls[0][0].data;
      expect(data).not.toHaveProperty('printedCount');
      expect(data.lastPrintError).toMatch(/unknown/i);
    });

    it('ignores tickets of another order or branch (branch isolation)', async () => {
      prisma.kot.findMany.mockResolvedValue([]);
      const r = await svc.recordDeviceResult('b-2', 'ord-1', {
        results: [{ kotId: 'kot-1', status: 'QUEUED' }],
        reprint: false,
        printerName: 'K',
        deviceId: null,
      });
      expect(prisma.kot.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ orderId: 'ord-1', order: { branchId: 'b-2' } }) }),
      );
      expect(r.recorded).toEqual([]);
      expect(prisma.kot.update).not.toHaveBeenCalled();
    });
  });
});

describe('acceptOrder routing of kitchen tickets', () => {
  let prisma: any;
  let kotPrint: any;
  let service: OrdersService;

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
      $transaction: jest.fn().mockImplementation(async (cb) => cb(prisma)),
    };
    kotPrint = { printOrder: jest.fn() };
    service = new OrdersService(
      prisma,
      { emitToBranch: jest.fn() } as any,
      {} as any,
      {} as any,
      { record: jest.fn() } as any,
      { notifyByPermission: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      kotPrint,
    );
    jest.spyOn(service as any, 'generateKots').mockResolvedValue(undefined);
    jest.spyOn(service, 'getOrder').mockResolvedValue({ id: 'ord-1', acceptance: 'ACCEPTED' } as any);
  });

  it('device: hands claimed tickets to the PC and does not print on the server', async () => {
    kotPrint.printOrder.mockResolvedValue({ ok: true, printed: [{ id: 'k1' }], escpos: ['AA=='], unsupportedChars: [] });
    const r: any = await service.acceptOrder('b-1', 'ord-1', 'u-1', { via: 'device', device: { format: 'escpos', paper: '80mm' } });
    expect(kotPrint.printOrder).toHaveBeenCalledTimes(1);
    expect(kotPrint.printOrder).toHaveBeenCalledWith('b-1', 'ord-1', false, true, { format: 'escpos', paper: '80mm', track: true });
    expect(r.printStatus).toBe('DEVICE');
    expect(r.deviceKot.escpos).toEqual(['AA==']);
    expect(r.acceptance).toBe('ACCEPTED');
  });

  it('none: accepts without printing anywhere (missing printer is never replaced)', async () => {
    const r: any = await service.acceptOrder('b-1', 'ord-1', 'u-1', { via: 'none' });
    expect(kotPrint.printOrder).not.toHaveBeenCalled();
    expect(r.printStatus).toBe('SKIPPED');
    expect(r.acceptance).toBe('ACCEPTED');
  });

  it('device: a ticket-claim failure never undoes the acceptance', async () => {
    kotPrint.printOrder.mockRejectedValue(new Error('db hiccup'));
    const r: any = await service.acceptOrder('b-1', 'ord-1', 'u-1', { via: 'device' });
    expect(r.acceptance).toBe('ACCEPTED');
    expect(r.printStatus).toBe('FAILED');
  });

  it('a second accept (double click / retry / refresh) is rejected and prints nothing', async () => {
    prisma.order.findFirst.mockResolvedValue({ id: 'ord-1', status: 'OPEN', acceptance: 'ACCEPTED', items: [] });
    await expect(service.acceptOrder('b-1', 'ord-1', 'u-1', { via: 'device' })).rejects.toThrow(ConflictException);
    expect(kotPrint.printOrder).not.toHaveBeenCalled();
  });

  it('two simultaneous accepts: the loser of the compare-and-set prints nothing', async () => {
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.acceptOrder('b-1', 'ord-1', 'u-1', { via: 'device' })).rejects.toThrow(ConflictException);
    expect(kotPrint.printOrder).not.toHaveBeenCalled();
  });

  it('accept looks the order up inside the requested branch only', async () => {
    kotPrint.printOrder.mockResolvedValue({ ok: true, printed: [], unsupportedChars: [] });
    await service.acceptOrder('b-1', 'ord-1', 'u-1', { via: 'device' });
    expect(prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'ord-1', branchId: 'b-1' } }));
  });
});

describe('device print params', () => {
  it('unknown kotVia keeps the old server behaviour', () => {
    expect(parseKotVia(undefined)).toBe('server');
    expect(parseKotVia('weird')).toBe('server');
    expect(parseKotVia('device')).toBe('device');
    expect(parseKotVia('none')).toBe('none');
  });

  it('A4 is always a rendered page; bad paper values are dropped', () => {
    expect(parseDeviceKotOptions({ paper: 'A4', format: 'escpos' }).format).toBe('html');
    expect(parseDeviceKotOptions({ paper: '80mm' }).format).toBe('escpos');
    expect(parseDeviceKotOptions({ paper: '99mm' }).paper).toBeUndefined();
  });

  it('only real time zones are used', () => {
    expect(safeTimeZone('Asia/Kolkata')).toBe('Asia/Kolkata');
    expect(safeTimeZone('Not/AZone')).toBeUndefined();
    expect(safeTimeZone(undefined)).toBeUndefined();
  });

  it('device result body is validated', () => {
    expect(deviceKotResultSchema.safeParse({ printerName: 'K', results: [{ kotId: 'k', status: 'QUEUED' }] }).success).toBe(true);
    expect(deviceKotResultSchema.safeParse({ printerName: 'K', results: [{ kotId: 'k', status: 'PRINTED' }] }).success).toBe(false);
    expect(deviceKotResultSchema.safeParse({ printerName: '', results: [{ kotId: 'k', status: 'QUEUED' }] }).success).toBe(false);
    expect(deviceKotResultSchema.safeParse({ printerName: 'K', results: [] }).success).toBe(false);
  });

  it('KOT html for 58 mm and default 80 mm keeps the narrow page', () => {
    const order = { orderNumber: '1', type: 'TAKEAWAY', createdAt: new Date(), table: null, customer: null, items: [] };
    expect(buildKotHtml({ branchName: 'B', order, paper: '58mm' })).toContain('size: 58mm');
    expect(buildKotHtml({ branchName: 'B', order })).toContain('size: 80mm');
  });
});
