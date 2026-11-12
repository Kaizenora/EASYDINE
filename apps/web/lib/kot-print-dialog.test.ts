import assert from "node:assert/strict";
import { test } from "node:test";
import { KOT_REQUESTED_MESSAGE, kotPageUrl, printKotInFrame, type KotPrintSlot } from "./kot-print-dialog.ts";

function fakeSlot(opts: { printThrows?: boolean } = {}) {
  const calls = { written: "", printed: 0, released: 0, focused: 0 };
  const attrs: Record<string, string> = {};
  const win = {
    focus: () => void calls.focused++,
    print: () => {
      if (opts.printThrows) throw new Error("blocked");
      calls.printed++;
    },
    addEventListener: () => undefined,
  };
  const doc = {
    open: () => undefined,
    write: (h: string) => void (calls.written += h),
    close: () => undefined,
  };
  const slot = {
    frame: { contentWindow: win, contentDocument: doc, setAttribute: (k: string, v: string) => void (attrs[k] = v) },
    release: () => void calls.released++,
  } as unknown as KotPrintSlot;
  return { slot, calls, attrs };
}

const okFetch = (html: string) =>
  (async () => ({ ok: true, status: 200, text: async () => html })) as unknown as typeof fetch;

test("KOT page URL carries branch, paper, device time zone and REPRINT flag", () => {
  const u = new URL(kotPageUrl("ord 1", "b-1", { reprint: true, paper: "58mm", timeZone: "Asia/Kolkata" }), "http://x");
  assert.equal(u.pathname, "/api/v1/orders/ord%201/kot");
  assert.equal(u.searchParams.get("branchId"), "b-1");
  assert.equal(u.searchParams.get("paper"), "58mm");
  assert.equal(u.searchParams.get("tz"), "Asia/Kolkata");
  assert.equal(u.searchParams.get("reprint"), "1");
  assert.equal(new URL(kotPageUrl("o", "b", {}), "http://x").searchParams.get("reprint"), null);
});

test("after acceptance: the ticket is written to the reserved frame and the dialog requested", async () => {
  const { slot, calls, attrs } = fakeSlot();
  const r = await printKotInFrame(slot, "o1", "b1", { fetchImpl: okFetch("<html><body>2× Paneer Tikka (Half)</body></html>") });
  assert.equal(r.status, "REQUESTED");
  assert.equal(r.message, KOT_REQUESTED_MESSAGE);
  assert.match(calls.written, /Paneer Tikka/);
  assert.equal(calls.printed, 1);
  assert.equal(calls.released, 0);
  assert.equal(attrs["data-easydine-kot-frame"], "print-requested");
});

test("the status never claims paper was printed", () => {
  assert.doesNotMatch(KOT_REQUESTED_MESSAGE, /successfully printed|was printed|KOT printed/i);
  assert.match(KOT_REQUESTED_MESSAGE, /cannot see whether it printed/);
  assert.match(KOT_REQUESTED_MESSAGE, /Reprint KOT/);
});

test("ticket cannot be loaded (e.g. other branch → 403): nothing printed, frame released", async () => {
  const { slot, calls } = fakeSlot();
  const denied = (async () => ({ ok: false, status: 403, text: async () => "" })) as unknown as typeof fetch;
  const r = await printKotInFrame(slot, "o1", "b-other", { fetchImpl: denied });
  assert.equal(r.status, "FAILED");
  assert.match(r.message, /not allowed for this branch/);
  assert.equal(calls.printed, 0);
  assert.equal(calls.released, 1);
});

test("network error while loading: nothing printed", async () => {
  const { slot, calls } = fakeSlot();
  const broken = (async () => {
    throw new Error("offline");
  }) as unknown as typeof fetch;
  const r = await printKotInFrame(slot, "o1", "b1", { fetchImpl: broken });
  assert.equal(r.status, "FAILED");
  assert.equal(calls.printed, 0);
});

test("print() blocked by the browser: reported as failed, Reprint offered", async () => {
  const { slot, calls } = fakeSlot({ printThrows: true });
  const r = await printKotInFrame(slot, "o1", "b1", { fetchImpl: okFetch("<p>x</p>") });
  assert.equal(r.status, "FAILED");
  assert.match(r.message, /Reprint KOT/);
  assert.equal(calls.released, 1);
});
