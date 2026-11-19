// What the cashier still has to collect on an order. The server's bill preview
// is the source of truth (it includes tax added on top, charges and automatic
// offers, and already subtracts part payments). Until it has loaded, fall back
// to the order row: its total minus what was already paid. Pure, so it can be
// unit-tested with `node --test`.
export interface BalanceOrder {
  totalAmount?: string | number | null;
  payments?: { amount?: string | number | null }[] | null;
}

const toNumber = (v: string | number | null | undefined): number => {
  const n = typeof v === "number" ? v : parseFloat(v ?? "");
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export function amountPaidSoFar(order: BalanceOrder): number {
  return round2((order.payments ?? []).reduce((sum, p) => sum + toNumber(p.amount), 0));
}

export function amountToCollect(order: BalanceOrder, preview?: { balanceDue?: number | null } | null): number {
  if (preview && typeof preview.balanceDue === "number" && Number.isFinite(preview.balanceDue)) {
    return Math.max(round2(preview.balanceDue), 0);
  }
  return Math.max(round2(toNumber(order.totalAmount) - amountPaidSoFar(order)), 0);
}
