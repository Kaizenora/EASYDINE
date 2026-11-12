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
import { kotPageUrl, printKotInFrame, reserveKotPrintFrame, type KotPrintSlot } from "./kot-print-dialog.ts";
import { buildKotHtml } from "./kot-html.ts";
import {
  acceptKotQuery,
  browserKotDecision,
  classifyBridgeFailure,
  createSingleFlight,
  describeOutcome,
  isScheduledLater,
  printedButNotAcceptedMessage,
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
    // Unreachable or unsupported: treated as "no helper" (browser dialog).
    if (!list || !list.supported) return resolveRoute(role, false, mappings, null);
    return resolveRoute(role, true, mappings, list.printers);
  }
  const bridge = await detectBridge();
  const installed = bridge ? await listInstalledPrinters().catch(() => null) : null;
  // A helper that answers the ping but cannot list printers is not reachable
  // enough to print on: use the browser dialog instead.
  return resolveRoute(role, bridge && installed !== null, mappings, installed);
}

/**
 * The single KOT routing rule. Direct print only when this PC's Print Helper
 * (or the server-PC spooler) is reachable right now AND the saved Kitchen
 * printer is installed there; in every other case the browser print dialog.
 * Decided before anything is dispatched, so the fallback never duplicates.
 */
export async function kitchenRoute(scope: PrintScope): Promise<{ route: Route; note?: string }> {
  if (!hasLocalKitchenRoute(scope)) return { route: { kind: "default", reason: "no-bridge" } };
  const route = await routeFor("kitchen", scope);
  if (route.kind === "missing") {
    return {
      route: { kind: "default", reason: "not-configured" },
      note: `The saved Kitchen printer "${route.printerName}" is not installed on this PC, so the print dialog was used.`,
    };
  }
  return { route };
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
      const sent = await printRawLocal(mapping.printerName, payload.escpos, docName);
      // e.g. "Windows reports the printer as offline." — queued, but say so.
      if (sent?.warning) return { status: "QUEUED", error: sent.warning };
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
  scheduledFor?: string | null;
  printStatus?: "BROWSER" | "DEVICE" | "SKIPPED" | "PRINTER_MISSING" | "NO_TICKETS" | "ALREADY_PRINTED" | "NO_PRINTER" | "SENT" | "PRINTED" | "FAILED" | "UNKNOWN";
  printError?: string;
  deviceKot?: DeviceTickets;
  /** Browser route: the KOT page itself, so no second request is needed. */
  kotHtml?: string;
};

export type AcceptOutcome =
  | { accepted: true; kot: LocalPrintEvent | null; serverMessage?: { kind: "ok" | "error"; text: string } }
  | { accepted: false; reason: "busy" | "already" | "unconfirmed" | "error"; message: string };

const flights = createSingleFlight();

export interface AcceptTarget {
  id: string;
  /** Known schedule time: a later order gets its kitchen tickets later, so it is not printed first. */
  scheduledFor?: string | null;
  /** kotPageVersion(order.items), so a prefetched page is used only while the lines match. */
  version?: string;
}

/** Hooks take either an order id or an AcceptTarget. */
export function toAcceptTarget(t: string | AcceptTarget): AcceptTarget {
  return typeof t === "string" ? { id: t } : t;
}

// --- instant print dialog (browser route) ---------------------------------------
// The KOT page of a waiting order is loaded while it is on screen, so Accept &
// KOT can open the print dialog in the same moment as the click. Reading the
// page marks nothing as printed.

const KOT_PAGE_TTL_MS = 5 * 60_000;
const kotPageCache = new Map<string, { html: string; version: string; at: number }>();
const kotPageLoads = new Map<string, Promise<string | null>>();

/** Which KOT page: the whole order (Accept) or some tickets (KDS reprint). */
export interface KotPageSpec {
  kotIds?: string[];
  reprint?: boolean;
}

function kotPageKey(orderId: string, page: KotPageSpec): string {
  return `${orderId}|${page.kotIds?.join(",") ?? ""}|${page.reprint ? 1 : 0}`;
}

function loadKotPage(orderId: string, branchId: string, version: string, page: KotPageSpec = {}): Promise<string | null> {
  const key = kotPageKey(orderId, page);
  const running = kotPageLoads.get(key);
  if (running) return running;
  const url = kotPageUrl(orderId, branchId, {
    paper: getCashierPaperSize(),
    timeZone: deviceTimeZone(),
    kotIds: page.kotIds,
    reprint: page.reprint,
  });
  const p = fetch(url, { credentials: "include", cache: "no-store" })
    .then(async (res) => (res.ok ? await res.text() : null))
    .catch(() => null)
    .then((html) => {
      if (html) kotPageCache.set(key, { html, version, at: Date.now() });
      return html;
    })
    .finally(() => kotPageLoads.delete(key));
  kotPageLoads.set(key, p);
  return p;
}

/**
 * Loads a KOT page in the background so its print dialog opens at once on
 * the click. Only for PCs without a Print Helper route (those print
 * directly, without any dialog). Reading the page marks nothing as printed.
 */
export function prefetchKotPage(orderId: string, scope: PrintScope, version = "", page: KotPageSpec = {}): void {
  if (!scope.branchId || typeof window === "undefined" || hasLocalKitchenRoute(scope)) return;
  const hit = kotPageCache.get(kotPageKey(orderId, page));
  if (hit && hit.version === version && Date.now() - hit.at < KOT_PAGE_TTL_MS) return;
  void loadKotPage(orderId, scope.branchId, version, page);
}

/** The prefetched page, used once. */
function takeKotPage(orderId: string, version: string | undefined, page: KotPageSpec = {}): string | null {
  const key = kotPageKey(orderId, page);
  const hit = kotPageCache.get(key);
  kotPageCache.delete(key);
  if (!hit || Date.now() - hit.at >= KOT_PAGE_TTL_MS) return null;
  if (version !== undefined && hit.version !== version) return null;
  return hit.html;
}

type AcceptAttempt = { ok: true; res: AcceptResponse } | { ok: false; err: unknown };

/**
 * Browser route, print first: the acceptance request goes out and the print
 * dialog opens straight away from the prefetched page (or as soon as the page
 * arrives) without waiting for the server's answer, which is read after the
 * dialog. If the order was not accepted after all, staff are told what to do
 * with the ticket. Nothing is ever printed twice automatically.
 */
async function acceptPrintFirst(
  orderId: string,
  branchId: string,
  slot: KotPrintSlot,
  target: AcceptTarget,
): Promise<AcceptOutcome> {
  const accepting: Promise<AcceptAttempt> = api
    .post<AcceptResponse>(`/orders/${orderId}/accept?branchId=${branchId}${browserKotQuery()}`)
    .then(
      (res) => ({ ok: true as const, res }),
      (err: unknown) => ({ ok: false as const, err }),
    );
  const html =
    takeKotPage(orderId, target.version) ??
    (await Promise.race([
      loadKotPage(orderId, branchId, target.version ?? ""),
      // If the page is slower than the acceptance, the acceptance's own copy is used.
      accepting.then((a) => (a.ok && a.res.kotHtml ? a.res.kotHtml : null)),
    ]));

  if (!html) {
    // No page at all: wait for the server and print from its answer.
    const a = await accepting;
    if (!a.ok) {
      slot.release();
      return notAcceptedOutcome(a.err, false);
    }
    if (browserKotDecision(a.res.printStatus, a.res.scheduledFor) !== "dialog") {
      slot.release();
      return { accepted: true, kot: null, serverMessage: { kind: "ok", text: "Order accepted. No kitchen ticket yet (scheduled for later)." } };
    }
    const kot = await openKotDialog(slot, orderId, branchId, false, undefined, "Order accepted.", a.res.kotHtml || undefined);
    return { accepted: true, kot };
  }

  const d = await printKotInFrame(slot, orderId, branchId, { html });
  const a = await accepting;
  if (!a.ok) return notAcceptedOutcome(a.err, d.status === "REQUESTED");
  const kot: LocalPrintEvent = {
    orderId,
    what: "KOT",
    status: d.status === "REQUESTED" ? "REQUESTED" : "FAILED",
    message: `Order accepted. ${d.message}`,
    canReprint: true,
    at: Date.now(),
  };
  publish(kot);
  return { accepted: true, kot };
}

function notAcceptedOutcome(err: unknown, printed: boolean): AcceptOutcome {
  if (err instanceof ApiError && err.status === 409) {
    return {
      accepted: false,
      reason: "already",
      message: printed
        ? printedButNotAcceptedMessage("already", err.message)
        : `${err.message}. The KOT was not printed again — use Reprint KOT if the kitchen did not get it.`,
    };
  }
  if (err instanceof ApiError && (err.status === 0 || err.status === 408)) {
    return {
      accepted: false,
      reason: "unconfirmed",
      message: printed
        ? printedButNotAcceptedMessage("unconfirmed")
        : "Could not confirm the acceptance (connection problem). Refresh the list: if the order shows as accepted, check the kitchen printer and use Reprint KOT if needed. Nothing was printed again.",
    };
  }
  const msg = err instanceof Error ? err.message : "Could not accept order";
  return { accepted: false, reason: "error", message: printed ? printedButNotAcceptedMessage("error", msg) : msg };
}

/**
 * Accepts the order exactly once and requests one KOT on this PC's saved
 * Kitchen printer (no dialog) when the bridge is available. Double clicks
 * share one request; a retry/refresh after a success gets "already accepted"
 * from the server and prints nothing. A print failure never undoes the
 * acceptance — the cashier gets an explicit Reprint instead.
 */
export async function acceptOrderWithKot(orderIdOrTarget: string | AcceptTarget, scope: PrintScope): Promise<AcceptOutcome> {
  const target = toAcceptTarget(orderIdOrTarget);
  const orderId = target.id;
  const branchId = scope.branchId;
  if (!branchId) return { accepted: false, reason: "error", message: "Choose a branch first." };
  const key = `accept:${orderId}`;
  if (flights.isRunning(key)) return { accepted: false, reason: "busy", message: "Already accepting this order…" };
  // No Print Helper route on this PC: the print dialog opens at once and the
  // acceptance runs alongside it (orders scheduled for later keep the old order).
  if (!hasLocalKitchenRoute(scope) && !isScheduledLater(target.scheduledFor)) {
    const firstSlot = reserveKotPrintFrame();
    const fast = await flights.run(key, () => acceptPrintFirst(orderId, branchId, firstSlot, target));
    if (!fast) firstSlot.release();
    return fast ?? { accepted: false, reason: "busy", message: "Already accepting this order…" };
  }
  // Reserve the print frame now, synchronously inside the click, even when a
  // saved Kitchen printer may take the KOT: if the helper turns out to be
  // stopped, the dialog is the fallback. The frame is filled only after the
  // server confirms the acceptance, and discarded otherwise.
  let slot: KotPrintSlot | null = reserveKotPrintFrame();
  const r = await flights.run(key, async (): Promise<AcceptOutcome> => {
    const { route, note } = await kitchenRoute(scope);
    const viaBrowser = route.kind === "default";
    let res: AcceptResponse;
    try {
      res = await api.post<AcceptResponse>(
        `/orders/${orderId}/accept?branchId=${branchId}${viaBrowser ? browserKotQuery() : acceptKotQuery(route, deviceTimeZone())}`,
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
      const decision = browserKotDecision(res.printStatus, res.scheduledFor);
      if (decision !== "dialog") {
        slot?.release();
        slot = null;
        if (decision === "no-tickets") {
          return { accepted: true, kot: null, serverMessage: { kind: "ok", text: "Order accepted. No kitchen ticket yet (scheduled for later)." } };
        }
        return {
          accepted: true,
          kot: null,
          serverMessage:
            decision === "server-sent"
              ? { kind: "ok", text: "Order accepted · the server sent the KOT to the branch printer (check the printer)." }
              : {
                  kind: "error",
                  text: "Order accepted · KOT print status unknown on the branch printer. Check it; use Reprint KOT only if nothing came out.",
                },
        };
      }
      const kot = await openKotDialog(
        slot ?? reserveKotPrintFrame(),
        orderId,
        branchId,
        false,
        undefined,
        note ? `Order accepted. ${note}` : "Order accepted.",
        typeof res.kotHtml === "string" && res.kotHtml.length > 0 ? res.kotHtml : undefined,
      );
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

/** Accept query for the browser route; paper and time zone let the server return the KOT page with the acceptance. */
function browserKotQuery(): string {
  const q = new URLSearchParams({ kotVia: "browser", kotPaper: getCashierPaperSize() });
  const tz = deviceTimeZone();
  if (tz) q.set("tz", tz);
  return `&${q.toString()}`;
}

/** Synchronous: does this PC have a saved Kitchen printer it could reach without a dialog? */
function hasLocalKitchenRoute(scope: PrintScope): boolean {
  const k = getMappings(scope).kitchen;
  if (!k) return false;
  return k.transport === "server" ? onServerPc() : hasBridgeHost();
}

async function openKotDialog(
  slot: KotPrintSlot,
  orderId: string,
  branchId: string,
  reprint: boolean,
  kotIds?: string[],
  prefix?: string,
  html?: string,
): Promise<LocalPrintEvent> {
  const paper = getCashierPaperSize();
  const d = await printKotInFrame(slot, orderId, branchId, { reprint, paper, timeZone: deviceTimeZone(), kotIds, html });
  const e: LocalPrintEvent = {
    orderId,
    what: "KOT",
    status: d.status === "REQUESTED" ? "REQUESTED" : "FAILED",
    message: d.status === "REQUESTED" && prefix ? `${prefix} ${d.message}` : d.message,
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
export async function reprintKot(
  orderId: string,
  scope: PrintScope,
  opts: { kotIds?: string[]; reprint?: boolean; version?: string } = {},
): Promise<LocalPrintEvent> {
  const branchId = scope.branchId;
  if (!branchId) {
    return { orderId, what: "KOT", status: "FAILED", message: "Choose a branch first.", canReprint: true, at: Date.now() };
  }
  const reprint = opts.reprint ?? true;
  const key = `reprint-dialog:${orderId}:${opts.kotIds?.join(",") ?? "all"}`;
  const busy: LocalPrintEvent = { orderId, what: "KOT", status: "REQUESTED", message: "The KOT print dialog is already opening…", canReprint: false, at: Date.now() };
  if (flights.isRunning(key)) return busy;
  // Reserved inside the click; discarded when the helper takes the job.
  const slot = reserveKotPrintFrame();
  const r = await flights.run(key, async () => {
    const { route, note } = await kitchenRoute(scope);
    if (route.kind === "local") {
      slot.release();
      const local = await kotToLocalPrinter(orderId, branchId, route.mapping, reprint, opts.kotIds);
      publish(local);
      return local;
    }
    // A page loaded in the background (KDS) opens the dialog at once.
    const ready = takeKotPage(orderId, opts.version, { kotIds: opts.kotIds, reprint });
    return openKotDialog(slot, orderId, branchId, reprint, opts.kotIds, note, ready ?? undefined);
  });
  if (!r) slot.release();
  return r ?? busy;
}

/**
 * First KOT of a staff "Send to kitchen" (new order or another round), in the
 * same click: `slot` must be reserved synchronously in that click, before the
 * order request. `kotIds` = the tickets this send created (empty = nothing for
 * the kitchen yet, e.g. a scheduled order). Same routing as Accept & KOT;
 * never retried or resent - the cashier gets Reprint KOT instead.
 */
export async function printSentKot(
  orderId: string,
  scope: PrintScope,
  slot: KotPrintSlot,
  kotIds?: string[],
  /** The KOT page the server sent back with the order, if any. */
  html?: string,
): Promise<LocalPrintEvent | null> {
  const branchId = scope.branchId;
  if (!branchId || (kotIds && kotIds.length === 0)) {
    slot.release();
    return null;
  }
  const { route, note } = await kitchenRoute(scope);
  if (route.kind === "local") {
    slot.release();
    const e = await kotToLocalPrinter(orderId, branchId, route.mapping, false, kotIds);
    publish(e);
    return e;
  }
  return openKotDialog(slot, orderId, branchId, false, kotIds, note ? `Sent to kitchen. ${note}` : "Sent to kitchen.", html);
}

// --- Send to kitchen, dialog first (POS) -------------------------------------------

/** True when a KOT from this PC goes through the browser print dialog (no Print Helper route). */
export function kotUsesDialog(scope: PrintScope): boolean {
  return !!scope.branchId && !hasLocalKitchenRoute(scope);
}

/**
 * Extra query for POST /orders on a dialog PC: the server sends the new
 * tickets back as a ready KOT page (older servers ignore it).
 */
export function createOrderKotQuery(branchId: string | null): string {
  if (!kotUsesDialog({ ...getActivePrintScope(), branchId })) return "";
  const q = new URLSearchParams({ kotPage: "1", kotPaper: getCashierPaperSize() });
  const tz = deviceTimeZone();
  if (tz) q.set("tz", tz);
  return `&${q.toString()}`;
}

/**
 * The kitchen ticket built in the browser from what is being sent (the same
 * template as the server's KOT page), so the dialog can open in the click,
 * before the server has answered.
 */
export function cartKotHtml(input: {
  branchName: string;
  orderNumber?: string | null;
  type: string;
  tableLabel?: string | null;
  lines: { name: string; quantity: number; modifiers: string[]; note?: string | null }[];
}): string {
  return buildKotHtml({
    branchName: input.branchName,
    order: {
      orderNumber: input.orderNumber ?? "",
      type: input.type,
      createdAt: new Date(),
      table: input.tableLabel ? { label: input.tableLabel } : null,
      customer: null,
      items: input.lines.map((l) => ({
        nameSnapshot: l.name,
        quantity: l.quantity,
        kitchenNote: l.note ?? null,
        modifiers: l.modifiers.map((m) => ({ nameSnapshot: m })),
      })),
    },
    paper: getCashierPaperSize(),
    timeZone: deviceTimeZone(),
  });
}

/** Opens the print dialog for a ticket already in hand. Never "printed": only requested. */
export async function printKotHtmlNow(slot: KotPrintSlot, orderId: string | null, html: string, prefix: string): Promise<LocalPrintEvent> {
  const d = await printKotInFrame(slot, orderId ?? "", "", { html });
  const e: LocalPrintEvent = {
    orderId,
    what: "KOT",
    status: d.status === "REQUESTED" ? "REQUESTED" : "FAILED",
    message: `${prefix} ${d.message}`,
    canReprint: true,
    at: Date.now(),
  };
  publish(e);
  return e;
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
export async function reprintKotLocal(orderId: string, scope: PrintScope, reprint = true, kotIds?: string[]): Promise<LocalPrintEvent | null> {
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
    const e = await kotToLocalPrinter(orderId, branchId, route.mapping, reprint, kotIds);
    publish(e);
    return e;
  });
  return r ?? { orderId, what: "KOT", status: "UNKNOWN", message: "A reprint is already being sent…", canReprint: false, at: Date.now() };
}

/** One dispatch to this PC's Kitchen printer (helper or server-PC spooler). Never retried. */
async function kotToLocalPrinter(
  orderId: string,
  branchId: string,
  m: PrinterMapping,
  reprint: boolean,
  kotIds?: string[],
): Promise<LocalPrintEvent> {
  {
    if (m.transport === "server") {
      const sq = new URLSearchParams({ branchId, reprint: String(reprint), via: "spooler", printer: m.printerName, paper: m.paper });
      if (kotIds?.length) sq.set("kotIds", kotIds.join(","));
      const stz = deviceTimeZone();
      if (stz) sq.set("tz", stz);
      const r = await serverPrint(`/orders/${orderId}/print/kot?${sq.toString()}`);
      return {
        orderId,
        what: "KOT",
        status: r.status,
        message:
          describeOutcome("KOT", r.status, m.printerName, r.error) +
          (r.missing ? " Re-select the Kitchen printer in Settings › Printers." : ""),
        canReprint: true,
        at: Date.now(),
      };
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
    if (kotIds?.length) q.set("kotIds", kotIds.join(","));
    let tickets: DeviceTickets;
    try {
      tickets = await api.post<DeviceTickets>(`/orders/${orderId}/print/kot?${q.toString()}`);
    } catch (err) {
      // The server refused before anything reached a printer.
      return {
        orderId,
        what: "KOT",
        status: "FAILED",
        message: err instanceof Error ? `KOT was NOT printed: ${err.message}` : "KOT was NOT printed.",
        canReprint: true,
        at: Date.now(),
      };
    }
    return printClaimedKot(orderId, branchId, m, tickets, reprint);
  }
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
