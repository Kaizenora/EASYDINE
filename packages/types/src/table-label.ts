export function tableLabel(
  number?: string | number | null,
  name?: string | null,
): string {
  if (name && name.trim()) return name.trim();
  const numStr = String(number ?? "").trim();
  if (!numStr) return "T-";
  if (/^[A-Za-z]/.test(numStr)) return numStr;
  return `T${numStr}`;
}
