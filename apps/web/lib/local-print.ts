// Cashier-PC printing: Accept & KOT, KOT reprint, bills and test pages routed
// to the printers saved on THIS device (see lib/printer-routing.ts) through
// the EasyDine Windows app's local print bridge (lib/local-printer-bridge.ts).
//
// When there is no bridge, or nothing is saved for a role, every function
// here hands back "default" and callers keep the existing behaviour (server
// printer or the browser print dialog, labelled as such).
import { api, ApiError } from "./api.ts";
import {
  BridgeError,
  detectBridge,
  hasBridgeHost,
  listInstalledPrinters,
  prepareHtmlForLocalPrint,
  printHtmlLocal,
  printRawLocal,
} from "./local-printer-bridge.ts";
import { billQueryString, buildSampleReceiptHtml, getCashierPaperSize, registerBillPrintRouter, type BillQuery } from "./print.ts";
import { printKotInFrame, reserveKotPrintFrame, type KotPrintSlot } from "./kot-print-dialog.ts";
import {
  acceptKotQuery,
  classifyBridgeFailure,
  createSingleFlight,
  describeOutcome,
  deviceId,
  isMissingPrinterCode,
  isSameMachineAsServer,
  loadMappings,
  resolveRoute,
  type DevicePrinterMappings,
  type KeyValueStorage,
  type LocalPrintStatus,
  type PrinterMapping,
  type PrinterRole,
  type Route,
} from "./printer-routing.ts";
import { toast } from "./toast.ts";

export interface PrintScope {
  tenantId: string | null;
  branchId: string | null;
}

export function browserStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

// --- active scope (set once by <LocalPrinterScope/> in the dashboard layout) ---

let activeScope: PrintScope = { tenantId: null, branchId: null };
export function setActivePrintScope(scope: PrintScope) {
  activeScope = scope;
}
export function getActivePrintScope(): PrintScope {
  return activeScope;
}

export function getMappings(scope: PrintScope): DevicePrinterMappings {
  return loadMappings(browserStorage(), scope.tenantId, scope.branchId);
}

/** True when this browser is open on the PC that runs the EasyDine server. */
export function onServerPc(): boolean {
  return typeof window !== "undefined" && isSameMachineAsServer(window.location.hostname);
}

/** Printers installed in Windows on the server PC (only meaningful when onServerPc()). */
export async function listServerPrinters(branchId: string | null): Promise<{ supported: boolean; printers: { name: string }[] }> {
  return api.get(`/orders/print/local/printers${branchId ? `?branchId=${branchId}` : ""}`);
}

/** Where a print for `role` goes right now (checks the printer is still installed). */
export async function routeFor(role: PrinterRole, scope: PrintScope): Promise<Route> {
  const mappings = getMappings(scope);
  const saved = mappings[role];
  if (!saved) return { kind: "default", reason: hasBridgeHost() || onServerPc() ? "not-configured" : "no-bridge" };
  if (saved.transport === "server") {
    // Saved on the server PC: usable only from a browser on that PC.
    if (!onServerPc()) return resolveRoute(role, false, mappings, null);
    const list = await listServerPrinters(scope.branchId).catch(() => null);
    if (list && !list.supported) return resolveRoute(role, false, mappings, null);
    return resolveRoute(role, true, mappings, list ? list.printers : null);
  }
  const bridge = await detectBridge();
  const installed = bridge ? await listInstalledPrinters().catch(() => null) : null;
  return resolveRoute(role, bridge, mappings, installed);
}

// --- outcome feed (inline status in the orders screen; never "printed") -------

export interface LocalPrintEvent {
  orderId: string | null;
  what: "KOT" | "Bill" | "Test page";
  /** REQUESTED = browser print dialog opened; paper cannot be confirmed. */
  status: LocalPrintStatus | "SKIPPED" | "REQUESTED";
  message: string;
  canReprint: boolean;
  at: number;
}

const lastByOrder = new Map<string, LocalPrintEvent>();
const listeners = new Set<() => void>();

function publish(e: LocalPrintEvent) {
  if (e.orderId) lastByOrder.set(`${e.what}:${e.orderId}`, e);
  listeners.forEach((l) => l());
}

export function subscribeLocalPrint(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function lastLocalPrint(orderId: string | null | undefined, what: "KOT" | "Bill"): LocalPrintEvent | null {
  return orderId ? (lastByOrder.get(`${what}:${orderId}`) ?? null) : null;
}

// --- sending -------------------------------------------------------------------

interface DeviceTickets {
  printed: { id: string; ticketNumber: string; reprint: number }[];
  escpos?: string[];
  html?: string[];
}

async function sendToBridge(
  mapping: PrinterMapping,
  payload: { escpos?: string[]; html?: string[] },
  docName: string,
): Promise<{ status: LocalPrintStatus; error?: string; code?: string }> {
  try {
    if (mapping.method === "driver") {
      if (!payload.html?.length) return { status: "FAILED", error: "Nothing to print", code: "BAD_REQUEST" };
      const pages = payload.html.map((h) => prepareHtmlForLocalPrint(h, window.location.origin, mapping.paper));
      await printHtmlLocal(mapping.printerName, pages, mapping.paper, docName);
    } else {
      if (!payload.escpos?.length) return { status: "FAILED", error: "Nothing to print", code: "BAD_REQUEST" };
      await printRawLocal(mapping.printerName, payload.escpos, docName);
    }
    return { status: "QUEUED" };
  } catch (e) {
    const code = e instanceof BridgeError ? e.code : "ERROR";
    return { status: classifyBridgeFailure(code), error: e instanceof Error ? e.message : String(e), code };
  }
}

/**
 * The server prints to the Windows printer chosen on this (server) PC. "Sent"
 * means the Windows print queue accepted it — not that paper came out.
 */
async function serverPrint(path: string): Promise<{ status: LocalPrintStatus; error?: string; missing?: boolean }> {
  try {
    await api.post(path);
    return { status: "QUEUED" };
  } catch (err) {
    const e = err instanceof ApiError ? err : null;
    const error = err instanceof Error ? err.message : "Printing failed";
    if (e?.code === "PRINTER_MISSING") return { status: "FAILED", error, missing: true };
    if (e && (e.status === 0 || e.status === 408 || /timed? ?out/i.test(error))) return { status: "UNKNOWN", error };
    return { status: "FAILED", error };
  }
}

/** Sends claimed tickets to the saved Kitchen printer and reports the outcome to the server. */
async function printClaimedKot(
  orderId: string,
  branchId: string,
  mapping: PrinterMapping,
  tickets: DeviceTickets,
  reprint: boolean,
): Promise<LocalPrintEvent> {
  const r = await sendToBridge(mapping, tickets, `EasyDine KOT ${tickets.printed.map((t) => t.ticketNumber).join(",")}`);
  // Best effort: a failed report never changes what happened on paper and is
  // never a reason to print again.
  if (tickets.printed.length > 0) {
    void api
      .post(`/orders/${orderId}/print/kot/device-result?branchId=${branchId}`, {
        reprint,
        printerName: mapping.printerName,
        deviceId: deviceId(browserStorage()),
        results: tickets.printed.map((t) => ({ kotId: t.id, status: r.status, error: r.error ?? null })),
      })
      .catch(() => undefined);
  }
  const missing = r.code ? isMissingPrinterCode(r.code) : false;
  const message =
    describeOutcome("KOT", r.status, mapping.printerName, r.error) +
    (missing ? " Re-select the Kitchen printer in Settings › Printers, then use Reprint KOT." : "");
  return { orderId, what: "KOT", status: r.status, message, canReprint: true, at: Date.now() };
}

// --- Accept & KOT --------------------------------------------------------------

type AcceptResponse = {
  printStatus?: "BROWSER" | "DEVICE" | "SKIPPED" | "PRINTER_MISSING" | "NO_TICKETS" | "ALREADY_PRINTED" | "NO_PRINTER" | "SENT" | "PRINTED" | "FAILED" | "UNKNOWN";
  printError?: string;
  deviceKot?: DeviceTickets;
};

export type AcceptOutcome =
  | { accepted: true; kot: LocalPrintEvent | null; serverMessage?: { kind: "ok" | "error"; text: string } }
  | { accepted: false; reason: "busy" | "already" | "unconfirmed" | "error"; message: string };

const flights = createSingleFlight();

/**
 * Accepts the order exactly once and requests one KOT on this PC's saved
 * Kitchen printer (no dialog) when the bridge is available. Double clicks
 * share one request; a retry/refresh after a success gets "already accepted"
 * from the server and prints nothing. A print failure never undoes the
 * acceptance — the cashier gets an explicit Reprint instead.
 */
export async function acceptOrderWithKot(orderId: string, scope: PrintScope): Promise<AcceptOutcome> {
  const branchId = scope.branchId;
  if (!branchId) return { accepted: false, reason: "error", message: "Choose a branch first." };
  const key = `accept:${orderId}`;
  if (flights.isRunning(key)) return { accepted: false, reason: "busy", message: "Already accepting this order…" };
  // Hosted / plain browser: the KOT goes through the print dialog. Reserve the
  // print frame now, synchronously inside the click; it is filled only after
  // the server confirms the acceptance, and discarded otherwise.
  const mayPrintLocally = hasLocalKitchenRoute(scope);
  let slot: KotPrintSlot | null = mayPrintLocally ? null : reserveKotPrintFrame();
  const r = await flights.run(key, async (): Promise<AcceptOutcome> => {
    const route: Route = mayPrintLocally ? await routeFor("kitchen", scope) : { kind: "default", reason: "no-bridge" };
    const viaBrowser = route.kind === "default";
    let res: AcceptResponse;
    try {
      res = await api.post<AcceptResponse>(
        `/orders/${orderId}/accept?branchId=${branchId}${viaBrowser ? "&kotVia=browser" : acceptKotQuery(route, deviceTimeZone())}`,
      );
    } catch (err) {
      slot?.release(); // acceptance failed: nothing is printed
      if (err instanceof ApiError && err.status === 409) {
        return {
          accepted: false,
          reason: "already",
          message: `${err.message}. The KOT was not printed again — use Reprint KOT if the kitchen did not get it.`,
        };
      }
      if (err instanceof ApiError && (err.status === 0 || err.status === 408)) {
        return {
          accepted: false,
          reason: "unconfirmed",
          message:
            "Could not confirm the acceptance (connection problem). Refresh the list: if the order shows as accepted, check the kitchen printer and use Reprint KOT if needed. Nothing was printed again.",
        };
      }
      return { accepted: false, reason: "error", message: err instanceof Error ? err.message : "Could not accept order" };
    }

    if (viaBrowser) {
      if (res.printStatus !== "BROWSER") {
        slot?.release();
        return {
          accepted: true,
          kot: null,
          serverMessage: { kind: "ok", text: "Order accepted. No kitchen ticket yet (scheduled for later)." },
        };
      }
      const kot = await openKotDialog(slot ?? reserveKotPrintFrame(), orderId, branchId, false);
      slot = null;
      return { accepted: true, kot };
    }
    slot?.release();

    if (route.kind === "local" && route.mapping.transport === "server") {
      const name = route.mapping.printerName;
      if (res.printStatus === "NO_TICKETS") {
        return { accepted: true, kot: null, serverMessage: { kind: "ok", text: "Order accepted. No kitchen ticket yet (scheduled for later)." } };
      }
      const status: LocalPrintStatus =
        res.printStatus === "SENT" ? "QUEUED" : res.printStatus === "UNKNOWN" ? "UNKNOWN" : "FAILED";
      const missing = res.printStatus === "PRINTER_MISSING";
      const kot: LocalPrintEvent = {
        orderId,
        what: "KOT",
        status,
        message:
          describeOutcome("KOT", status, name, res.printError) +
          (missing ? " Re-select the Kitchen printer in Settings › Printers, then use Reprint KOT. No other printer was used." : ""),
        canReprint: true,
        at: Date.now(),
      };
      publish(kot);
      return { accepted: true, kot };
    }
    if (res.printStatus === "DEVICE" && res.deviceKot && route.kind === "local") {
      const kot = await printClaimedKot(orderId, branchId, route.mapping, res.deviceKot, false);
      publish(kot);
      return { accepted: true, kot };
    }
    if (res.printStatus === "SKIPPED" && route.kind === "missing") {
      const kot: LocalPrintEvent = {
        orderId,
        what: "KOT",
        status: "SKIPPED",
        message: `Order accepted, but the KOT was NOT printed: the saved Kitchen printer "${route.printerName}" is not installed on this PC. Re-select it in Settings › Printers, then use Reprint KOT. No other printer was used.`,
        canReprint: true,
        at: Date.now(),
      };
      publish(kot);
      return { accepted: true, kot };
    }
    if (res.printStatus === "NO_TICKETS") {
      return { accepted: true, kot: null, serverMessage: { kind: "ok", text: "Order accepted. No kitchen ticket yet (scheduled for later)." } };
    }
    if (res.printStatus === "FAILED" && route.kind === "local") {
      const kot: LocalPrintEvent = {
        orderId,
        what: "KOT",
        status: "FAILED",
        message: `Order accepted, but the KOT could not be prepared${res.printError ? ` (${res.printError})` : ""}. Use Reprint KOT.`,
        canReprint: true,
        at: Date.now(),
      };
      publish(kot);
      return { accepted: true, kot };
    }
    // Existing server-side behaviour (no bridge / nothing saved on this PC).
    if (res.printStatus === "SENT" || res.printStatus === "PRINTED") {
      return { accepted: true, kot: null, serverMessage: { kind: "ok", text: "Order accepted · KOT sent to the branch printer (check the printer)." } };
    }
    if (res.printStatus === "FAILED" || res.printStatus === "UNKNOWN") {
      return {
        accepted: true,
        kot: null,
        serverMessage: {
          kind: "error",
          text: `Order accepted · KOT ${res.printStatus === "UNKNOWN" ? "print status unknown" : "not printed"}${res.printError ? ` (${res.printError})` : ""}. It is on the kitchen display; use Reprint KOT if needed.`,
        },
      };
    }
    return { accepted: true, kot: null, serverMessage: { kind: "ok", text: "Order accepted · KOT on the kitchen display (no printer set up for this PC)." } };
  });
  if (!r) slot?.release();
  return r ?? { accepted: false, reason: "busy", message: "Already accepting this order…" };
}

/** Synchronous: does this PC have a saved Kitchen printer it could reach without a dialog? */
function hasLocalKitchenRoute(scope: PrintScope): boolean {
  const k = getMappings(scope).kitchen;
  if (!k) return false;
  return k.transport === "server" ? onServerPc() : hasBridgeHost();
}

async function openKotDialog(slot: KotPrintSlot, orderId: string, branchId: string, reprint: boolean): Promise<LocalPrintEvent> {
  const paper = getCashierPaperSize();
  const d = await printKotInFrame(slot, orderId, branchId, { reprint, paper, timeZone: deviceTimeZone() });
  const e: LocalPrintEvent = {
    orderId,
    what: "KOT",
    status: d.status === "REQUESTED" ? "REQUESTED" : "FAILED",
    message: d.status === "REQUESTED" && !reprint ? `Order accepted. ${d.message}` : d.message,
    canReprint: true,
    at: Date.now(),
  };
  publish(e);
  return e;
}

/**
 * Explicit Reprint KOT. Uses this PC's saved Kitchen printer when it has one;
 * otherwise opens the print dialog (frame reserved synchronously here, so call
 * it straight from the click). Copies are stamped REPRINT. Never automatic.
 */
export async function reprintKot(orderId: string, scope: PrintScope): Promise<LocalPrintEvent> {
  const branchId = scope.branchId;
  if (!branchId) {
    return { orderId, what: "KOT", status: "FAILED", message: "Choose a branch first.", canReprint: true, at: Date.now() };
  }
  const key = `reprint-dialog:${orderId}`;
  const busy: LocalPrintEvent = { orderId, what: "KOT", status: "REQUESTED", message: "The KOT print dialog is already opening…", canReprint: false, at: Date.now() };
  if (flights.isRunning(key)) return busy;
  if (hasLocalKitchenRoute(scope)) {
    const local = await reprintKotLocal(orderId, scope, true);
    if (local) return local;
  }
  const slot = reserveKotPrintFrame();
  const r = await flights.run(key, () => openKotDialog(slot, orderId, branchId, true));
  if (!r) slot.release();
  return r ?? busy;
}

export function isAccepting(orderId: string): boolean {
  return flights.isRunning(`accept:${orderId}`);
}

// --- Reprint KOT (explicit only) -----------------------------------------------

/**
 * Explicit KOT print / reprint on this PC's Kitchen printer (reprint copies
 * are stamped REPRINT). Returns null when this PC has no Kitchen printer saved
 * (caller uses the existing server/dialog path).
 */
export async function reprintKotLocal(orderId: string, scope: PrintScope, reprint = true): Promise<LocalPrintEvent | null> {
  const branchId = scope.branchId;
  if (!branchId) return null;
  const route = await routeFor("kitchen", scope);
  if (route.kind === "default") return null;
  const r = await flights.run(`reprint:${orderId}`, async () => {
    if (route.kind === "missing") {
      const e: LocalPrintEvent = {
        orderId,
        what: "KOT",
        status: "FAILED",
        message: `Not printed: the saved Kitchen printer "${route.printerName}" is not installed on this PC. Re-select it in Settings › Printers.`,
        canReprint: true,
        at: Date.now(),
      };
      publish(e);
      return e;
    }
    const m = route.mapping;
    if (m.transport === "server") {
      const sq = new URLSearchParams({ branchId, reprint: String(reprint), via: "spooler", printer: m.printerName, paper: m.paper });
      const stz = deviceTimeZone();
      if (stz) sq.set("tz", stz);
      const r = await serverPrint(`/orders/${orderId}/print/kot?${sq.toString()}`);
      const e: LocalPrintEvent = {
        orderId,
        what: "KOT",
        status: r.status,
        message:
          describeOutcome("KOT", r.status, m.printerName, r.error) +
          (r.missing ? " Re-select the Kitchen printer in Settings › Printers." : ""),
        canReprint: true,
        at: Date.now(),
      };
      publish(e);
      return e;
    }
    const q = new URLSearchParams({
      branchId,
      reprint: String(reprint),
      via: "device",
      format: m.method === "driver" ? "html" : "escpos",
      paper: m.paper,
      track: "true",
    });
    const tz = deviceTimeZone();
    if (tz) q.set("tz", tz);
    let tickets: DeviceTickets;
    try {
      tickets = await api.post<DeviceTickets>(`/orders/${orderId}/print/kot?${q.toString()}`);
    } catch (err) {
      const e: LocalPrintEvent = {
        orderId,
        what: "KOT",
        status: "FAILED",
        message: err instanceof Error ? `KOT was NOT reprinted: ${err.message}` : "KOT was NOT reprinted.",
        canReprint: true,
        at: Date.now(),
      };
      publish(e);
      return e;
    }
    const e = await printClaimedKot(orderId, branchId, m, tickets, reprint);
    publish(e);
    return e;
  });
  return r ?? { orderId, what: "KOT", status: "UNKNOWN", message: "A reprint is already being sent…", canReprint: false, at: Date.now() };
}

// --- Bills ---------------------------------------------------------------------

/** Bill on the saved Bill printer. Resolves with the honest outcome. */
export async function printBillLocal(
  orderId: string,
  branchId: string,
  mapping: PrinterMapping,
  adj: BillQuery = {},
  drawer = false,
): Promise<LocalPrintEvent> {
  if (mapping.transport === "server") {
    const q = new URLSearchParams({
      branchId,
      via: "spooler",
      printer: mapping.printerName,
      width: mapping.paper === "58mm" ? "58" : "80",
    });
    if (drawer) q.set("drawer", "true");
    const r = await serverPrint(`/orders/${orderId}/print/usb?${q.toString()}${billQueryString(adj)}`);
    const e: LocalPrintEvent = {
      orderId,
      what: "Bill",
      status: r.status,
      message:
        describeOutcome("Bill", r.status, mapping.printerName, r.error) +
        (r.missing ? " Re-select the Bill printer in Settings › Printers." : ""),
      canReprint: true,
      at: Date.now(),
    };
    publish(e);
    return e;
  }
  let payload: { escpos?: string[]; html?: string[] };
  try {
    if (mapping.method === "driver") {
      const res = await fetch(
        `/api/v1/orders/${orderId}/receipt?branchId=${branchId}${billQueryString(adj)}&paperSize=${mapping.paper}`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`Could not load the bill (${res.status})`);
      payload = { html: [await res.text()] };
    } else {
      const width = mapping.paper === "58mm" ? "58" : "80";
      const r = await api.post<{ escpos?: string[] }>(
        `/orders/${orderId}/print/usb?branchId=${branchId}&via=device&width=${width}${drawer ? "&drawer=true" : ""}${billQueryString(adj)}`,
      );
      payload = { escpos: r.escpos };
    }
  } catch (err) {
    const e: LocalPrintEvent = {
      orderId,
      what: "Bill",
      status: "FAILED",
      message: `Bill was NOT printed: ${err instanceof Error ? err.message : "could not prepare it"}.`,
      canReprint: true,
      at: Date.now(),
    };
    publish(e);
    return e;
  }
  const r = await sendToBridge(mapping, payload, "EasyDine Bill");
  const missing = r.code ? isMissingPrinterCode(r.code) : false;
  const e: LocalPrintEvent = {
    orderId,
    what: "Bill",
    status: r.status,
    message:
      describeOutcome("Bill", r.status, mapping.printerName, r.error) +
      (missing ? " Re-select the Bill printer in Settings › Printers." : ""),
    canReprint: true,
    at: Date.now(),
  };
  publish(e);
  return e;
}

/**
 * Routes a bill to this PC's saved Bill printer. Returns false when this PC
 * has no Bill printer saved, so the caller keeps its existing path. A saved
 * printer that went missing is reported (never replaced by another printer);
 * the browser dialog stays available only as an explicit, labelled choice.
 */
export function routeBillToLocalPrinter(
  orderId: string,
  branchId: string,
  adj: BillQuery,
  fallbackDialog: () => void,
  drawer = false,
): boolean {
  const scope = activeScope;
  const saved = scope.branchId === branchId ? getMappings(scope).bill : undefined;
  if (!saved) return false;
  if (saved.transport === "bridge" && !hasBridgeHost()) return false;
  if (saved.transport === "server" && !onServerPc()) return false;
  void (async () => {
    const route = await routeFor("bill", scope);
    if (route.kind === "default") {
      fallbackDialog(); // old app version without the bridge: existing behaviour
      return;
    }
    if (route.kind === "missing") {
      const msg = `Bill NOT printed: the saved Bill printer "${route.printerName}" is not installed on this PC. Re-select it in Settings › Printers.`;
      publish({ orderId, what: "Bill", status: "FAILED", message: msg, canReprint: true, at: Date.now() });
      toast.error(msg, { action: { label: "Use print dialog", onClick: fallbackDialog } });
      return;
    }
    const e = await printBillLocal(orderId, branchId, route.mapping, adj, drawer);
    if (e.status !== "QUEUED") {
      toast.error(e.message, { action: { label: "Use print dialog", onClick: fallbackDialog } });
    }
  })();
  return true;
}

registerBillPrintRouter(routeBillToLocalPrinter);

// --- Test pages ----------------------------------------------------------------

function sampleKotHtml(paper: PrinterMapping["paper"]): string {
  const now = new Date().toLocaleString();
  const width = paper === "58mm" ? "54mm" : paper === "A4" ? "170mm" : "72mm";
  return `<!doctype html><html><head><meta charset="utf-8"><title>TEST-KOT</title><style>
  body { font-family: Segoe UI, Arial, sans-serif; width: ${width}; margin: 0; padding: 2mm; color: #000; }
  h1 { font-size: 18px; text-align: center; margin: 0 0 4px; }
  .big { font-size: 16px; font-weight: 700; } .note { font-weight: 600; } hr { border: 0; border-top: 1px dashed #000; }
  </style></head><body>
  <h1>KITCHEN ORDER — TEST</h1><p style="text-align:center">Sample ticket · ${paper}</p><hr>
  <p class="big">#TEST-001 · DINE IN · Table 4</p><p>${now}</p><hr>
  <p class="big">2 × Paneer Tikka (Half)</p><p>&nbsp;&nbsp;+ Extra cheese</p><p class="note">&nbsp;&nbsp;NOTE: less spicy</p>
  <p class="big">1 × Garlic Naan</p><hr><p>2 line(s), 3 item(s)</p><p style="text-align:center">*** TEST — NOT A REAL ORDER ***</p>
  </body></html>`;
}

/** Test page on a printer the cashier picked (before or after saving). Honest result. */
export async function testLocalPrinter(role: PrinterRole, mapping: PrinterMapping, branchId: string | null): Promise<LocalPrintEvent> {
  if (mapping.transport === "server") {
    const q = new URLSearchParams({ via: "spooler", printer: mapping.printerName, width: mapping.paper === "58mm" ? "58" : "80" });
    if (branchId) q.set("branchId", branchId);
    if (role === "kitchen") q.set("kind", "kot");
    const r = await serverPrint(`/orders/print/test?${q.toString()}`);
    return {
      orderId: null,
      what: "Test page",
      status: r.status,
      message: describeOutcome("Test page", r.status, mapping.printerName, r.error),
      canReprint: false,
      at: Date.now(),
    };
  }
  let payload: { escpos?: string[]; html?: string[] };
  try {
    if (mapping.method === "driver") {
      payload = { html: [role === "kitchen" ? sampleKotHtml(mapping.paper) : buildSampleReceiptHtml(mapping.paper)] };
    } else {
      const q = new URLSearchParams({ via: "device", width: mapping.paper === "58mm" ? "58" : "80" });
      if (branchId) q.set("branchId", branchId);
      if (role === "kitchen") q.set("kind", "kot");
      const r = await api.post<{ escpos?: string[] }>(`/orders/print/test?${q.toString()}`);
      payload = { escpos: r.escpos };
    }
  } catch (err) {
    return {
      orderId: null,
      what: "Test page",
      status: "FAILED",
      message: `Test page was NOT printed: ${err instanceof Error ? err.message : "could not prepare it"}.`,
      canReprint: false,
      at: Date.now(),
    };
  }
  const r = await sendToBridge(mapping, payload, `EasyDine ${role === "kitchen" ? "KOT" : "Bill"} test`);
  return {
    orderId: null,
    what: "Test page",
    status: r.status,
    message: describeOutcome("Test page", r.status, mapping.printerName, r.error),
    canReprint: false,
    at: Date.now(),
  };
}
