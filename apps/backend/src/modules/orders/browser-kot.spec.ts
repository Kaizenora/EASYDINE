import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';
import { parseKotVia } from './device-print-params';
import { buildKotHtml } from './kot.html';

// Hosted setup (web on Vercel, API on Railway): Accept & KOT prints through
// the cashier PC's browser print dialog. The server never tries a printer.

function makeService(prismaOver: Record<string, unknown> = {}) {
  const prisma: any = {
    order: {
      findFirst: jest.fn().mockResolvedValue({ id: 'ord-1', orderNumber: '12', branchId: 'b-1', status: 'OPEN', acceptance: 'PENDING', items: [], type: 'DINE_IN' }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    kot: { count: jest.fn().mockResolvedValue(1) },
    ...prismaOver,
  };
  prisma.$transaction = jest.fn().mockImplementation(async (cb: any) => cb(prisma));
  const kotPrint = { printOrder: jest.fn() };
  const service = new OrdersService(prisma, { emitToBranch: jest.fn() } as any, {} as any, {} as any, { record: jest.fn() } as any, { notifyByPermission: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any, kotPrint as any);
  jest.spyOn(service as any, 'generateKots').mockResolvedValue(undefined);
  jest.spyOn(service, 'getOrder').mockResolvedValue({ id: 'ord-1', acceptance: 'ACCEPTED' } as any);
  return { service, prisma, kotPrint };
}

describe('acceptOrder kotVia=browser', () => {
  it('accepts once and never tries a server printer (no Railway-to-LAN)', async () => {
    const { service, kotPrint } = makeService();
    const r: any = await service.acceptOrder('b-1', 'ord-1', 'u', { via: 'browser' });
    expect(kotPrint.printOrder).not.toHaveBeenCalled();
    expect(r.acceptance).toBe('ACCEPTED');
    expect(r.printStatus).toBe('BROWSER');
  });

  it('scheduled order without tickets yet: NO_TICKETS, so the cashier PC does not print', async () => {
    const { service, prisma } = makeService();
    prisma.kot.count.mockResolvedValue(0);
    const r: any = await service.acceptOrder('b-1', 'ord-1', 'u', { via: 'browser' });
    expect(r.printStatus).toBe('NO_TICKETS');
  });

  it('a second accept (retry/refresh/double click) is refused, so no second KOT is requested', async () => {
    const { service, prisma } = makeService();
    prisma.order.findFirst.mockResolvedValue({ id: 'ord-1', status: 'OPEN', acceptance: 'ACCEPTED', items: [] });
    await expect(service.acceptOrder('b-1', 'ord-1', 'u', { via: 'browser' })).rejects.toThrow(ConflictException);
    expect(prisma.kot.count).not.toHaveBeenCalled();
  });

  it('parses the browser route; unknown values keep the old default', () => {
    expect(parseKotVia('browser')).toBe('browser');
    expect(parseKotVia('BROWSER')).toBe('server');
  });
});

describe('GET /orders/:id/kot (printed via the browser dialog)', () => {
  const receipt = {
    orderNumber: '12',
    type: 'DINE_IN',
    createdAt: new Date('2026-11-12T08:30:00Z'),
    table: { number: 4, name: null },
    customer: null,
    branch: { name: 'Main' },
    items: [
      { nameSnapshot: 'Paneer Tikka (Half)', quantity: 2, kitchenNote: 'less spicy', status: 'NEW', unitPriceSnapshot: '240.00', lineTotal: '480.00', modifiers: [{ nameSnapshot: 'Extra cheese', priceAdjSnapshot: '30.00' }] },
      { nameSnapshot: 'Cancelled Soup', quantity: 1, kitchenNote: null, status: 'CANCELLED', unitPriceSnapshot: '99.00', lineTotal: '99.00', modifiers: [] },
    ],
    totalAmount: '579.00',
  };

  function controller(access: 'ok' | 'deny' = 'ok') {
    const ordersService: any = { getReceiptData: jest.fn().mockResolvedValue(receipt) };
    const branchAccess: any = {
      assertAccess: jest.fn().mockImplementation(async () => {
        if (access === 'deny') throw new ForbiddenException('Branch not found or not accessible');
      }),
    };
    return { ctl: new OrdersController(ordersService, branchAccess, {} as any, {} as any), ordersService, branchAccess };
  }

  function res() {
    const r: any = { body: '', headers: {} as Record<string, string> };
    r.type = jest.fn().mockReturnValue(r);
    r.setHeader = jest.fn((k: string, v: string) => (r.headers[k] = v));
    r.send = jest.fn((b: string) => (r.body = b));
    return r;
  }

  const user: any = { id: 'u', restaurantId: 'rest-1' };

  it('has order/table, time in the cashier zone, items, quantities, variants, instructions — no prices or totals', async () => {
    const { ctl, branchAccess } = controller();
    const r = res();
    await ctl.kot(user, 'b-1', 'ord-1', r, 'Asia/Kolkata', '80mm');
    expect(branchAccess.assertAccess).toHaveBeenCalledWith('rest-1', 'b-1');
    const html: string = r.body;
    expect(html).toContain('#12');
    expect(html).toMatch(/Table: T-?4/);
    expect(html).toContain('2×');
    expect(html).toContain('Paneer Tikka (Half)');
    expect(html).toContain('Extra cheese');
    expect(html).toContain('less spicy');
    expect(html).toContain('2:00'); // 08:30 UTC = 14:00 IST
    expect(html).not.toContain('Cancelled Soup');
    expect(html).not.toMatch(/240|480|579|30\.00|99\.00|₹|Total/);
    expect(r.headers['Cache-Control']).toBe('no-store');
  });

  it('reprint copies are stamped REPRINT; paper size applies', async () => {
    const { ctl } = controller();
    const r = res();
    await ctl.kot(user, 'b-1', 'ord-1', r, undefined, '58mm', '1');
    expect(r.body).toContain('*** REPRINT ***');
    expect(r.body).toContain('size: 58mm');
  });

  it('another tenant/branch is refused before any order data is read', async () => {
    const { ctl, ordersService } = controller('deny');
    await expect(ctl.kot(user, 'b-x', 'ord-1', res())).rejects.toThrow(ForbiddenException);
    expect(ordersService.getReceiptData).not.toHaveBeenCalled();
  });

  it('a missing branch is refused (no unscoped lookup)', async () => {
    const { ctl, ordersService } = controller();
    await expect(ctl.kot(user, '' as any, 'ord-1', res())).rejects.toThrow(BadRequestException);
    expect(ordersService.getReceiptData).not.toHaveBeenCalled();
  });

  it('POST accept (browser route) returns the same KOT page, so no second request is needed', async () => {
    const { ctl, ordersService } = controller();
    ordersService.acceptOrder = jest.fn().mockResolvedValue({ id: 'ord-1', printStatus: 'BROWSER' });
    const out: any = await ctl.accept(user, 'b-1', 'ord-1', 'browser', undefined, '58mm', 'Asia/Kolkata');
    expect(out.printStatus).toBe('BROWSER');
    expect(out.kotHtml).toContain('Paneer Tikka (Half)');
    expect(out.kotHtml).toContain('size: 58mm');
    expect(out.kotHtml).not.toMatch(/240|480|579|₹|Total/);
    expect(ordersService.getReceiptData).toHaveBeenCalledWith('b-1', 'ord-1');
  });

  it('POST accept: no KOT page when there are no tickets or another route is used', async () => {
    const { ctl, ordersService } = controller();
    ordersService.acceptOrder = jest.fn().mockResolvedValue({ id: 'ord-1', printStatus: 'NO_TICKETS' });
    expect((await ctl.accept(user, 'b-1', 'ord-1', 'browser')) as any).not.toHaveProperty('kotHtml');
    ordersService.acceptOrder = jest.fn().mockResolvedValue({ id: 'ord-1', printStatus: 'SKIPPED' });
    expect((await ctl.accept(user, 'b-1', 'ord-1', 'none')) as any).not.toHaveProperty('kotHtml');
    expect(ordersService.getReceiptData).not.toHaveBeenCalled();
  });

  it('POST accept: if the KOT page cannot be built, the acceptance still comes back', async () => {
    const { ctl, ordersService } = controller();
    ordersService.acceptOrder = jest.fn().mockResolvedValue({ id: 'ord-1', printStatus: 'BROWSER' });
    ordersService.getReceiptData = jest.fn().mockRejectedValue(new Error('db down'));
    const out: any = await ctl.accept(user, 'b-1', 'ord-1', 'browser');
    expect(out).toEqual({ id: 'ord-1', printStatus: 'BROWSER' });
  });

  it('first print carries no REPRINT stamp', () => {
    const html = buildKotHtml({ branchName: 'B', order: { orderNumber: '1', type: 'TAKEAWAY', createdAt: new Date(), table: null, customer: null, items: [] } });
    expect(html).not.toContain('REPRINT');
  });
});
