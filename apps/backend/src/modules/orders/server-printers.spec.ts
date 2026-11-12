import { KotPrintService } from './kot-print.service';
import { OrdersService } from './orders.service';
import { PrinterNotFoundError } from './escpos-usb';
import { __setPrinterListerForTests, spoolerTargetFor } from './server-printers';
import * as transport from './printer-transport';
import { parseKotVia } from './device-print-params';

// Cashier browser on the PC that runs the server: the cashier picks one of
// that PC's installed Windows printers and the server prints there.

describe('printers chosen on the server PC', () => {
  afterEach(() => __setPrinterListerForTests(null));

  it('uses only an exact, installed printer name', async () => {
    __setPrinterListerForTests(async () => ['Kitchen TM', 'Front Desk']);
    await expect(spoolerTargetFor('Kitchen TM')).resolves.toEqual(
      expect.objectContaining({ printerConnection: 'WINDOWS_SPOOLER', printerName: 'Kitchen TM' }),
    );
    await expect(spoolerTargetFor('kitchen tm')).rejects.toThrow(PrinterNotFoundError);
    await expect(spoolerTargetFor('Kitchen')).rejects.toThrow(PrinterNotFoundError);
  });

  it('a missing printer is an error, never the default or another printer', async () => {
    __setPrinterListerForTests(async () => ['Microsoft Print to PDF']);
    await expect(spoolerTargetFor('Kitchen TM')).rejects.toThrow(/not installed/);
    await expect(spoolerTargetFor('')).rejects.toThrow(/No printer/);
    await expect(spoolerTargetFor(undefined)).rejects.toThrow(PrinterNotFoundError);
  });

  it('re-reads the list once before declaring a printer missing (just installed)', async () => {
    let calls = 0;
    __setPrinterListerForTests(async () => (++calls === 1 ? [] : ['New Printer']));
    await expect(spoolerTargetFor('New Printer')).resolves.toEqual(expect.objectContaining({ printerName: 'New Printer' }));
  });

  it('refuses names that could break out of the spooler command line', async () => {
    const bad = ['K"; calc', 'K`x', 'K%PATH%', 'K\nx'];
    __setPrinterListerForTests(async () => bad);
    for (const n of bad) await expect(spoolerTargetFor(n)).rejects.toThrow(/characters/);
  });

  it('accepts spooler as a kitchen-ticket route', () => {
    expect(parseKotVia('spooler')).toBe('spooler');
  });
});

describe('KOT on the chosen printer', () => {
  it('sends to the chosen printer, not the branch printer, at the chosen width', async () => {
    const prisma: any = {
      order: { findFirst: jest.fn().mockResolvedValue({ id: 'ord-1' }) },
      kot: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'kot-1',
            ticketNumber: '1',
            printedCount: 0,
            station: null,
            items: [{ orderItem: { nameSnapshot: 'Dal', quantity: 1, kitchenNote: null, modifiers: [] } }],
            order: {
              id: 'ord-1',
              orderNumber: '7',
              type: 'TAKEAWAY',
              createdAt: new Date(),
              table: null,
              customer: null,
              guestName: null,
              branch: { name: 'B', printerConnection: 'NETWORK', printerHost: '10.0.0.9', printerPaperWidthMm: 80, printerCodepage: 'CP858', printerColumns: 48 },
            },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn().mockResolvedValue({ id: 'kot-1', printedCount: 1 }),
      },
      printJob: { create: jest.fn().mockResolvedValue({}) },
    };
    const send = jest.spyOn(transport, 'sendToBranchPrinter').mockResolvedValue(undefined);
    const svc = new KotPrintService(prisma, { emitToBranch: jest.fn() } as any);
    const target = { printerConnection: 'WINDOWS_SPOOLER', printerHost: null, printerPort: 9100, printerName: 'Kitchen TM' };
    await svc.printOrder('b-1', 'ord-1', false, false, { paper: '58mm' }, target);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toBe(target);
    expect(prisma.printJob.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ target: 'WINDOWS_SPOOLER:Kitchen TM', status: 'SENT' }) }),
    );
    send.mockRestore();
  });
});

describe('acceptOrder with kotVia=spooler', () => {
  let kotPrint: any;
  let service: OrdersService;
  beforeEach(() => {
    const prisma: any = {
      order: {
        findFirst: jest.fn().mockResolvedValue({ id: 'ord-1', orderNumber: '1', branchId: 'b-1', status: 'OPEN', acceptance: 'PENDING', items: [], type: 'DINE_IN' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    prisma.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prisma));
    kotPrint = { printOrder: jest.fn().mockResolvedValue({ ok: true, printed: [], unsupportedChars: [] }) };
    service = new OrdersService(prisma, { emitToBranch: jest.fn() } as any, {} as any, {} as any, { record: jest.fn() } as any, { notifyByPermission: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any, kotPrint);
    jest.spyOn(service as any, 'generateKots').mockResolvedValue(undefined);
    jest.spyOn(service, 'getOrder').mockResolvedValue({ id: 'ord-1', acceptance: 'ACCEPTED' } as any);
  });
  afterEach(() => __setPrinterListerForTests(null));

  it('prints once on the chosen printer and reports SENT', async () => {
    __setPrinterListerForTests(async () => ['Kitchen TM']);
    const r: any = await service.acceptOrder('b-1', 'ord-1', 'u', { via: 'spooler', printer: 'Kitchen TM', device: { paper: '80mm' } });
    expect(kotPrint.printOrder).toHaveBeenCalledTimes(1);
    expect(kotPrint.printOrder.mock.calls[0][5]).toEqual(expect.objectContaining({ printerName: 'Kitchen TM' }));
    expect(r.printStatus).toBe('SENT');
  });

  it('missing printer: accepted, nothing printed anywhere, PRINTER_MISSING', async () => {
    __setPrinterListerForTests(async () => ['Other']);
    const r: any = await service.acceptOrder('b-1', 'ord-1', 'u', { via: 'spooler', printer: 'Kitchen TM' });
    expect(kotPrint.printOrder).not.toHaveBeenCalled();
    expect(r.acceptance).toBe('ACCEPTED');
    expect(r.printStatus).toBe('PRINTER_MISSING');
  });

  it('spooler failure never undoes the acceptance', async () => {
    __setPrinterListerForTests(async () => ['Kitchen TM']);
    kotPrint.printOrder.mockRejectedValue(new Error('Windows Spooler send failed'));
    const r: any = await service.acceptOrder('b-1', 'ord-1', 'u', { via: 'spooler', printer: 'Kitchen TM' });
    expect(r.acceptance).toBe('ACCEPTED');
    expect(r.printStatus).toBe('FAILED');
  });
});
