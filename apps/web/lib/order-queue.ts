// Durable queue for NEW ORDER CREATION only (POS "Send to kitchen" of a new
// order). Never payments, checkout, refunds, Accept & KOT or print jobs.
//
// Each logical order gets one requestId, stored here together with the exact
// submitted cart BEFORE the request goes out. A timeout, refresh or reconnect
// sends the same id again, and the server returns the order it already saved
// (unique branchId + requestId), so one logical order is one server order.
//
// A failed response never proves the order was not saved: an uncertain entry
// stays here, locked, until the server is asked "do you have this requestId?".
//
// Scope: one queue per restaurant + branch + user + device. Another account
// on this browser never sees or replays it. Entries hold only what the order
// needs (ids, quantities, notes, table, optional guest name/phone the cashier
// typed) and expire: an old entry is never sent automatically.

import type { KeyValueStorage } from "./printer-routing.ts";

export type QueueStatus = "pending" | "syncing" | "needs-attention" | "confirmed";

export interface QueueScope {
  tenantId: string;
  branchId: string;
  userId: string;
  deviceId: string;
}

export interface QueuedOrder {
  requestId: string;
  scope: QueueScope;
  /** The immutable submitted order body (includes requestId). */
  dto: Record<string, unknown> & { requestId: string };
  /** What the cart showed, to flag a server price change. */
  localTotal: number;
  /** Short human label ("Takeaway", "Table T4"). */
  label: string;
  createdAt: number;
  status: QueueStatus;
  attempts: number;
  lastError?: string;
  orderId?: string;
  orderNumber?: string;
  serverTotal?: number;
  /** Set when the kitchen ticket already printed at the original click. */
  kotPrinted?: boolean;
}

/** An entry this old is never sent automatically; staff must check it. */
export const QUEUE_SEND_TTL_MS = 2 * 60 * 60_000;
/** Confirmed entries are shown briefly, then dropped. */
export const CONFIRMED_KEEP_MS = 10 * 60_000;

const PREFIX = "easydine.orderQueue.v1";

export function queueKey(s: QueueScope): string {
  return `${PREFIX}:${s.tenantId}:${s.branchId}:${s.userId}:${s.deviceId}`;
}

export function newRequestId(random: () => string = defaultRandom): string {
  return `pos_${random()}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64);
}

function defaultRandom(): string {
  try {
    return crypto.randomUUID().replace(/-/g, "");
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

function sameScope(a: QueueScope, b: QueueScope): boolean {
  return a.tenantId === b.tenantId && a.branchId === b.branchId && a.userId === b.userId && a.deviceId === b.deviceId;
}

/** Entries of exactly this scope; anything malformed or foreign is ignored. */
export function loadQueue(storage: KeyValueStorage | null, scope: QueueScope, now: number = Date.now()): QueuedOrder[] {
  if (!storage) return [];
  try {
    const raw = storage.getItem(queueKey(scope));
    if (!raw) return [];
    const list = JSON.parse(raw) as QueuedOrder[];
    if (!Array.isArray(list)) return [];
    return list.filter(
      (e) =>
        e &&
        typeof e.requestId === "string" &&
        e.dto?.requestId === e.requestId &&
        e.scope &&
        sameScope(e.scope, scope) &&
        !(e.status === "confirmed" && now - e.createdAt > CONFIRMED_KEEP_MS + QUEUE_SEND_TTL_MS),
    );
  } catch {
    return [];
  }
}

export function saveQueue(storage: KeyValueStorage | null, scope: QueueScope, list: QueuedOrder[]): boolean {
  if (!storage) return false;
  try {
    if (list.length === 0) storage.removeItem(queueKey(scope));
    else storage.setItem(queueKey(scope), JSON.stringify(list));
    notify();
    return true;
  } catch {
    return false;
  }
}

/** Persist BEFORE sending. Returns false when the browser refused to store it. */
export function enqueue(storage: KeyValueStorage | null, entry: QueuedOrder): boolean {
  const list = loadQueue(storage, entry.scope).filter((e) => e.requestId !== entry.requestId);
  return saveQueue(storage, entry.scope, [...list, entry]);
}

export function updateEntry(
  storage: KeyValueStorage | null,
  scope: QueueScope,
  requestId: string,
  patch: Partial<Omit<QueuedOrder, "requestId" | "scope" | "dto">>,
): QueuedOrder | null {
  const list = loadQueue(storage, scope);
  const i = list.findIndex((e) => e.requestId === requestId);
  if (i < 0) return null;
  list[i] = { ...list[i], ...patch };
  saveQueue(storage, scope, list);
  return list[i];
}

export function removeEntry(storage: KeyValueStorage | null, scope: QueueScope, requestId: string): void {
  saveQueue(storage, scope, loadQueue(storage, scope).filter((e) => e.requestId !== requestId));
}

/** Drops confirmed entries older than CONFIRMED_KEEP_MS. */
export function pruneConfirmed(storage: KeyValueStorage | null, scope: QueueScope, now: number = Date.now()): void {
  const list = loadQueue(storage, scope, now);
  const kept = list.filter((e) => !(e.status === "confirmed" && now - e.createdAt > CONFIRMED_KEEP_MS));
  if (kept.length !== list.length) saveQueue(storage, scope, kept);
}

/** Orders not yet confirmed by the server (pending, syncing or needing attention). */
export function unsyncedCount(storage: KeyValueStorage | null, scope: QueueScope): number {
  return loadQueue(storage, scope).filter((e) => e.status !== "confirmed").length;
}

/** Every unsynced entry this browser holds for this user, in any branch (logout warning). */
export function unsyncedForUser(storage: (KeyValueStorage & { length?: number; key?: (i: number) => string | null }) | null, userId: string): number {
  if (!storage || typeof storage.length !== "number" || typeof storage.key !== "function") return 0;
  let n = 0;
  try {
    for (let i = 0; i < storage.length; i++) {
      const k = storage.key(i);
      if (!k || !k.startsWith(`${PREFIX}:`) || k.split(":")[3] !== userId) continue;
      const list = JSON.parse(storage.getItem(k) ?? "[]") as QueuedOrder[];
      n += Array.isArray(list) ? list.filter((e) => e.status !== "confirmed").length : 0;
    }
  } catch {
    /* ignore */
  }
  return n;
}

export type FailureKind = "uncertain" | "auth" | "rejected";

/**
 * What a failed create means. Network error, timeout or a server error is
 * UNCERTAIN (it may have been saved): keep, retry with the same id. 401/403
 * stop everything until the right user signs in. Any other 4xx is a real
 * refusal (validation, item gone, table closed): needs attention.
 */
export function classifyFailure(status: number | undefined): FailureKind {
  if (status === undefined || status === 0 || status === 408 || status === 429 || status >= 500) return "uncertain";
  if (status === 401 || status === 403) return "auth";
  return "rejected";
}

export function isExpired(e: QueuedOrder, now: number = Date.now()): boolean {
  return now - e.createdAt > QUEUE_SEND_TTL_MS;
}

// --- change feed for React (useSyncExternalStore) ---------------------------------

const listeners = new Set<() => void>();
let version = 0;
export function subscribeQueue(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (ev: StorageEvent) => {
    if (ev.key && ev.key.startsWith(PREFIX)) {
      version++;
      cb();
    }
  };
  if (typeof window !== "undefined") window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    if (typeof window !== "undefined") window.removeEventListener("storage", onStorage);
  };
}
export function queueVersion(): number {
  return version;
}
function notify() {
  version++;
  listeners.forEach((l) => l());
}
