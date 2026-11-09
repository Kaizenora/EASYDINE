/**
 * Standard table display label helper.
 * If a custom table name exists (e.g. "Patio 4", "VIP Booth"), it is returned unchanged.
 * Otherwise returns "T" + number (e.g. T1, T2, T12).
 * Prevents double-prefixing ("TT1" is normalized to "T1").
 */
export function tableLabel(
  number?: string | number | null,
  name?: string | null,
): string {
  if (name && name.trim()) return name.trim();
  const numStr = String(number ?? "").trim();
  if (!numStr) return "T-";
  // If already prefixed with T or t (e.g. "T1", "t1", "TT1"), strip all leading T's and return single T
  const cleanNum = numStr.replace(/^[Tt]+/i, "");
  return `T${cleanNum || numStr}`;
}
