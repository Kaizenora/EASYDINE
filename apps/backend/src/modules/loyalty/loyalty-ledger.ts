import type { Prisma } from '@prisma/client';
import { isBalanceExpired, type LoyaltyRules } from './loyalty';

/**
 * Lapses a customer's balance when it has gone past the restaurant's expiry
 * window, writing one EXPIRE row to the existing PointsLedger so the history
 * still adds up. Safe to call repeatedly: the guarded update only fires while
 * the balance is still the one we saw, and the ledger key is unique per
 * customer + last-earn timestamp, so a replay is a no-op.
 * Returns the balance the customer is left with.
 */
export async function expireStaleBalance(
  tx: Prisma.TransactionClient,
  customerId: string,
  rules: LoyaltyRules,
  now: Date = new Date(),
): Promise<number> {
  const c = await tx.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      branchId: true,
      loyaltyPoints: true,
      loyaltyLastEarnedAt: true,
    },
  });
  if (!c) return 0;
  if (
    c.loyaltyPoints <= 0 ||
    !isBalanceExpired(rules, c.loyaltyLastEarnedAt, now)
  ) {
    return c.loyaltyPoints;
  }
  const lapsed = await tx.customer.updateMany({
    where: { id: c.id, loyaltyPoints: c.loyaltyPoints },
    data: { loyaltyPoints: 0 },
  });
  if (lapsed.count === 0) {
    const fresh = await tx.customer.findUnique({
      where: { id: c.id },
      select: { loyaltyPoints: true },
    });
    return fresh?.loyaltyPoints ?? 0;
  }
  await tx.pointsLedger.upsert({
    where: {
      idempotencyKey: `expire:${c.id}:${c.loyaltyLastEarnedAt?.getTime() ?? 0}`,
    },
    create: {
      branchId: c.branchId,
      customerId: c.id,
      delta: -c.loyaltyPoints,
      reason: 'EXPIRE',
      idempotencyKey: `expire:${c.id}:${c.loyaltyLastEarnedAt?.getTime() ?? 0}`,
    },
    update: {},
  });
  return 0;
}
