import { buildKotHtml } from './kot.html';

describe('buildKotHtml', () => {
  const sampleOrder = {
    orderNumber: '1042',
    type: 'DINE_IN',
    createdAt: new Date('2026-11-12T10:30:00Z'),
    table: { label: 'Table 4' },
    customer: { name: 'Alice Smith' },
    items: [
      {
        nameSnapshot: 'Paneer Butter Masala',
        quantity: 2,
        kitchenNote: 'Extra spicy, less oil',
        modifiers: [
          { nameSnapshot: 'Extra Butter' },
          { nameSnapshot: 'No Coriander' },
        ],
      },
      {
        nameSnapshot: 'Butter Roti',
        quantity: 4,
        kitchenNote: null,
        modifiers: [],
      },
    ],
  };

  it('renders 80mm layout by default', () => {
    const html = buildKotHtml({
      branchName: 'Main Branch',
      order: sampleOrder,
    });

    expect(html).toContain('size: 80mm auto');
    expect(html).toContain('width: 80mm');
    expect(html).toContain('Main Branch');
    expect(html).toContain('#1042');
    expect(html).toContain('DINE IN');
    expect(html).toContain('Table 4');
    expect(html).toContain('Alice Smith');
    expect(html).toContain('2×');
    expect(html).toContain('Paneer Butter Masala');
    expect(html).toContain('+ Extra Butter');
    expect(html).toContain('+ No Coriander');
    expect(html).toContain('Note: Extra spicy, less oil');
    expect(html).toContain('4×');
    expect(html).toContain('Butter Roti');
  });

  it('supports 58mm paper size layout', () => {
    const html = buildKotHtml({
      branchName: 'Express Kiosk',
      order: sampleOrder,
      paper: '58mm',
    });

    expect(html).toContain('size: 58mm auto');
    expect(html).toContain('width: 54mm');
  });

  it('supports A4 paper size layout', () => {
    const html = buildKotHtml({
      branchName: 'Banquet Hall',
      order: sampleOrder,
      paper: 'A4',
    });

    expect(html).toContain('size: A4 portrait');
    expect(html).toContain('max-width: 170mm');
  });

  it('strictly excludes prices, currency symbols, and totals from KOT', () => {
    const html = buildKotHtml({
      branchName: 'Kitchen 1',
      order: sampleOrder,
    });

    expect(html).not.toMatch(/₹|\$|€|£/);
    expect(html).not.toContain('Total');
    expect(html).not.toContain('Subtotal');
    expect(html).not.toContain('Tax');
    expect(html).not.toContain('Balance due');
    expect(html).not.toContain('Paid');
  });

  it('escapes special characters to prevent XSS injection', () => {
    const dangerousOrder = {
      orderNumber: '<script>alert(1)</script>',
      type: 'TAKEAWAY',
      createdAt: new Date(),
      table: null,
      customer: { name: '<b>Hacker</b>' },
      items: [
        {
          nameSnapshot: 'Curry & <Rice>',
          quantity: 1,
          kitchenNote: 'Note with "quotes" & tags',
          modifiers: [{ nameSnapshot: '<Cheese>' }],
        },
      ],
    };

    const html = buildKotHtml({
      branchName: 'Restaurant & Bar',
      order: dangerousOrder,
    });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;b&gt;Hacker&lt;/b&gt;');
    expect(html).toContain('Restaurant &amp; Bar');
    expect(html).toContain('Curry &amp; &lt;Rice&gt;');
    expect(html).toContain('&lt;Cheese&gt;');
  });
});
