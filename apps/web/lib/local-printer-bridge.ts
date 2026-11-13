// Client for a local print bridge on the cashier PC. Two hosts speak the same
// small protocol (hello / list / printRaw / printHtml):
//  - "webview": the EasyDine Windows app (windows/msix/Launcher/LocalPrintBridge.cs),
//    reached through WebView2 postMessage.
//  - "helper": the optional EasyDine Print Helper (windows/print-helper), a
//    small exe on 127.0.0.1 that a normal Chrome/Edge tab reaches over HTTP
//    after a one-time pairing. Thermal (ESC/POS) printing only.
// With neither, every call reports "no bridge" and callers keep their
// existing behaviour (the browser print dialog).
//
// A plain browser can neither list this PC's printers nor print to a named
// one without a dialog — that is why this bridge exists at all.
import type { InstalledPrinter, KeyValueStorage, PaperSize } from "./printer-routing.ts";

const CHANNEL = "easydine-print";
const HELLO_TIMEOUT_MS = 1500;
const LIST_TIMEOUT_MS = 8000;
const PRINT_TIMEOUT_MS = 45_000;

interface WebViewHost {
  postMessage: (msg: unknown) => void;
  addEventListener: (type: "message", cb: (e: { data: unknown }) => void) => void;
}

export class BridgeError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type BridgeKind = "webview" | "helper";

// --- EasyDine Print Helper (HTTP on loopback) ------------------------------------

export const HELPER_DEFAULT_PORT = 17821;
const HELPER_KEY = "easydine.printHelper.v1";

export interface HelperPairing {
  port: number;
  token: string;
  pairedAt: string;
}

function helperStorage(): KeyValueStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function parseHelperPairing(raw: string | null): HelperPairing | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<HelperPairing>;
    if (typeof v.port !== "number" || !Number.isInteger(v.port) || v.port < 1024 || v.port > 65535) return null;
    if (typeof v.token !== "string" || !/^[A-Za-z0-9_-]{32,128}$/.test(v.token)) return null;
    return { port: v.port, token: v.token, pairedAt: typeof v.pairedAt === "string" ? v.pairedAt : "" };
  } catch {
    return null;
  }
}

/** This browser's pairing with the helper on this PC, if any. */
export function getHelperPairing(storage: KeyValueStorage | null = helperStorage()): HelperPairing | null {
  try {
    return parseHelperPairing(storage?.getItem(HELPER_KEY) ?? null);
  } catch {
    return null;
  }
}

export function forgetHelperPairing(storage: KeyValueStorage | null = helperStorage()) {
  try {
    storage?.removeItem(HELPER_KEY);
  } catch {
    /* ignore */
  }
}

type FetchLike = typeof fetch;
let helperFetch: FetchLike | null = null;
/** Tests only. */
export function __setHelperFetchForTests(f: FetchLike | null) {
  helperFetch = f;
}

async function helperCall<T>(
  pairing: { port: number; token?: string },
  method: "GET" | "POST",
  path: string,
  body: unknown,
  timeoutMs: number,
  phase: "probe" | "print",
): Promise<T> {
  const doFetch = helperFetch ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    const init: RequestInit & { targetAddressSpace?: string } = {
      method,
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
      // Chrome/Edge Local Network Access: a public HTTPS page may reach this
      // PC's loopback only with the "apps on this device" permission. Saying
      // where the request goes lets the browser ask instead of blocking it.
      targetAddressSpace: "loopback",
      headers: {
        ...(pairing.token ? { Authorization: `Bearer ${pairing.token}` } : {}),
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    };
    res = await doFetch(`http://127.0.0.1:${pairing.port}${path}`, init);
  } catch (e) {
    clearTimeout(timer);
    const aborted = controller.signal.aborted || (e instanceof Error && e.name === "AbortError");
    if (phase === "probe") {
      throw new BridgeError(
        "NO_BRIDGE",
        aborted
          ? "The EasyDine Print Helper did not answer in time."
          : "The EasyDine Print Helper is not reachable: start it on this PC, and allow this site to access apps on this device if the browser asks.",
      );
    }
    // The job may have reached the helper before the connection broke, so
    // this is never reported as "nothing printed" (and never resent).
    throw new BridgeError(
      aborted ? "TIMEOUT" : "HELPER_LOST",
      aborted
        ? "No answer from the Print Helper in time"
        : "Lost the connection to the Print Helper (if its window was closed, nothing was printed)",
    );
  }
  clearTimeout(timer);
  let data: { ok?: boolean; code?: string; error?: string } & Record<string, unknown> = {};
  try {
    data = (await res.json()) as typeof data;
  } catch {
    /* empty body */
  }
  if (!res.ok || data.ok === false) {
    if (res.status === 401) {
      throw new BridgeError("FORBIDDEN", "This browser is no longer paired with the Print Helper. Pair again in Settings › Printers.");
    }
    throw new BridgeError(data.code || (res.status >= 500 ? "ERROR" : "BAD_REQUEST"), data.error || `Print Helper answered ${res.status}`);
  }
  return data as T;
}

/**
 * One-time pairing: the cashier types the code the helper window shows. The
 * helper binds the token to this site's origin. Call from a click (the
 * browser may ask to allow access to apps on this device).
 */
export async function pairHelper(
  code: string,
  port: number = HELPER_DEFAULT_PORT,
  storage: KeyValueStorage | null = helperStorage(),
): Promise<HelperPairing> {
  const clean = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(clean)) throw new BridgeError("BAD_CODE", "Type the 6-digit code shown in the Print Helper window.");
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new BridgeError("BAD_REQUEST", "Port must be between 1024 and 65535.");
  const r = await helperCall<{ token?: string }>({ port }, "POST", "/v1/pair", { code: clean }, 30_000, "probe");
  const pairing = parseHelperPairing(JSON.stringify({ port, token: r.token, pairedAt: new Date().toISOString() }));
  if (!pairing) throw new BridgeError("ERROR", "The Print Helper sent an unexpected answer.");
  storage?.setItem(HELPER_KEY, JSON.stringify(pairing));
  return pairing;
}

/** Removes this site's pairing on the helper (best effort) and in this browser. */
export async function unpairHelper(storage: KeyValueStorage | null = helperStorage()): Promise<void> {
  const p = getHelperPairing(storage);
  if (p) await helperCall(p, "POST", "/v1/unpair", {}, 3000, "probe").catch(() => undefined);
  forgetHelperPairing(storage);
}

function helperRequest<T>(p: HelperPairing, type: string, args: Record<string, unknown>, timeoutMs: number): Promise<T> {
  switch (type) {
    case "hello":
      return helperCall<T>(p, "GET", "/v1/hello", undefined, timeoutMs, "probe");
    case "list":
      return helperCall<T>(p, "GET", "/v1/printers", undefined, timeoutMs, "probe");
    case "printRaw":
      return helperCall<T>(p, "POST", "/v1/print-raw", { printer: args.printer, data: args.data, docName: args.docName }, timeoutMs, "print");
    default:
      return Promise.reject(
        new BridgeError(
          "UNSUPPORTED",
          'The Print Helper prints thermal (ESC/POS) tickets only. Choose "Thermal (ESC/POS)" for this printer, or use the print dialog.',
        ),
      );
  }
}

// --- WebView2 host ----------------------------------------------------------------

function host(): WebViewHost | null {
  if (typeof window === "undefined") return null;
  const wv = (window as unknown as { chrome?: { webview?: WebViewHost } }).chrome?.webview;
  return wv && typeof wv.postMessage === "function" ? wv : null;
}

/** Which bridge this window would use, without contacting it. WebView2 wins. */
export function bridgeKind(): BridgeKind | null {
  if (host()) return "webview";
  return getHelperPairing() ? "helper" : null;
}

/**
 * Synchronous hint: a bridge may be usable (WebView2 host, or a paired helper).
 * It may still be absent (old app version, helper not started): detectBridge() checks.
 */
export function hasBridgeHost(): boolean {
  return bridgeKind() !== null;
}

type Pending = { resolve: (v: unknown) => void; reject: (e: BridgeError) => void; timer: ReturnType<typeof setTimeout> };
const pending = new Map<string, Pending>();
let listeningOn: WebViewHost | null = null;
let seq = 0;

function listen(h: WebViewHost) {
  if (listeningOn === h) return;
  listeningOn = h;
  h.addEventListener("message", (e) => {
    const m = e.data as { channel?: string; id?: string; ok?: boolean; result?: unknown; code?: string; error?: string } | null;
    if (!m || m.channel !== CHANNEL || typeof m.id !== "string") return;
    const p = pending.get(m.id);
    if (!p) return; // late reply after a timeout: already reported as unknown
    pending.delete(m.id);
    clearTimeout(p.timer);
    if (m.ok) p.resolve(m.result);
    else p.reject(new BridgeError(m.code || "ERROR", m.error || "The local printer bridge reported an error."));
  });
}

function request<T>(type: string, args: Record<string, unknown>, timeoutMs: number): Promise<T> {
  const h = host();
  if (!h) {
    const p = getHelperPairing();
    if (p) return helperRequest<T>(p, type, args, timeoutMs);
  }
  if (!h) return Promise.reject(new BridgeError("NO_BRIDGE", "This browser cannot use this computer's printers directly."));
  listen(h);
  const id = `p${Date.now().toString(36)}${(seq++).toString(36)}`;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new BridgeError("TIMEOUT", "No answer from the local printer bridge in time."));
    }, timeoutMs);
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
    try {
      h.postMessage({ channel: CHANNEL, id, type, ...args });
    } catch {
      clearTimeout(timer);
      pending.delete(id);
      reject(new BridgeError("NO_BRIDGE", "Could not reach the local printer bridge."));
    }
  });
}

let helloPromise: Promise<boolean> | null = null;

// Last answer of the paired helper. Used only to skip waiting when it is known
// to be down (stopped / window closed): then a KOT opens the print dialog at
// once instead of after a 1.5 s probe. A helper that answered is still probed
// again before every direct print, so "paired" alone never means "direct".
const HELPER_DOWN_MEMORY_MS = 60_000;
const HELPER_RECHECK_MS = 15_000;
let lastHelperProbe: { ok: boolean; at: number } | null = null;
let helperWatch: ReturnType<typeof setInterval> | null = null;

/** The paired helper did not answer its last check (within the last minute). */
export function helperKnownDown(now: number = Date.now()): boolean {
  return !!lastHelperProbe && !lastHelperProbe.ok && now - lastHelperProbe.at < HELPER_DOWN_MEMORY_MS;
}

/** Tests only. */
export function __setLastHelperProbeForTests(v: { ok: boolean; at: number } | null) {
  lastHelperProbe = v;
}

/**
 * Keeps lastHelperProbe fresh while this browser is paired (cheap loopback
 * hello every 15 s), so a stopped helper is noticed before staff click.
 */
export function watchHelper(): void {
  if (helperWatch || typeof window === "undefined") return;
  const tick = () => {
    if (bridgeKind() === "helper") void detectBridge();
  };
  tick();
  helperWatch = setInterval(tick, HELPER_RECHECK_MS);
}

/**
 * True when a working print bridge answers right now. The WebView2 answer is
 * cached; the helper is asked every time (it can be stopped at any moment).
 */
export function detectBridge(): Promise<boolean> {
  const kind = bridgeKind();
  if (!kind) return Promise.resolve(false);
  if (kind === "helper") {
    return request<{ version: number }>("hello", {}, HELLO_TIMEOUT_MS)
      .then((r) => typeof r?.version === "number" && r.version >= 1)
      .catch(() => false)
      .then((ok) => {
        lastHelperProbe = { ok, at: Date.now() };
        return ok;
      });
  }
  if (!helloPromise) {
    helloPromise = request<{ version: number }>("hello", {}, HELLO_TIMEOUT_MS)
      .then((r) => typeof r?.version === "number" && r.version >= 1)
      .catch(() => {
        helloPromise = null; // older app without the bridge, or busy: try again later
        return false;
      });
  }
  return helloPromise;
}

export async function listInstalledPrinters(): Promise<InstalledPrinter[]> {
  const r = await request<{ printers: InstalledPrinter[] }>("list", {}, LIST_TIMEOUT_MS);
  return Array.isArray(r?.printers) ? r.printers.filter((p) => typeof p?.name === "string") : [];
}

/** Raw ESC/POS (base64 chunks, one per ticket) to one named printer. Resolves only when queued. */
export async function printRawLocal(printer: string, data: string[], docName: string): Promise<{ jobs: number; warning?: string }> {
  if (!printer) throw new BridgeError("NO_PRINTER", "No printer was chosen.");
  return request<{ jobs: number; warning?: string }>("printRaw", { printer, data, docName }, PRINT_TIMEOUT_MS);
}

/** Rendered pages through the printer's Windows driver. Resolves only when queued. */
export async function printHtmlLocal(printer: string, html: string[], paper: PaperSize, docName: string): Promise<{ jobs: number }> {
  if (!printer) throw new BridgeError("NO_PRINTER", "No printer was chosen.");
  return request<{ jobs: number }>("printHtml", { printer, html, paper, docName }, PRINT_TIMEOUT_MS);
}

/**
 * Prepares server HTML for printing in the bridge's hidden, script-free page:
 * relative links (logo, fonts) resolve against this server, and the page size
 * matches the chosen paper.
 */
export function prepareHtmlForLocalPrint(html: string, origin: string, paper: PaperSize): string {
  const base = `<base href="${origin.replace(/"/g, "")}/">`;
  const css =
    paper === "58mm"
      ? "@page { size: 58mm auto; margin: 0; } html, body { width: 54mm !important; margin: 0 !important; }"
      : paper === "A4"
        ? "@page { size: A4 portrait; margin: 15mm; } html, body { width: 100% !important; max-width: 170mm !important; margin: 0 auto !important; }"
        : "@page { size: 80mm auto; margin: 0; } html, body { width: 80mm !important; margin: 0 !important; }";
  const style = `<style id="easydine-local-paper">${css}</style>`;
  // <base> first (it must precede any relative URL); the paper style last so
  // it wins over the page's own @page / width rules.
  if (/<head[^>]*>/i.test(html)) {
    const withBase = html.replace(/<head([^>]*)>/i, `<head$1>${base}`);
    return /<\/head>/i.test(withBase) ? withBase.replace(/<\/head>/i, `${style}</head>`) : withBase.replace(/<head([^>]*)>/i, `<head$1>${style}`);
  }
  return `<!doctype html><html><head><meta charset="utf-8">${base}${style}</head><body>${html}</body></html>`;
}
