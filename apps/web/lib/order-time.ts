// Order timestamps are stored as UTC instants (ISO strings) and only localised here, at display time.
/** "just now", "5 min", "2 h 10 min", "3 d" */
export function formatElapsed(createdAt: string | null | undefined, now: number): string {
  if (!createdAt) return "";
  const t = new Date(createdAt).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.floor((now - t) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rem = mins % 60;
    return rem ? `${hours} h ${rem} min` : `${hours} h`;
  }
  return `${Math.floor(hours / 24)} d`;
}

/** Clock time the order was placed, in the device's local time, e.g. "10:28 AM". */
export function formatClock(createdAt: string | null | undefined, locale?: string | string[]): string {
  if (!createdAt) return "";
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString(locale ?? [], { hour: "numeric", minute: "2-digit" });
}

