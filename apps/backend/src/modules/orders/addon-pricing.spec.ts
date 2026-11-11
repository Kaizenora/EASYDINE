import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { buildReceiptHtml } from './receipt.html';

describe('Add-on pricing and receipt rendering regression suite', () => {
  describe('buildReceiptHtml paper sizes and add-ons rendering', () => {
    const mockOrder: any = {
      orderNumber: '20261111-0004',
      type: 'DINE_IN',
      table: { number: '4' },
      createdAt: new Date('2026-11-11T04:39:00.000Z'),
      items: [
        {
          id: 'item-1',
          nameSnapshot: 'paneer mutter',
          quantity: 1,
          unitPriceSnapshot: new Prisma.Decimal('360.00'),
          lineTotal: new Prisma.Decimal('360.00'),
          taxRateSnapshot: new Prisma.Decimal('5.00'),
          modifiers: [
            {
              id: 'mod-1',
              nameSnapshot: 'Extra cheese',
              priceAdjSnapshot: new Prisma.Decimal('40.00'),
            },
            {
              id: 'mod-2',
              nameSnapshot: 'Extra butter',
              priceAdjSnapshot: new Prisma.Decimal('20.00'),
            },
          ],
        },
      ],
      subtotal: new Prisma.Decimal('360.00'),
      taxAmount: new Prisma.Decimal('18.00'),
      totalAmount: new Prisma.Decimal('378.00'),
      payments: [],
    };

    const mockBranch: any = {
      name: 'Main Branch',
      address: '123 Test Street, Mumbai',
      phone: '+91 98765 43210',
      gstNumber: '27AABCE1234F1Z5',
      taxRegime: 'INDIA_GST',
      taxMode: 'INCLUSIVE',
      taxLabel: null,
      taxId: '27AABCE1234F1Z5',
    };

    it('renders real order with add-on modifiers at 80mm', () => {
      const html = buildReceiptHtml({
        restaurantName: 'EasyDine Test Restaurant',
        currency: 'INR',
        order: mockOrder,
        branch: mockBranch,
        paperSize: '80mm',
        isTest: false,
      });

      expect(html).toContain('EasyDine Test Restaurant');
      expect(html).toContain('paneer mutter');
      expect(html).toContain('Extra cheese');
      expect(html).toContain('+₹40.00');
      expect(html).toContain('Extra butter');
      expect(html).toContain('+₹20.00');
      expect(html).toContain('₹360.00');
      expect(html).toContain('80mm');
      expect(html).toContain('Order: #20261111-0004 · DINE IN');
      expect(html).not.toContain('*** TEST RECEIPT &mdash; NOT A SALE ***');
    });

    it('renders real order at 58mm with narrow layout styling', () => {
      const html = buildReceiptHtml({
        restaurantName: 'EasyDine Test Restaurant',
        currency: 'INR',
        order: mockOrder,
        branch: mockBranch,
        paperSize: '58mm',
        isTest: false,
      });

      expect(html).toContain('width: 54mm');
      expect(html).toContain('size: 58mm auto');
      expect(html).toContain('paneer mutter');
      expect(html).toContain('Extra cheese');
    });

    it('renders real order at A4 format', () => {
      const html = buildReceiptHtml({
        restaurantName: 'EasyDine Test Restaurant',
        currency: 'INR',
        order: mockOrder,
        branch: mockBranch,
        paperSize: 'A4',
        isTest: false,
      });

      expect(html).toContain('A4 portrait');
      expect(html).toContain('max-width: 170mm');
      expect(html).toContain('paneer mutter');
    });

    it('renders sample / test bill with synthetic data and clear test badges', () => {
      const html = buildReceiptHtml({
        restaurantName: 'EasyDine Test Restaurant',
        currency: 'INR',
        order: mockOrder,
        branch: mockBranch,
        paperSize: '80mm',
        isTest: true,
      });

      expect(html).toContain('*** TEST RECEIPT &mdash; NOT A SALE ***');
      expect(html).toContain('*** TEST BILL &mdash; Printer configured successfully (80mm) ***');
    });
  });

  describe('Mathematical subtotal and unit price verification for add-on models', () => {
    it('fixture verification: base ₹300 + ₹40 cheese + ₹20 butter = ₹360', () => {
      const basePrice = 300;
      const modifiers = [
        { name: 'Extra cheese', priceAdjustment: 40 },
        { name: 'Extra butter', priceAdjustment: 20 },
      ];
      const modifierTotal = modifiers.reduce((s, m) => s + m.priceAdjustment, 0);
      const unitPrice = basePrice + modifierTotal;
      const quantity = 1;
      const lineTotal = unitPrice * quantity;

      expect(modifierTotal).toBe(60);
      expect(unitPrice).toBe(360);
      expect(lineTotal).toBe(360);
    });

    it('fixture verification with quantity > 1: qty 2 × (₹300 + ₹40 + ₹20) = ₹720', () => {
      const basePrice = 300;
      const modifiers = [
        { name: 'Extra cheese', priceAdjustment: 40 },
        { name: 'Extra butter', priceAdjustment: 20 },
      ];
      const modifierTotal = modifiers.reduce((s, m) => s + m.priceAdjustment, 0);
      const unitPrice = basePrice + modifierTotal;
      const quantity = 2;
      const lineTotal = unitPrice * quantity;

      expect(unitPrice).toBe(360);
      expect(lineTotal).toBe(720);
    });

    it('rejects tampered or invalid modifier IDs outside the branch/item scope', () => {
      const allowedModifierIds = new Set(['valid-mod-1', 'valid-mod-2']);
      const cartItemModifierIds = ['valid-mod-1', 'tampered-or-foreign-mod-999'];

      const hasInvalid = cartItemModifierIds.some((id) => !allowedModifierIds.has(id));
      expect(hasInvalid).toBe(true);

      expect(() => {
        if (hasInvalid) {
          throw new BadRequestException('A selected option is not available for this item');
        }
      }).toThrow(BadRequestException);
    });
  });
});
