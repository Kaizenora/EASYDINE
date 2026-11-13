// Sends queued new orders when the connection is back (see order-queue.ts).
//
// Per entry: ask the server whether it already has this requestId (reconcile)
// and only if not, send the SAME body with the SAME id again. The server's
// unique (branchId, requestId) makes a racing duplicate return the first
// order. Prices are always the server's at confirmation; a difference from
// what the cart showed is reported, never silently accepted.
//
// Safety: one tab flushes at a time (Web Locks, or a short storage lease);
// the signed-in user is re-checked first and the flush stops on 401/403 or a
// different account; a refusal (4xx) stops that entry as "needs attention".
// Never marks anything paid and never prints: a confirmed order whose KOT did
// not print at the original click shows "use Reprint KOT".

import type { KeyValueStorage } from "./printer-routing.ts";
import {
  classifyFailure,
  isExpired,
  loadQueue,
  pruneConfirmed,
  updateEntry,
  type QueueScope,
  type QueuedOrder,
} from "./order-queue.ts";

export interface SyncedOrder {
  id: string;
  orderNumber?: string;
  totalAmount?: string | number;
}

export interface SyncDeps {
  storage: KeyValueStorage | null;
  scope: QueueScope;
  now?: () => number;
  /** Who is signed in right now, or null when the session is gone (401). */
  whoAmI: () => Promise<{ userId: string; restaurantId: string } | null>;
  findByRequestId: (branchId: string, requestId: string) => Promise<SyncedOrder | null>;
  createOrder: (branchId: string, dto: QueuedOrder["dto"]) => Promise<SyncedOrder>;
  /** Runs fn only if no other tab is flushing this scope; null = skipped. */
  withLock: <T>(name: string, fn: () => Promise<T>) => Promise<T | null>;
  /**
   * The server dedups by requestId (health feature "order-dedup"). Without it
   * a replay could double an order the first attempt saved, so nothing is
   * replayed: entries stay Pending until the server is updated.
   */
  serverDedups?: () => Promise<boolean>;
}

export interface SyncResult {
  skipped?: "locked" | "auth" | "account" | "server";
  confirmed: string[];
  stillPending: string[];
  needsAttention: string[];
}

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown })?.status;
  return typeof s === "number" ? s : undefined;
}

function messageOf(err: unknown): string {
  return err instanceof Error && err.message ? err.message : "Could not send the order";
}

function confirm(deps: SyncDeps, e: QueuedOrder, o: SyncedOrder) {
  const serverTotal = o.totalAmount !== undefined ? Number(o.totalAmount) : undefined;
  updateEntry(deps.storage, deps.scope, e.requestId, {
    status: "confirmed",
    orderId: o.id,
    orderNumber: o.orderNumber,
    serverTotal: Number.isFinite(serverTotal) ? serverTotal : undefined,
    lastError: undefined,
  });
}

export async function flushQueue(deps: SyncDeps): Promise<SyncResult> {
  const now = deps.now ?? Date.now;
  const result: SyncResult = { confirmed: [], stillPending: [], needsAttention: [] };
  const lockName = `easydine-order-sync:${deps.scope.tenantId}:${deps.scope.branchId}:${deps.scope.userId}`;
  const ran = await deps.withLock(lockName, async () => {
    const todo = loadQueue(deps.storage, deps.scope, now()).filter((e) => e.status === "pending" || e.status === "syncing");
    if (todo.length === 0) return true;

    // Same user, same restaurant, still signed in - before anything is replayed.
    let me: Awaited<ReturnType<SyncDeps["whoAmI"]>>;
    try {
      me = await deps.whoAmI();
    } catch (err) {
      if (classifyFailure(statusOf(err)) === "uncertain") {
        result.stillPending.push(...todo.map((e) => e.requestId));
        return true; // still offline: nothing touched
      }
      me = null;
    }
    if (!me) {
      result.skipped = "auth";
      for (const e of todo) {
        updateEntry(deps.storage, deps.scope, e.requestId, { status: "needs-attention", lastError: "Sign in again to send this order." });
        result.needsAttention.push(e.requestId);
      }
      return true;
    }
    if (me.userId !== deps.scope.userId || me.restaurantId !== deps.scope.tenantId) {
      result.skipped = "account";
      return true; // another account: never replay someone else's queue
    }
    if (deps.serverDedups && !(await deps.serverDedups().catch(() => false))) {
      result.skipped = "server";
      result.stillPending.push(...todo.map((e) => e.requestId));
      return true; // older server: a replay could double an order
    }

    for (const e of todo) {
      if (isExpired(e, now())) {
        // Too old to send blindly (the guest may have left, the table closed).
        let found: SyncedOrder | null = null;
        try {
          found = await deps.findByRequestId(deps.scope.branchId, e.requestId);
        } catch {
          /* leave it for staff */
        }
        if (found) {
          confirm(deps, e, found);
          result.confirmed.push(e.requestId);
        } else {
          updateEntry(deps.storage, deps.scope, e.requestId, {
            status: "needs-attention",
            lastError: "Not sent for over 2 hours. Check with the kitchen before entering it again.",
          });
          result.needsAttention.push(e.requestId);
        }
        continue;
      }
      updateEntry(deps.storage, deps.scope, e.requestId, { status: "syncing", attempts: e.attempts + 1 });
      try {
        const found = await deps.findByRequestId(deps.scope.branchId, e.requestId);
        const order = found ?? (await deps.createOrder(deps.scope.branchId, e.dto));
        confirm(deps, e, order);
        result.confirmed.push(e.requestId);
      } catch (err) {
        const kind = classifyFailure(statusOf(err));
        if (kind === "uncertain") {
          updateEntry(deps.storage, deps.scope, e.requestId, { status: "pending", lastError: messageOf(err) });
          result.stillPending.push(e.requestId);
          continue;
        }
        updateEntry(deps.storage, deps.scope, e.requestId, {
          status: "needs-attention",
          lastError: kind === "auth" ? "Sign in again to send this order." : messageOf(err),
        });
        result.needsAttention.push(e.requestId);
        if (kind === "auth") {
          result.skipped = "auth";
          break; // stop: every further call would fail the same way
        }
      }
    }
    pruneConfirmed(deps.storage, deps.scope, now());
    return true;
  });
  if (ran === null) result.skipped = "locked";
  return result;
}

/** Cross-tab lock: Web Locks when available, else a 30 s storage lease. */
export async function browserLock<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (locks?.request) {
    return locks.request(name, { ifAvailable: true }, async (lock) => (lock ? fn() : null)) as Promise<T | null>;
  }
  try {
    const key = `${name}:lease`;
    const held = Number(localStorage.getItem(key) ?? 0);
    if (held && Date.now() - held < 30_000) return null;
    localStorage.setItem(key, String(Date.now()));
    try {
      return await fn();
    } finally {
      localStorage.removeItem(key);
    }
  } catch {
    return fn();
  }
}
