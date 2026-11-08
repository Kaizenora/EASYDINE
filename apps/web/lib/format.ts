export function formatCurrency(
  value: number | string,
  currency = "INR",
  locale = "en-IN",
): string {
  const amount = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Standardizes order number display:
 * - short: '#24' (strips leading date & leading zeros from YYYYMMDD-NNNN)
 * - full: '20261108-0024' (raw server series for invoice, receipt, or audit)
 */
export function formatOrderNumber(
  raw?: string | null,
  style: "short" | "full" = "short",
): string {
  if (!raw) return "#-";
  if (style === "full") return raw;
  const parts = String(raw).split("-");
  const suffix = parts.length > 1 ? parts[parts.length - 1] : parts[0];
  const num = parseInt(suffix, 10);
  return isNaN(num) ? `#${suffix}` : `#${num}`;
}
