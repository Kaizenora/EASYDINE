// Client for the EasyDine Windows app's local print bridge
// (windows/msix/Launcher/LocalPrintBridge.cs). Only exists inside that app
// (WebView2); in a normal browser every call reports "no bridge" and callers
// keep their existing behaviour (server printing or the browser print dialog).
//
// A plain browser can neither list this PC's printers nor print to a named
// one without a dialog — that is why this bridge exists at all.
import type { InstalledPrinter, PaperSize } from "./printer-routing.ts";

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

function host(): WebViewHost | null {
  if (typeof window === "undefined") return null;
  const wv = (window as unknown as { chrome?: { webview?: WebViewHost } }).chrome?.webview;
  return wv && typeof wv.postMessage === "function" ? wv : null;
}

/** Synchronous hint: true inside a WebView2 host (the bridge may still be absent in an old app version). */
export function hasBridgeHost(): boolean {
  return host() !== null;
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

/** True when this window is the EasyDine Windows app with a working print bridge. Cached. */
export function detectBridge(): Promise<boolean> {
  if (!hasBridgeHost()) return Promise.resolve(false);
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
export async function printRawLocal(printer: string, data: string[], docName: string): Promise<{ jobs: number }> {
  if (!printer) throw new BridgeError("NO_PRINTER", "No printer was chosen.");
  return request<{ jobs: number }>("printRaw", { printer, data, docName }, PRINT_TIMEOUT_MS);
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
