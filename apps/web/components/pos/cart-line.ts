export interface CartLine {
  key: string;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number;
  modifierIds: string[];
  modifierLabel?: string;
  portion?: Portion;
  /** Kitchen preference for this line ("spicy", "buttery"); printed on the KOT. */
  note?: string;
}

/**
 * Same dish, different preference: one portion of a line becomes its own
 * line with an empty preference (2× Paneer Mutter -> 1× + 1×). The new
 * line's key is unique, so adding the dish again still goes to the original.
 */
export function splitCartLine<T extends CartLine>(lines: T[], key: string, now: number = Date.now()): T[] {
  const idx = lines.findIndex((l) => l.key === key);
  if (idx === -1 || lines[idx].quantity < 2) return lines;
  const line = lines[idx];
  const next = [...lines];
  next[idx] = { ...line, quantity: line.quantity - 1 };
  next.splice(idx + 1, 0, { ...line, key: `${line.key}#pref-${now}`, quantity: 1, note: "" });
  return next;
}

export function setCartLineNote<T extends CartLine>(lines: T[], key: string, note: string): T[] {
  return lines.map((l) => (l.key === key ? { ...l, note: note.slice(0, 120) } : l));
}

export type PortionKind = "HALF" | "FULL" | "CUSTOM";

export interface Portion {
  kind: PortionKind;
  // Only for CUSTOM: staff-typed label and unit price.
  customLabel?: string;
  customPrice?: number;
}

export function portionText(p?: Portion): string {
  if (!p) return "";
  if (p.kind === "HALF") return "Half";
  if (p.kind === "FULL") return "Full";
  return p.customLabel || "Custom";
}

export function cartLineKey(menuItemId: string, modifierIds: string[], portion?: Portion): string {
  const p = portion ? `${portion.kind}:${portion.customLabel ?? ""}:${portion.customPrice ?? ""}` : "";
  return `${menuItemId}::${[...modifierIds].sort().join(",")}::${p}`;
}
