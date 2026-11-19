import {
  isBalanceExpired,
  pointsForSpend,
  redeemRuleViolation,
  usableBalance,
  type LoyaltyRules,
} from './loyalty';

const rules: LoyaltyRules = {
  loyaltyEnabled: true,
  loyaltyEarnPerCurrency: 100,
  loyaltyMinOrderAmount: 0,
  loyaltyMinRedeemPoints: 0,
  loyaltyExpiryDays: 0,
};

describe('pointsForSpend', () => {
  it('floors spend / earn-rate', () => {
    expect(pointsForSpend(rules, 999.99)).toBe(9);
    expect(pointsForSpend(rules, 1000)).toBe(10);
    expect(pointsForSpend({ ...rules, loyaltyEarnPerCurrency: 10 }, 255)).toBe(25);
  });
  it('earns nothing when switched off, under the minimum, or empty', () => {
    expect(pointsForSpend({ ...rules, loyaltyEnabled: false }, 5000)).toBe(0);
    expect(pointsForSpend({ ...rules, loyaltyMinOrderAmount: 500 }, 499.99)).toBe(0);
    expect(pointsForSpend({ ...rules, loyaltyMinOrderAmount: 500 }, 500)).toBe(5);
    expect(pointsForSpend(rules, 0)).toBe(0);
    expect(pointsForSpend(rules, 99)).toBe(0);
  });
  it('accepts a Decimal-like minimum and never divides by zero', () => {
    expect(pointsForSpend({ ...rules, loyaltyMinOrderAmount: { toString: () => '250.00' } }, 300)).toBe(3);
    expect(pointsForSpend({ ...rules, loyaltyEarnPerCurrency: 0 }, 50)).toBe(50);
  });
});

describe('expiry', () => {
  const now = new Date('2026-11-19T00:00:00Z');
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);
  it('never expires when days is 0 or there is no earn date', () => {
    expect(isBalanceExpired(rules, daysAgo(900), now)).toBe(false);
    expect(isBalanceExpired({ ...rules, loyaltyExpiryDays: 30 }, null, now)).toBe(false);
  });
  it('expires only after the window has fully passed', () => {
    const r = { ...rules, loyaltyExpiryDays: 30 };
    expect(isBalanceExpired(r, daysAgo(29), now)).toBe(false);
    expect(isBalanceExpired(r, daysAgo(31), now)).toBe(true);
    expect(usableBalance(r, { loyaltyPoints: 80, loyaltyLastEarnedAt: daysAgo(31) }, now)).toBe(0);
    expect(usableBalance(r, { loyaltyPoints: 80, loyaltyLastEarnedAt: daysAgo(3) }, now)).toBe(80);
  });
  it('a switched-off program has no usable balance', () => {
    expect(usableBalance({ ...rules, loyaltyEnabled: false }, { loyaltyPoints: 50 })).toBe(0);
  });
});

describe('redeemRuleViolation', () => {
  it('enforces the on/off switch and the minimum', () => {
    expect(redeemRuleViolation(rules, 0)).toBeNull();
    expect(redeemRuleViolation(rules, 5)).toBeNull();
    expect(redeemRuleViolation({ ...rules, loyaltyEnabled: false }, 5)).toMatch(/switched off/);
    expect(redeemRuleViolation({ ...rules, loyaltyMinRedeemPoints: 50 }, 49)).toMatch(/At least 50/);
    expect(redeemRuleViolation({ ...rules, loyaltyMinRedeemPoints: 50 }, 50)).toBeNull();
  });
});
