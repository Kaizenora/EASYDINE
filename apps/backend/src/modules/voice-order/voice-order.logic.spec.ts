import {
  buildKeyterms,
  quickCashierCommand,
  cashierLlmSchema,
  orderLlmSchema,
  resolveCashier,
  resolveOrder,
  type VoiceMenuRow,
  type VoiceTableRow,
} from './voice-order.logic';

const menu: VoiceMenuRow[] = [
  { id: 'naan', name: 'Cheese Garlic Naan', price: 90 },
  { id: 'paneer', name: 'Paneer Tikka', price: 260 },
  { id: 'lassi', name: 'Sweet Lassi', price: 80 },
];

const item = (
  dish: number,
  quantity: number | null,
  extra: Partial<{
    confidence: 'high' | 'low';
    specialInstructions: string | null;
  }> = {},
) => ({
  dish,
  quantity,
  confidence: extra.confidence ?? ('high' as const),
  specialInstructions: extra.specialInstructions ?? null,
  heard: 'x',
});

describe('resolveOrder', () => {
  it('maps dish numbers to menu ids and takes price from the menu', () => {
    const r = resolveOrder(menu, {
      items: [item(1, 2, { specialInstructions: ' thoda  spicy ' })],
      unmatched: [],
    });
    expect(r.items).toEqual([
      expect.objectContaining({
        menuItemId: 'naan',
        unitPrice: 90,
        quantity: 2,
        needsQuantity: false,
        specialInstructions: 'thoda spicy',
      }),
    ]);
  });

  it('never assumes a quantity: null, zero or absurd counts ask instead', () => {
    const r = resolveOrder(menu, {
      items: [item(1, null), item(2, 0), item(3, 500)],
      unmatched: [],
    });
    expect(r.items.map((i) => [i.quantity, i.needsQuantity])).toEqual([
      [null, true],
      [null, true],
      [null, true],
    ]);
  });

  it('a dish number outside the menu is never added (no invented items)', () => {
    const r = resolveOrder(menu, {
      items: [item(9, 1), item(0, 1)],
      unmatched: [],
    });
    expect(r.items).toHaveLength(0);
    expect(r.unmatched).toHaveLength(2);
  });

  it('unmatched suggestions keep only real, distinct dishes, max 3', () => {
    const r = resolveOrder(menu, {
      items: [],
      unmatched: [{ heard: 'biryani', closest: [2, 2, 7, 1, 3, 1] }],
    });
    expect(r.unmatched[0].suggestions.map((s) => s.menuItemId)).toEqual([
      'paneer',
      'naan',
      'lassi',
    ]);
  });

  it('LLM schema rejects a reply missing required fields', () => {
    expect(orderLlmSchema.safeParse({ items: [{ dish: 1 }] }).success).toBe(
      false,
    );
  });
});

describe('resolveCashier', () => {
  const tables: VoiceTableRow[] = [
    { id: 't1', number: '1', name: null },
    { id: 't2', number: '2', name: null },
  ];

  it('resolves the table number to the branch table', () => {
    expect(resolveCashier(tables, { action: 'markPaid', table: 2 })).toEqual({
      action: 'markPaid',
      table: { id: 't2', label: 'T2' },
    });
  });

  it('a table outside the list is not guessed', () => {
    expect(resolveCashier(tables, { action: 'openTable', table: 5 })).toEqual({
      action: 'openTable',
      table: null,
    });
  });

  it('bestSellers and unknown carry no table', () => {
    expect(
      resolveCashier(tables, { action: 'bestSellers', table: 1 }).table,
    ).toBeNull();
    expect(
      resolveCashier(tables, { action: 'unknown', table: 1 }).table,
    ).toBeNull();
  });

  it('LLM schema rejects actions outside the list', () => {
    expect(
      cashierLlmSchema.safeParse({ action: 'deleteOrder', table: 1 }).success,
    ).toBe(false);
  });
});

describe('buildKeyterms', () => {
  it('dedupes, trims to 64 chars and caps at 50', () => {
    const many = Array.from({ length: 80 }, (_, i) => `Dish ${i}`);
    const out = buildKeyterms(['Naan', 'naan', ' ', 'x'.repeat(100), ...many]);
    expect(out[0]).toBe('Naan');
    expect(out[1]).toHaveLength(64);
    expect(out).toHaveLength(50);
  });
});

describe('quickCashierCommand (no LLM)', () => {
  const tables: VoiceTableRow[] = [
    { id: 't1', number: '1', name: null },
    { id: 't2', number: '2', name: null },
    { id: 't3', number: '3', name: null },
  ];
  const q = (s: string) => quickCashierCommand(s, tables);
  const T2 = { id: 't2', label: 'T2' };

  it.each([
    ['table 2', 'openTable'],
    ['Table 2 ka order', 'openTable'],
    ['T2', 'openTable'],
    ['table 2 paid', 'markPaid'],
    ['टेबल 2 पेड', 'markPaid'],
    ['टेबल दो पेमेंट हो गया', 'markPaid'],
    ['टेबल दोन पेड', 'markPaid'],
    ['टेबल २ चे पैसे मिळाले', 'markPaid'],
    ['table do KOT reprint', 'reprintKOT'],
    ['टेबल दोनचा के ओ टी परत काढा', 'reprintKOT'],
    ['table 2 bill reprint karo', 'reprintBill'],
    ['टेबल दोनचे बिल काढा', 'reprintBill'],
  ])('"%s" -> %s', (said, action) => {
    expect(q(said)).toEqual({ action, table: T2 });
  });

  it('best sellers in any language, no table', () => {
    for (const s of [
      'best selling dish',
      'aaj ka best seller',
      'सबसे ज्यादा बिकने वाली डिश',
      'आजची सर्वात जास्त विकली गेलेली डिश',
    ]) {
      expect(q(s)).toEqual({ action: 'bestSellers', table: null });
    }
  });

  it('leaves unclear speech to the LLM', () => {
    expect(q('hello kaise ho')).toBeNull(); // no table
    expect(q('table 2 abhi paid nahi hua')).toBeNull(); // negation
    expect(q('table 9 paid')).toBeNull(); // not a table here
    expect(q('table 2 se table 3 me shift karo')).toBeNull(); // two tables
    expect(q('table 2 wale ko pani do')).toBeNull(); // not a command word
  });
});
