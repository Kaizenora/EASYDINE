import { toPublicOrder } from './public-menu.service';

describe('toPublicOrder (QR-session privacy)', () => {
  const order = {
    id: 'o1',
    orderNumber: 'A-1',
    type: 'DINE_IN',
    status: 'OPEN',
    acceptance: 'PENDING',
    totalAmount: 250,
    createdAt: new Date(),
    guestName: 'First Guest',
    deliveryPhone: '+919876543210',
    deliveryAddress: '12 Secret Street',
    customerId: 'c1',
    tableNotes: 'allergic to nuts',
    createdById: 'staff1',
    restaurantId: 'r1',
    branchId: 'b1',
    items: [
      {
        id: 'i1',
        menuItemId: 'm1',
        nameSnapshot: 'Paneer',
        quantity: 2,
        unitPriceSnapshot: 100,
        lineTotal: 250,
        status: 'ACTIVE',
        kitchenNote: null,
        addedById: 'staff1',
        modifiers: [{ id: 'x1', nameSnapshot: 'Extra cheese', priceAdjSnapshot: 25, modifierId: 'mm' }],
      },
    ],
  };

  it('never exposes guest identity, staff ids or internal fields', () => {
    const out = JSON.stringify(toPublicOrder(order));
    for (const secret of [
      'First Guest',
      '9876543210',
      'Secret Street',
      'allergic',
      'staff1',
      'c1"',
      'r1',
      'b1',
    ]) {
      expect(out).not.toContain(secret);
    }
  });

  it('keeps what the guest needs to see: lines, add-ons and totals', () => {
    const out: any = toPublicOrder(order);
    expect(out.orderNumber).toBe('A-1');
    expect(out.items[0].modifiers[0]).toEqual({
      id: 'x1',
      nameSnapshot: 'Extra cheese',
      priceAdjSnapshot: 25,
    });
    expect(out.totalAmount).toBe('250');
  });

  it('passes a null order through', () => {
    expect(toPublicOrder(null)).toBeNull();
  });
});
