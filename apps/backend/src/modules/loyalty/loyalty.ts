// Loyalty rules, free of I/O so checkout, the bill preview and the tests all
// use the same arithmetic. Every rule is per restaurant (see the Restaurant
// loyalty* columns); nothing here reads another restaurant's settings.

import { round2 } from '../orders/pricing';

export interface LoyaltyRules {
  loyaltyEnabled: boolean;
  loyaltyEarnPerCurrency: number;
  loyaltyMinOrderAmount: number | { toString(): string };
  loyaltyMinRedeemPoints: number;
  loyaltyExpiryDays: number;
}

/**
 * Points earned for a paid bill. `spend` is what the guest actually paid for
 * food (bill total after discounts and redeemed points, excluding tip and
 * delivery). Nothing is earned when the program is off, the bill is under the
 * restaurant's minimum, or it is too small to earn a whole point.
 */
export function pointsForSpend(rules: LoyaltyRules, spend: number): number {
  if (!rules.loyaltyEnabled) return 0;
  const minimum = Number(rules.loyaltyMinOrderAmount) || 0;
  if (spend <= 0 || round2(spend) < minimum) return 0;
  const per = Math.max(1, Math.floor(rules.loyaltyEarnPerCurrency) || 1);
  return Math.floor(round2(spend) / per);
}

/** True once a balance has gone unrefreshed for longer than the expiry window. */
export function isBalanceExpired(
  rules: Pick<LoyaltyRules, 'loyaltyExpiryDays'>,
  lastEarnedAt: Date | null | undefined,
  now: Date = new Date(),
): boolean {
  const days = rules.loyaltyExpiryDays;
  if (!days || days <= 0 || !lastEarnedAt) return false;
  return now.getTime() - lastEarnedAt.getTime() > days * 86_400_000;
}

/** The balance a customer can actually use right now. */
export function usableBalance(
  rules: LoyaltyRules,
  customer: { loyaltyPoints: number; loyaltyLastEarnedAt?: Date | null },
  now: Date = new Date(),
): number {
  if (!rules.loyaltyEnabled) return 0;
  return isBalanceExpired(rules, customer.loyaltyLastEarnedAt, now)
    ? 0
    : customer.loyaltyPoints;
}

/** A redeem request that breaks the restaurant's rules, or null when fine. */
export function redeemRuleViolation(
  rules: LoyaltyRules,
  points: number,
): string | null {
  if (points <= 0) return null;
  if (!rules.loyaltyEnabled) {
    return 'Loyalty points are switched off for this restaurant';
  }
  if (rules.loyaltyMinRedeemPoints > 0 && points < rules.loyaltyMinRedeemPoints) {
    return `At least ${rules.loyaltyMinRedeemPoints} points are needed to redeem`;
  }
  return null;
}
