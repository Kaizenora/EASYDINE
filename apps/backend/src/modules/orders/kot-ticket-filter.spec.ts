import { BadRequestException } from '@nestjs/common';
import { KotPrintService } from './kot-print.service';
import { parseKotIds } from './orders.controller';

// ?kotIds= limits a KOT print to the tickets just sent (POS "Send to
// kitchen") or to the one ticket a kitchen screen reprints.
describe('parseKotIds', () => {
  it('absent means the whole order', () => {
    expect(parseKotIds(undefined)).toBeUndefined();
    expect(parseKotIds('')).toBeUndefined();
  });
  it('splits a comma list', () => {
    expect(parseKotIds('k1, k2')).toEqual(['k1', 'k2']);
  });
  it('rejects junk and oversized lists', () => {
    expect(() => parseKotIds('<script>')).toThrow(BadRequestException);
    expect(() => parseKotIds(Array.from({ length: 21 }, (_, i) => `k${i}`).join(','))).toThrow(BadRequestException);
  });
});

describe('KotPrintService ticket filter', () => {
  const findMany = jest.fn();
  const prisma: any = {
    kot: { findMany, updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    order: { findFirst: jest.fn().mockResolvedValue({ id: 'o1' }) },
  };
  const svc = new KotPrintService(prisma, { emitToBranch: jest.fn() } as any);

  beforeEach(() => findMany.mockReset().mockResolvedValue([]));

  it('ticketLines queries only the given tickets of that order in that branch', async () => {
    findMany.mockResolvedValue([
      { ticketNumber: 'T-2', station: { name: 'Grill' }, items: [{ orderItemId: 'i3' }, { orderItemId: 'i4' }] },
    ]);
    const r = await svc.ticketLines('b1', 'o1', ['k2']);
    expect(findMany.mock.calls[0][0].where).toMatchObject({ orderId: 'o1', id: { in: ['k2'] }, order: { branchId: 'b1' } });
    expect([...r.orderItemIds]).toEqual(['i3', 'i4']);
    expect(r.tickets).toEqual([{ number: 'T-2', station: 'Grill' }]);
  });

  it('printOrder with kotIds never loads the order’s other tickets', async () => {
    await expect(svc.printOrder('b1', 'o1', true, true, { format: 'html' }, undefined, ['k2'])).rejects.toMatchObject({
      response: { code: 'NO_TICKETS' },
    });
    expect(findMany.mock.calls[0][0].where).toMatchObject({ orderId: 'o1', id: { in: ['k2'] } });
  });
});
