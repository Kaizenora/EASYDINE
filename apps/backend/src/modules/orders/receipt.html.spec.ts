import { buildReceiptHtml } from './receipt.html';

const base = {
  restaurantName: 'Bar',
  currency: 'EUR',
  branch: {
    name: 'Centro',
    address: null,
    phone: null,
    gstNumber: null,
    taxRegime: 'ES_IVA' as const,
    taxMode: 'INCLUSIVE' as const,
    taxLabel: null,
    taxId: 'B12345678',
  },
  order: {
    orderNumber: '1',
    type: 'TAKEAWAY',
    createdAt: new Date('2026-10-18T10:00:00Z'),
    table: null,
    customer: null,
    subtotal: 11,
    discountAmount: 0,
    taxAmount: 1,
    tipAmount: 0,
    loyaltyPointsRedeemed: 0,
    loyaltyDiscountAmount: 0,
    totalAmount: 11,
    items: [
      {
        nameSnapshot: 'Paella',
        quantity: 1,
        unitPriceSnapshot: 11,
        lineTotal: 11,
        taxRateSnapshot: 10,
        modifiers: [],
      },
    ],
    payments: [{ method: 'CARD', amount: 11 }],
  },
};
const verifactu = {
  url: 'https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B12345678&numserie=T1-000001&fecha=18-10-2026&importe=11.00',
  heading: 'QR tributario:',
  legend: 'Factura verificable en la sede electrónica de la AEAT',
  short: 'VERI*FACTU',
  invoiceNumber: 'T1-000001',
};

describe('receipt HTML with VERI*FACTU', () => {
  it('draws an inline 35 mm QR with the legends on a paid receipt', () => {
    const html = buildReceiptHtml({
      ...base,
      order: { ...base.order, verifactu },
    });
    expect(html).toContain('Factura simplificada T1-000001');
    expect(html).toContain('QR tributario:');
    expect(html).toContain('<svg');
    expect(html).toContain('width="35mm"');
    expect(html).toContain('VERI*FACTU');
  });
  it('omits it without an invoice and on a provisional bill', () => {
    expect(buildReceiptHtml(base)).not.toContain('QR tributario');
    expect(
      buildReceiptHtml({
        ...base,
        order: { ...base.order, verifactu, isProvisional: true },
      }),
    ).not.toContain('QR tributario');
  });
});

describe('receipt/KOT timestamp timezone', () => {
  it('prints the order time in the restaurant timezone, not the server one', () => {
    const order = { ...base.order, createdAt: new Date('2026-11-12T08:16:39Z') };
    expect(buildReceiptHtml({ ...base, order, timezone: 'Asia/Kolkata' })).toContain('1:46:39');
    expect(buildReceiptHtml({ ...base, order, timezone: 'America/New_York' })).toContain('3:16:39');
  });
});

describe('receipt loyalty lines', () => {
  const withLoyalty = (extra: object) =>
    buildReceiptHtml({ ...base, order: { ...base.order, ...extra } });
  it('prints points earned and the new balance on a paid bill', () => {
    const html = withLoyalty({ loyalty: { earned: 12, balance: 87 } });
    expect(html).toContain('Points earned');
    expect(html).toContain('>12<');
    expect(html).toContain('Points balance');
    expect(html).toContain('<strong>87</strong>');
  });
  it('prints nothing when there is no loyalty info or the bill is only provisional', () => {
    expect(withLoyalty({ loyalty: null })).not.toContain('Points earned');
    expect(withLoyalty({})).not.toContain('Points balance');
    expect(withLoyalty({ loyalty: { earned: 1, balance: 1 }, isProvisional: true })).not.toContain('Points earned');
  });
});

describe('EasyDine footer on the bill (HTML)', () => {
  it('a bill says "Powered by EasyDine" in text, with no logo image', () => {
    const html = buildReceiptHtml(base as any);
    expect(html).toContain('Powered by EasyDine</p>');
    expect(html).not.toContain('data:image/png');
    expect(html).not.toContain('powered-logo');
  });
});
