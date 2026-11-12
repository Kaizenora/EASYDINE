import assert from "node:assert/strict";
import { test } from "node:test";
import {
  acceptKotQuery,
  classifyBridgeFailure,
  clearMapping,
  createSingleFlight,
  describeOutcome,
  deviceId,
  isSameMachineAsServer,
  loadMappings,
  mappingKey,
  resolveRoute,
  saveMapping,
  type KeyValueStorage,
} from "./printer-routing.ts";
import { BridgeError, detectBridge, listInstalledPrinters, prepareHtmlForLocalPrint, printRawLocal } from "./local-printer-bridge.ts";

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

test("mappings are saved per tenant and branch (branch isolation)", () => {
  const s = memoryStorage();
  saveMapping(s, "rest-1", "branch-A", "kitchen", { printerName: "Kitchen TM", paper: "80mm" });
  saveMapping(s, "rest-1", "branch-A", "bill", { printerName: "Front Desk", paper: "58mm" });
  assert.equal(loadMappings(s, "rest-1", "branch-A").kitchen?.printerName, "Kitchen TM");
  assert.equal(loadMappings(s, "rest-1", "branch-A").bill?.paper, "58mm");
  assert.deepEqual(loadMappings(s, "rest-1", "branch-B"), {});
  assert.deepEqual(loadMappings(s, "rest-2", "branch-A"), {});
  assert.deepEqual(loadMappings(s, null, "branch-A"), {});
  assert.notEqual(mappingKey("rest-1", "branch-A"), mappingKey("rest-1", "branch-B"));
});

test("A4 is always saved as a driver-rendered page; thermal defaults to ESC/POS", () => {
  const s = memoryStorage();
  const m = saveMapping(s, "r", "b", "bill", { printerName: "Office Laser", paper: "A4", method: "escpos" });
  assert.equal(m.bill?.method, "driver");
  const k = saveMapping(s, "r", "b", "kitchen", { printerName: "T", paper: "58mm" });
  assert.equal(k.kitchen?.method, "escpos");
});

test("saving without a printer is refused; nothing is guessed", () => {
  const s = memoryStorage();
  assert.throws(() => saveMapping(s, "r", "b", "bill", { printerName: "  ", paper: "80mm" }));
  assert.equal(s.data.size, 0);
});

test("corrupt or tampered storage yields no mapping", () => {
  const s = memoryStorage();
  s.setItem(mappingKey("r", "b"), "{not json");
  assert.deepEqual(loadMappings(s, "r", "b"), {});
  s.setItem(mappingKey("r", "b"), JSON.stringify({ kitchen: { printerName: "X", paper: "99mm" } }));
  assert.deepEqual(loadMappings(s, "r", "b"), {});
});

test("clearing one role keeps the other; clearing both removes the key", () => {
  const s = memoryStorage();
  saveMapping(s, "r", "b", "bill", { printerName: "B", paper: "80mm" });
  saveMapping(s, "r", "b", "kitchen", { printerName: "K", paper: "80mm" });
  assert.equal(clearMapping(s, "r", "b", "bill").kitchen?.printerName, "K");
  clearMapping(s, "r", "b", "kitchen");
  assert.equal(s.getItem(mappingKey("r", "b")), null);
});

test("routing: bill and kitchen go to their own printers, never to each other", () => {
  const mappings = {
    bill: { printerName: "Front Desk", paper: "80mm" as const, method: "escpos" as const, transport: "bridge" as const, savedAt: "" },
    kitchen: { printerName: "Kitchen TM", paper: "80mm" as const, method: "escpos" as const, transport: "bridge" as const, savedAt: "" },
  };
  const installed = [{ name: "Front Desk" }, { name: "Kitchen TM" }, { name: "Microsoft Print to PDF", isDefault: true }];
  const bill = resolveRoute("bill", true, mappings, installed);
  const kitchen = resolveRoute("kitchen", true, mappings, installed);
  assert.equal(bill.kind === "local" && bill.mapping.printerName, "Front Desk");
  assert.equal(kitchen.kind === "local" && kitchen.mapping.printerName, "Kitchen TM");
});

test("routing: a missing saved printer must be re-selected (no default / other printer)", () => {
  const mappings = { kitchen: { printerName: "Kitchen TM", paper: "80mm" as const, method: "escpos" as const, transport: "bridge" as const, savedAt: "" } };
  const r = resolveRoute("kitchen", true, mappings, [{ name: "Microsoft Print to PDF", isDefault: true }, { name: "Front Desk" }]);
  assert.deepEqual(r, { kind: "missing", printerName: "Kitchen TM" });
  assert.equal(acceptKotQuery(r), "&kotVia=none");
});

test("routing: name match is exact (no fuzzy match onto a similar printer)", () => {
  const mappings = { kitchen: { printerName: "Kitchen", paper: "80mm" as const, method: "escpos" as const, transport: "bridge" as const, savedAt: "" } };
  assert.equal(resolveRoute("kitchen", true, mappings, [{ name: "Kitchen (Copy 1)" }, { name: "kitchen" }]).kind, "missing");
});

test("routing: no bridge or nothing saved keeps the existing behaviour", () => {
  const mappings = { kitchen: { printerName: "K", paper: "80mm" as const, method: "escpos" as const, transport: "bridge" as const, savedAt: "" } };
  assert.deepEqual(resolveRoute("kitchen", false, mappings, null), { kind: "default", reason: "no-bridge" });
  assert.deepEqual(resolveRoute("bill", true, mappings, [{ name: "K" }]), { kind: "default", reason: "not-configured" });
  assert.equal(acceptKotQuery({ kind: "default", reason: "no-bridge" }), "");
});

test("routing: unreadable printer list still uses the saved name (bridge reports a missing one)", () => {
  const mappings = { kitchen: { printerName: "K", paper: "58mm" as const, method: "driver" as const, transport: "bridge" as const, savedAt: "" } };
  const r = resolveRoute("kitchen", true, mappings, null);
  assert.equal(r.kind, "local");
  const q = new URLSearchParams(acceptKotQuery(r, "Asia/Kolkata").slice(1));
  assert.equal(q.get("kotVia"), "device");
  assert.equal(q.get("kotFormat"), "html");
  assert.equal(q.get("kotPaper"), "58mm");
  assert.equal(q.get("tz"), "Asia/Kolkata");
});

test("failure classification: only 'nothing reached the printer' is FAILED; maybe-printed is UNKNOWN", () => {
  for (const c of ["PRINTER_NOT_FOUND", "PRINTER_UNAVAILABLE", "RAW_REJECTED", "NO_BRIDGE", "FAILED"]) assert.equal(classifyBridgeFailure(c), "FAILED");
  for (const c of ["TIMEOUT", "PARTIAL", "ERROR", "HELPER_LOST", "SOMETHING_NEW"]) assert.equal(classifyBridgeFailure(c), "UNKNOWN");
});

test("messages never claim paper came out", () => {
  const queued = describeOutcome("KOT", "QUEUED", "Kitchen TM");
  assert.match(queued, /Windows print queue/);
  assert.match(queued, /not proof it printed/);
  assert.match(describeOutcome("KOT", "QUEUED", "K", "Windows reports the printer as offline."), /Note: Windows reports the printer as offline/);
  assert.match(queued, /Check the printer/);
  assert.doesNotMatch(queued, /\bprinted successfully\b/i);
  assert.match(describeOutcome("KOT", "UNKNOWN", "K"), /not resent automatically/);
  assert.match(describeOutcome("Bill", "FAILED", "B", "offline"), /NOT printed.*offline/);
});

test("single flight: double click / re-click while running starts only one request", async () => {
  const sf = createSingleFlight();
  let calls = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const first = sf.run("accept:o1", async () => {
    calls++;
    await gate;
    return "done";
  });
  const second = await sf.run("accept:o1", async () => {
    calls++;
    return "dup";
  });
  assert.equal(second, null);
  assert.equal(sf.isRunning("accept:o1"), true);
  release();
  assert.equal(await first, "done");
  assert.equal(calls, 1);
  // A different order is independent.
  assert.equal(await sf.run("accept:o2", async () => "other"), "other");
});

test("device id is stable per browser profile", () => {
  const s = memoryStorage();
  const a = deviceId(s, () => "11111111-aaaa");
  const b = deviceId(s, () => "22222222-bbbb");
  assert.equal(a, "11111111-aaaa");
  assert.equal(b, a);
  assert.equal(deviceId(null), null);
});

// --- bridge client --------------------------------------------------------------

type BridgeMsg = { id: string; type: string; printer?: string; data?: string[] };

function withWebView(handler: (msg: BridgeMsg, reply: (m: unknown) => void) => void, run: () => Promise<void>) {
  const prev = Object.getOwnPropertyDescriptor(globalThis, "window");
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const reply = (m: unknown) => setTimeout(() => listeners.forEach((l) => l({ data: m })), 0);
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      chrome: {
        webview: {
          postMessage: (msg: unknown) => handler(msg as BridgeMsg, reply),
          addEventListener: (_t: string, cb: (e: { data: unknown }) => void) => listeners.push(cb),
        },
      },
    },
  });
  return run().finally(() => {
    if (prev) Object.defineProperty(globalThis, "window", prev);
    else delete (globalThis as { window?: unknown }).window;
  });
}

test("bridge: lists printers and sends raw jobs to the named printer only", async () => {
  const seen: BridgeMsg[] = [];
  await withWebView(
    (msg, reply) => {
      seen.push(msg);
      if (msg.type === "hello") reply({ channel: "easydine-print", id: msg.id, ok: true, result: { version: 1 } });
      if (msg.type === "list") reply({ channel: "easydine-print", id: msg.id, ok: true, result: { printers: [{ name: "Kitchen TM" }] } });
      if (msg.type === "printRaw") reply({ channel: "easydine-print", id: msg.id, ok: true, result: { status: "QUEUED", jobs: 1 } });
    },
    async () => {
      assert.equal(await detectBridge(), true);
      assert.deepEqual(await listInstalledPrinters(), [{ name: "Kitchen TM" }]);
      assert.deepEqual(await printRawLocal("Kitchen TM", ["AA=="], "KOT"), { status: "QUEUED", jobs: 1 });
      const job = seen.find((m) => m.type === "printRaw")!;
      assert.equal(job.printer, "Kitchen TM");
      assert.deepEqual(job.data, ["AA=="]);
    },
  );
});

test("bridge: an empty printer name is rejected before anything is sent", async () => {
  let sent = 0;
  await withWebView(
    () => void sent++,
    async () => {
      await assert.rejects(printRawLocal("", ["AA=="], "KOT"), (e: unknown) => e instanceof BridgeError && e.code === "NO_PRINTER");
      assert.equal(sent, 0);
    },
  );
});

test("bridge: errors keep their code (missing printer)", async () => {
  await withWebView(
    (msg, reply) => reply({ channel: "easydine-print", id: msg.id, ok: false, code: "PRINTER_NOT_FOUND", error: "gone" }),
    async () => {
      await assert.rejects(printRawLocal("Kitchen TM", ["AA=="], "KOT"), (e: unknown) => e instanceof BridgeError && e.code === "PRINTER_NOT_FOUND");
    },
  );
});

test("bridge: replies from other channels or unknown ids are ignored", async () => {
  await withWebView(
    (msg, reply) => {
      reply({ channel: "other", id: msg.id, ok: true, result: { printers: [{ name: "evil" }] } });
      reply({ channel: "easydine-print", id: "not-this-one", ok: true, result: { printers: [{ name: "evil" }] } });
      reply({ channel: "easydine-print", id: msg.id, ok: true, result: { printers: [{ name: "Real" }] } });
    },
    async () => {
      assert.deepEqual(await listInstalledPrinters(), [{ name: "Real" }]);
    },
  );
});

test("no bridge in a plain browser", async () => {
  assert.equal(await detectBridge(), false);
  await assert.rejects(printRawLocal("K", ["AA=="], "x"), (e: unknown) => e instanceof BridgeError && e.code === "NO_BRIDGE");
});

test("html prepared for local printing: base URL first, paper size last", () => {
  const out = prepareHtmlForLocalPrint('<html><head><style>body{width:80mm}</style></head><body>x</body></html>', "http://192.168.1.10:3000", "58mm");
  assert.ok(out.indexOf("<base href=\"http://192.168.1.10:3000/\">") < out.indexOf("<style>body{width:80mm}"));
  assert.ok(out.indexOf("easydine-local-paper") > out.indexOf("<style>body{width:80mm}"));
  assert.match(out, /size: 58mm/);
  assert.match(prepareHtmlForLocalPrint("<p>x</p>", "http://h", "A4"), /size: A4/);
});

// --- server-on-this-PC route (no install) ----------------------------------------

test("server route: thermal only (A4 refused), always raw commands", () => {
  const s = memoryStorage();
  assert.throws(() => saveMapping(s, "r", "b", "bill", { printerName: "Laser", paper: "A4", transport: "server" }), /A4/);
  const m = saveMapping(s, "r", "b", "kitchen", { printerName: "Kitchen TM", paper: "58mm", method: "driver", transport: "server" });
  assert.equal(m.kitchen?.transport, "server");
  assert.equal(m.kitchen?.method, "escpos");
});

test("old saved mappings without a transport are read as the Windows-app bridge", () => {
  const s = memoryStorage();
  s.setItem(mappingKey("r", "b"), JSON.stringify({ kitchen: { printerName: "K", paper: "80mm", method: "escpos" } }));
  assert.equal(loadMappings(s, "r", "b").kitchen?.transport, "bridge");
});

test("server route: accept asks the server to print on the chosen printer by exact name", () => {
  const mappings = { kitchen: { printerName: "Kitchen TM #2", paper: "80mm" as const, method: "escpos" as const, transport: "server" as const, savedAt: "" } };
  const r = resolveRoute("kitchen", true, mappings, [{ name: "Kitchen TM #2" }]);
  const q = new URLSearchParams(acceptKotQuery(r, "Asia/Kolkata").slice(1));
  assert.equal(q.get("kotVia"), "spooler");
  assert.equal(q.get("kotPrinter"), "Kitchen TM #2");
  assert.equal(q.get("kotPaper"), "80mm");
  assert.equal(q.get("tz"), "Asia/Kolkata");
});

test("server route: missing printer on the server PC → accept without printing anywhere", () => {
  const mappings = { kitchen: { printerName: "Kitchen TM", paper: "80mm" as const, method: "escpos" as const, transport: "server" as const, savedAt: "" } };
  const r = resolveRoute("kitchen", true, mappings, [{ name: "Microsoft Print to PDF" }]);
  assert.equal(acceptKotQuery(r), "&kotVia=none");
});

test("same-PC detection only trusts loopback addresses", () => {
  for (const h of ["localhost", "127.0.0.1", "[::1]", "easydine.localhost"]) assert.equal(isSameMachineAsServer(h), true, h);
  for (const h of ["192.168.1.20", "pos.local", "easydine.example.com", "localhost.evil.com"]) assert.equal(isSameMachineAsServer(h), false, h);
});
