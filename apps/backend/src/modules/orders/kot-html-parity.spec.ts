import { buildKotHtml as serverKot } from './kot.html';
// The browser copy used to print from the POS cart before the server answers.
import { buildKotHtml as browserKot } from '../../../../web/lib/kot-html';

// The two KOT templates must print the same ticket. If this fails, copy the
// change into apps/web/lib/kot-html.ts (or the other way round).
describe('KOT template: browser copy matches the server', () => {
  const order = {
    orderNumber: '20261112-0018',
    type: 'DINE_IN',
    createdAt: new Date('2026-11-12T08:30:00Z'),
    table: { label: 'T-4' },
    customer: { name: 'Priya' },
    items: [
      { nameSnapshot: 'Paneer Tikka (Half)', quantity: 2, kitchenNote: 'less spicy', modifiers: [{ nameSnapshot: 'Extra cheese' }] },
      { nameSnapshot: 'Dal <b>', quantity: 1, kitchenNote: null, modifiers: [] },
    ],
  };
  it.each(['58mm', '80mm', 'A4'] as const)('same output on %s', (paper) => {
    const args = { branchName: 'Main & Co', order, paper, timeZone: 'Asia/Kolkata' };
    expect(browserKot(args)).toBe(serverKot(args));
  });
  it('same output for a reprint and a ticket header', () => {
    const args = { branchName: 'B', order, ticket: { number: 'K-7', station: 'Grill', reprint: 2 }, copyLabel: 'REPRINT' };
    expect(browserKot(args)).toBe(serverKot(args));
  });
  it('a new order without a number yet prints the table and type only', () => {
    const html = browserKot({ branchName: 'B', order: { ...order, orderNumber: '' } });
    expect(html).toContain('Order: DINE IN');
    expect(html).not.toContain('Order: #');
    expect(html).toContain('Table: T-4');
  });
});

describe('KOT template: EasyDine footer', () => {
  it('says "Powered by EasyDine" in text, with no logo image, on every paper size', () => {
    for (const paper of ['58mm', '80mm', 'A4'] as const) {
      const html = serverKot({ branchName: 'B', order: { orderNumber: '1', type: 'TAKEAWAY', createdAt: new Date(), table: null, customer: null, items: [] }, paper } as any);
      expect(html).toContain('Powered by EasyDine</p>');
      expect(html).not.toContain('data:image/png');
      expect(html).not.toContain('powered-logo');
    }
  });
});
