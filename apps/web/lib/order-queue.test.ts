import assert from "node:assert/strict";
import { test } from "node:test";
import {
  QUEUE_SEND_TTL_MS,
  classifyFailure,
  enqueue,
  loadQueue,
  newRequestId,
  unsyncedCount,
  unsyncedForUser,
  type QueueScope,
  type QueuedOrder,
} from "./order-queue.ts";
import { flushQueue, type SyncDeps, type SyncedOrder } from "./order-sync.ts";

// --- fakes ---------------------------------------------------------------------

function memStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    get length() {
      return m.size;
    },
    key: (i: number) => [...m.keys()][i] ?? null,
  };
}

const A: QueueScope = { tenantId: "rest-A", branchId: "br-A", userId: "u-1", deviceId: "dev-1" };

function entry(scope: QueueScope, over: Partial<QueuedOrder> = {}): QueuedOrder {
  const requestId = over.requestId ?? newRequestId();
  return {
    requestId,
    scope,
    dto: { type: "TAKEAWAY", items: [{ menuItemId: "m1", quantity: 2, modifierIds: [] }], requestId },
    localTotal: 600,
    label: "Takeaway",
    createdAt: Date.now(),
    status: "pending",
    attempts: 1,
    ...over,
  };
}

/** A server that dedups by (branchId, requestId) like the real unique index. */
function fakeServer() {
  const orders = new Map<string, SyncedOrder>();
  let creates = 0;
  let n = 0;
  return {
    orders,
    get creates() {
      return creates;
    },
    find: async (b: string, rid: string) => orders.get(`${b}:${rid}`) ?? null,
    create: async (b: string, dto: QueuedOrder["dto"]) => {
      creates++;
      const k = `${b}:${dto.requestId}`;
      if (!orders.has(k)) orders.set(k, { id: `ord-${++n}`, orderNumber: `0${n}`, totalAmount: "600" });
      return orders.get(k)!;
    },
  };
}

function deps(storage: ReturnType<typeof memStorage>, scope: QueueScope, over: Partial<SyncDeps> = {}): SyncDeps {
  const srv = fakeServer();
  return {
    storage,
    scope,
    whoAmI: async () => ({ userId: scope.userId, restaurantId: scope.tenantId }),
    findByRequestId: srv.find,
    createOrder: srv.create,
    withLock: async (_n, fn) => fn(),
    ...over,
  };
}

const err = (status: number, message = "x") => Object.assign(new Error(message), { status });

// --- tests ---------------------------------------------------------------------

test("failures: network / timeout / 5xx are uncertain; 401/403 auth; other 4xx a refusal", () => {
  for (const s of [0, 408, 429, 500, 502, 503, undefined]) assert.equal(classifyFailure(s), "uncertain", String(s));
  assert.equal(classifyFailure(401), "auth");
  assert.equal(classifyFailure(403), "auth");
  for (const s of [400, 404, 409, 422]) assert.equal(classifyFailure(s), "rejected", String(s));
});

test("refresh: the immutable cart and the SAME requestId survive a reload", () => {
  const st = memStorage();
  const e = entry(A);
  assert.equal(enqueue(st, e), true);
  const [again] = loadQueue(st, A);
  assert.equal(again.requestId, e.requestId);
  assert.deepEqual(again.dto, e.dto);
  assert.equal(again.dto.requestId, e.requestId);
});

test("offline then online: nothing touched while offline, then sent once and confirmed", async () => {
  const st = memStorage();
  const e = entry(A);
  enqueue(st, e);
  const srv = fakeServer();
  const offline = await flushQueue(deps(st, A, { whoAmI: async () => { throw err(0); }, findByRequestId: srv.find, createOrder: srv.create }));
  assert.deepEqual(offline.stillPending, [e.requestId]);
  assert.equal(loadQueue(st, A)[0].status, "pending");
  assert.equal(srv.creates, 0);

  const online = await flushQueue(deps(st, A, { findByRequestId: srv.find, createOrder: srv.create }));
  assert.deepEqual(online.confirmed, [e.requestId]);
  const [done] = loadQueue(st, A);
  assert.equal(done.status, "confirmed");
  assert.equal(done.orderNumber, "01");
  assert.equal(srv.orders.size, 1);
});

test("server saved it but the answer timed out: reconcile finds it, nothing is created again", async () => {
  const st = memStorage();
  const e = entry(A);
  enqueue(st, e);
  const srv = fakeServer();
  await srv.create(A.branchId, e.dto); // the original request reached the server
  const before = srv.creates;
  const r = await flushQueue(deps(st, A, { findByRequestId: srv.find, createOrder: srv.create }));
  assert.deepEqual(r.confirmed, [e.requestId]);
  assert.equal(srv.creates, before, "no second create");
  assert.equal(srv.orders.size, 1);
});

test("one logical order = one server order, however many retries race", async () => {
  const st = memStorage();
  const e = entry(A);
  enqueue(st, e);
  const srv = fakeServer();
  // The original click + a timeout retry + a flush, all with the same id.
  await Promise.all([srv.create(A.branchId, e.dto), srv.create(A.branchId, e.dto)]);
  await flushQueue(deps(st, A, { findByRequestId: async () => null, createOrder: srv.create }));
  assert.equal(srv.orders.size, 1);
});

test("two tabs: only one flushes at a time (the other is skipped, not doubled)", async () => {
  const st = memStorage();
  enqueue(st, entry(A));
  const srv = fakeServer();
  let held = false;
  const lock: SyncDeps["withLock"] = async (_n, fn) => {
    if (held) return null;
    held = true;
    try {
      return await fn();
    } finally {
      held = false;
    }
  };
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const slowFind = async (b: string, rid: string) => {
    await gate;
    return srv.find(b, rid);
  };
  const t1 = flushQueue(deps(st, A, { withLock: lock, findByRequestId: slowFind, createOrder: srv.create }));
  const t2 = await flushQueue(deps(st, A, { withLock: lock, findByRequestId: slowFind, createOrder: srv.create }));
  assert.equal(t2.skipped, "locked");
  release();
  await t1;
  assert.equal(srv.creates, 1);
});

test("logout / account switch: another account never sees or replays the queue", async () => {
  const st = memStorage();
  const e = entry(A);
  enqueue(st, e);
  const B: QueueScope = { ...A, userId: "u-2" };
  assert.deepEqual(loadQueue(st, B), [], "different user, different queue");
  const C: QueueScope = { ...A, tenantId: "rest-B" };
  assert.deepEqual(loadQueue(st, C), [], "different restaurant, different queue");

  // Tab still holds A's scope but the session is now someone else's: stop.
  const srv = fakeServer();
  const r = await flushQueue(deps(st, A, { whoAmI: async () => ({ userId: "u-2", restaurantId: "rest-A" }), findByRequestId: srv.find, createOrder: srv.create }));
  assert.equal(r.skipped, "account");
  assert.equal(srv.creates, 0);
  assert.equal(loadQueue(st, A)[0].status, "pending", "kept for its owner");
  assert.equal(unsyncedForUser(st, "u-1"), 1, "logout warning counts it");
  assert.equal(unsyncedForUser(st, "u-2"), 0);
});

test("signed out (401): flush stops and marks Needs attention, nothing sent", async () => {
  const st = memStorage();
  const e = entry(A);
  enqueue(st, e);
  const srv = fakeServer();
  const r = await flushQueue(deps(st, A, { whoAmI: async () => null, findByRequestId: srv.find, createOrder: srv.create }));
  assert.equal(r.skipped, "auth");
  assert.equal(loadQueue(st, A)[0].status, "needs-attention");
  assert.equal(srv.creates, 0);
});

test("a refusal (item gone, table closed) stops that order as Needs attention; others continue", async () => {
  const st = memStorage();
  const bad = entry(A);
  const good = entry(A);
  enqueue(st, bad);
  enqueue(st, good);
  const srv = fakeServer();
  const r = await flushQueue(
    deps(st, A, {
      findByRequestId: srv.find,
      createOrder: async (b, dto) => {
        if (dto.requestId === bad.requestId) throw err(409, "That table is out of service");
        return srv.create(b, dto);
      },
    }),
  );
  assert.deepEqual(r.needsAttention, [bad.requestId]);
  assert.deepEqual(r.confirmed, [good.requestId]);
  const byId = Object.fromEntries(loadQueue(st, A).map((e) => [e.requestId, e]));
  assert.equal(byId[bad.requestId].status, "needs-attention");
  assert.match(byId[bad.requestId].lastError ?? "", /out of service/);
});

test("still flaky mid-flush: back to Pending (same id), retried later", async () => {
  const st = memStorage();
  const e = entry(A);
  enqueue(st, e);
  const r = await flushQueue(deps(st, A, { findByRequestId: async () => null, createOrder: async () => { throw err(503); } }));
  assert.deepEqual(r.stillPending, [e.requestId]);
  const [again] = loadQueue(st, A);
  assert.equal(again.status, "pending");
  assert.equal(again.requestId, e.requestId);
  assert.equal(again.attempts, 2);
});

test("expired (over 2 h): never sent blindly; confirmed if the server has it, else Needs attention", async () => {
  const st = memStorage();
  const old = entry(A, { createdAt: Date.now() - QUEUE_SEND_TTL_MS - 1 });
  enqueue(st, old);
  const srv = fakeServer();
  const r = await flushQueue(deps(st, A, { findByRequestId: srv.find, createOrder: srv.create }));
  assert.deepEqual(r.needsAttention, [old.requestId]);
  assert.equal(srv.creates, 0);
});

test("changed prices: the server's total is recorded next to what the cart showed", async () => {
  const st = memStorage();
  const e = entry(A, { localTotal: 600 });
  enqueue(st, e);
  const r = await flushQueue(
    deps(st, A, { findByRequestId: async () => null, createOrder: async () => ({ id: "o1", orderNumber: "07", totalAmount: "640.00" }) }),
  );
  assert.deepEqual(r.confirmed, [e.requestId]);
  const [done] = loadQueue(st, A);
  assert.equal(done.serverTotal, 640);
  assert.equal(done.localTotal, 600);
  assert.equal(unsyncedCount(st, A), 0);
});

test("request ids are unique and server-safe", () => {
  const ids = new Set(Array.from({ length: 500 }, () => newRequestId()));
  assert.equal(ids.size, 500);
  for (const id of ids) assert.match(id, /^[A-Za-z0-9_-]{8,64}$/);
});

test("older server without request-id dedup: nothing is replayed, entries stay Pending", async () => {
  const st = memStorage();
  const e = entry(A);
  enqueue(st, e);
  const srv = fakeServer();
  const r = await flushQueue(deps(st, A, { serverDedups: async () => false, findByRequestId: srv.find, createOrder: srv.create }));
  assert.equal(r.skipped, "server");
  assert.deepEqual(r.stillPending, [e.requestId]);
  assert.equal(srv.creates, 0);
  assert.equal(loadQueue(st, A)[0].status, "pending");
});
