import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { browserKotDecision, classifyBridgeFailure } from "./printer-routing.ts";

// The bridge module reads window.localStorage for the pairing; give it one.
const store = new Map<string, string>();
const fakeStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
(globalThis as unknown as { window: unknown }).window = { localStorage: fakeStorage };

const bridge = await import("./local-printer-bridge.ts");
const { BridgeError, __setHelperFetchForTests, bridgeKind, detectBridge, getHelperPairing, pairHelper, printHtmlLocal, printRawLocal, listInstalledPrinters } = bridge;

type Call = { url: string; init: RequestInit & { targetAddressSpace?: string } };
let calls: Call[] = [];

function respond(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

function stubFetch(handler: (c: Call) => Response | Promise<Response>) {
  __setHelperFetchForTests((async (url: string, init: RequestInit) => {
    const c = { url, init } as Call;
    calls.push(c);
    return handler(c);
  }) as unknown as typeof fetch);
}

const TOKEN = "t".repeat(43);

beforeEach(() => {
  store.clear();
  calls = [];
  __setHelperFetchForTests(null);
});

test("Accept & KOT (browser route): dialog for BROWSER and for an older server that printed nothing", () => {
  assert.equal(browserKotDecision("BROWSER"), "dialog");
  // A server that predates kotVia=browser ignores it and answers NO_PRINTER: it printed nothing.
  assert.equal(browserKotDecision("NO_PRINTER"), "dialog");
  assert.equal(browserKotDecision("FAILED"), "dialog");
  assert.equal(browserKotDecision(undefined), "dialog");
});

test("Accept & KOT (browser route): no dialog when the server already sent it or may have (no duplicate)", () => {
  assert.equal(browserKotDecision("SENT"), "server-sent");
  assert.equal(browserKotDecision("PRINTED"), "server-sent");
  assert.equal(browserKotDecision("UNKNOWN"), "server-unknown");
  assert.equal(browserKotDecision("NO_TICKETS"), "no-tickets");
});

test("older server + scheduled order far ahead: no ticket yet, no dialog", () => {
  const now = Date.parse("2026-11-12T10:00:00Z");
  assert.equal(browserKotDecision("NO_PRINTER", "2026-11-12T12:00:00Z", now), "no-tickets");
  // Within the 25-minute lead the kitchen already has it.
  assert.equal(browserKotDecision("NO_PRINTER", "2026-11-12T10:10:00Z", now), "dialog");
});

test("no pairing: no helper, nothing is contacted", async () => {
  stubFetch(() => respond(200, { ok: true, version: 1 }));
  assert.equal(bridgeKind(), null);
  assert.equal(await detectBridge(), false);
  assert.equal(calls.length, 0);
});

test("pairing: code checked locally, sent once to loopback with the LNA hint, no cookies; token stored", async () => {
  await assert.rejects(pairHelper("12a456"), (e: unknown) => e instanceof BridgeError && e.code === "BAD_CODE");
  assert.equal(calls.length, 0);

  stubFetch(() => respond(200, { ok: true, token: TOKEN, version: 1 }));
  const p = await pairHelper("123 456", 17821);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://127.0.0.1:17821/v1/pair");
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.credentials, "omit");
  assert.equal(calls[0].init.targetAddressSpace, "loopback");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { code: "123456" });
  assert.equal(p.token, TOKEN);
  assert.equal(getHelperPairing()?.token, TOKEN);
  assert.equal(bridgeKind(), "helper");
});

test("wrong code: helper refuses, nothing stored", async () => {
  stubFetch(() => respond(403, { ok: false, code: "BAD_CODE", error: "Wrong pairing code." }));
  await assert.rejects(pairHelper("000000"), /Wrong pairing code/);
  assert.equal(getHelperPairing(), null);
});

async function paired() {
  stubFetch(() => respond(200, { ok: true, token: TOKEN, version: 1 }));
  await pairHelper("123456");
  calls = [];
}

test("helper running: hello + printers carry the token", async () => {
  await paired();
  stubFetch((c) =>
    c.url.endsWith("/v1/hello")
      ? respond(200, { ok: true, version: 1 })
      : respond(200, { ok: true, printers: [{ name: "Kitchen TM-T82", isDefault: false }] }),
  );
  assert.equal(await detectBridge(), true);
  const list = await listInstalledPrinters();
  assert.deepEqual(list.map((p) => p.name), ["Kitchen TM-T82"]);
  for (const c of calls) assert.equal((c.init.headers as Record<string, string>).Authorization, `Bearer ${TOKEN}`);
});

test("helper stopped: detect says no bridge (caller falls back to the print dialog)", async () => {
  await paired();
  stubFetch(() => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(await detectBridge(), false);
});

test("print: exact printer name sent; missing printer is FAILED, not replaced", async () => {
  await paired();
  stubFetch(() => respond(404, { ok: false, code: "PRINTER_NOT_FOUND", error: '"Kitchen" is not installed on this PC.' }));
  await assert.rejects(printRawLocal("Kitchen", ["G0A="], "KOT"), (e: unknown) => e instanceof BridgeError && e.code === "PRINTER_NOT_FOUND");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { printer: "Kitchen", data: ["G0A="], docName: "KOT" });
  assert.equal(classifyBridgeFailure("PRINTER_NOT_FOUND"), "FAILED");
});

test("print: connection lost mid-job is UNKNOWN (may have printed, never resent)", async () => {
  await paired();
  stubFetch(() => {
    throw new TypeError("Failed to fetch");
  });
  await assert.rejects(printRawLocal("Kitchen", ["G0A="], "KOT"), (e: unknown) => {
    assert.ok(e instanceof BridgeError);
    assert.equal(e.code, "HELPER_LOST");
    assert.equal(classifyBridgeFailure(e.code), "UNKNOWN");
    return true;
  });
});

test("print: queued with a Windows offline warning is passed on", async () => {
  await paired();
  stubFetch(() => respond(200, { ok: true, jobs: 1, warning: "Windows reports the printer as offline." }));
  const r = await printRawLocal("Kitchen", ["G0A="], "KOT");
  assert.equal(r.warning, "Windows reports the printer as offline.");
});

test("unpaired on the helper side: FORBIDDEN, no print", async () => {
  await paired();
  stubFetch(() => respond(401, { ok: false, code: "FORBIDDEN", error: "Not paired." }));
  await assert.rejects(printRawLocal("Kitchen", ["G0A="], "KOT"), (e: unknown) => e instanceof BridgeError && e.code === "FORBIDDEN");
  assert.equal(classifyBridgeFailure("FORBIDDEN"), "FAILED");
});

test("helper is thermal only: driver/HTML pages are refused before any request", async () => {
  await paired();
  stubFetch(() => respond(200, { ok: true }));
  await assert.rejects(printHtmlLocal("Kitchen", ["<p>x</p>"], "A4", "KOT"), (e: unknown) => e instanceof BridgeError && e.code === "UNSUPPORTED");
  assert.equal(calls.length, 0);
});

test("helper stopped: remembered as down, so a KOT can open the dialog at once", async () => {
  await paired();
  bridge.__setLastHelperProbeForTests(null);
  assert.equal(bridge.helperKnownDown(), false, "unknown is not 'down'");
  stubFetch(() => {
    throw new TypeError("Failed to fetch");
  });
  assert.equal(await detectBridge(), false);
  assert.equal(bridge.helperKnownDown(), true);
  // Forgotten after a minute: the next action checks again.
  assert.equal(bridge.helperKnownDown(Date.now() + 61_000), false);
});

test("helper back: one good answer clears 'down' (direct printing again)", async () => {
  await paired();
  bridge.__setLastHelperProbeForTests({ ok: false, at: Date.now() });
  stubFetch(() => respond(200, { ok: true, version: 1 }));
  assert.equal(await detectBridge(), true);
  assert.equal(bridge.helperKnownDown(), false);
});
