// Per-cashier-PC printer mappings and routing decisions.
//
// A cashier PC running the EasyDine Windows app can list its own installed
// printers through the local print bridge (lib/local-printer-bridge.ts). The
// cashier picks a Bill printer and a Kitchen printer from that list once;
// this module stores the choice for THIS device, THIS restaurant (tenant) and
// THIS branch, and decides where each print goes.
//
// Rules (never broken here):
//  - Only a printer the cashier explicitly saved is ever used. No model, name
//    or address is hard-coded, and nothing falls back to "the default printer"
//    or to the other role's printer.
//  - A saved printer that is no longer installed is reported as missing and
//    must be re-selected; it is never replaced silently.
//  - Status is honest: "queued" means the Windows print queue accepted it,
//    never that paper came out.
//
// Pure functions only (storage is injected), so it runs under `node --test`.

export type PrinterRole = "bill" | "kitchen";
export type PaperSize = "58mm" | "80mm" | "A4";
/** escpos = raw thermal commands; driver = page rendered through the Windows driver. */
export type PrintMethod = "escpos" | "driver";
/**
 * How this PC reaches the printer:
 *  - "server": the browser runs on the PC that hosts the EasyDine server; the
 *    server prints to the chosen Windows printer. Nothing to install.
 *  - "bridge": the EasyDine Windows app's local print bridge prints it.
 */
export type PrintTransport = "server" | "bridge";

export interface PrinterMapping {
  printerName: string;
  paper: PaperSize;
  method: PrintMethod;
  transport: PrintTransport;
  savedAt: string;
}

export interface DevicePrinterMappings {
  bill?: PrinterMapping;
  kitchen?: PrinterMapping;
}

export interface InstalledPrinter {
  name: string;
  isDefault?: boolean;
}

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PREFIX = "easydine.devicePrinters.v1";
const DEVICE_ID_KEY = "easydine.deviceId";

/** Storage key: one set of mappings per tenant + branch on this device. */
export function mappingKey(tenantId: string, branchId: string): string {
  return `${PREFIX}:${encodeURIComponent(tenantId)}:${encodeURIComponent(branchId)}`;
}

function isPaper(v: unknown): v is PaperSize {
  return v === "58mm" || v === "80mm" || v === "A4";
}

function validMapping(v: unknown): PrinterMapping | undefined {
  const m = v as Partial<PrinterMapping> | null;
  if (!m || typeof m.printerName !== "string" || !m.printerName.trim() || !isPaper(m.paper)) return undefined;
  const transport: PrintTransport = m.transport === "server" ? "server" : "bridge";
  // The server prints raw thermal commands only: 58/80 mm rolls, no A4 pages.
  if (transport === "server" && m.paper === "A4") return undefined;
  // A4 can only be printed as a rendered page.
  const method: PrintMethod =
    transport === "server" ? "escpos" : m.paper === "A4" ? "driver" : m.method === "driver" ? "driver" : "escpos";
  return {
    printerName: m.printerName,
    paper: m.paper,
    method,
    transport,
    savedAt: typeof m.savedAt === "string" ? m.savedAt : "",
  };
}

/** True when the browser runs on the same PC as the EasyDine server (opened via localhost). */
export function isSameMachineAsServer(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h === "::1" || h.endsWith(".localhost");
}

export function loadMappings(storage: KeyValueStorage | null, tenantId: string | null, branchId: string | null): DevicePrinterMappings {
  if (!storage || !tenantId || !branchId) return {};
  try {
    const raw = storage.getItem(mappingKey(tenantId, branchId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: DevicePrinterMappings = {};
    const bill = validMapping(parsed.bill);
    const kitchen = validMapping(parsed.kitchen);
    if (bill) out.bill = bill;
    if (kitchen) out.kitchen = kitchen;
    return out;
  } catch {
    return {};
  }
}

export function saveMapping(
  storage: KeyValueStorage,
  tenantId: string,
  branchId: string,
  role: PrinterRole,
  mapping: Omit<PrinterMapping, "savedAt" | "method" | "transport"> & { method?: PrintMethod; transport?: PrintTransport },
  now: Date = new Date(),
): DevicePrinterMappings {
  const valid = validMapping({ ...mapping, savedAt: now.toISOString() });
  if (!valid) {
    throw new Error(
      mapping.transport === "server" && mapping.paper === "A4"
        ? "A4 pages are not supported for printers chosen on the server PC. Choose 58 mm or 80 mm."
        : "Choose a printer and a paper size first.",
    );
  }
  const current = loadMappings(storage, tenantId, branchId);
  const next: DevicePrinterMappings = { ...current, [role]: valid };
  storage.setItem(mappingKey(tenantId, branchId), JSON.stringify(next));
  return next;
}

export function clearMapping(storage: KeyValueStorage, tenantId: string, branchId: string, role: PrinterRole): DevicePrinterMappings {
  const current = loadMappings(storage, tenantId, branchId);
  delete current[role];
  if (!current.bill && !current.kitchen) storage.removeItem(mappingKey(tenantId, branchId));
  else storage.setItem(mappingKey(tenantId, branchId), JSON.stringify(current));
  return current;
}

/** A random id for this browser profile, used only to label print-job records. */
export function deviceId(storage: KeyValueStorage | null, random: () => string = defaultRandomId): string | null {
  if (!storage) return null;
  try {
    const existing = storage.getItem(DEVICE_ID_KEY);
    if (existing && /^[a-z0-9-]{8,64}$/i.test(existing)) return existing;
    const id = random();
    storage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return null;
  }
}

function defaultRandomId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// --- routing -------------------------------------------------------------------

export type Route =
  /** Print on this PC's saved printer, without a dialog. */
  | { kind: "local"; mapping: PrinterMapping }
  /** Saved printer is not installed any more: re-select it. Print nowhere else. */
  | { kind: "missing"; printerName: string }
  /** No local bridge, or nothing saved for this role: keep the existing behaviour. */
  | { kind: "default"; reason: "no-bridge" | "not-configured" };

/**
 * Where a print for `role` goes. `transportAvailable` says whether the saved
 * mapping's transport (bridge, or server-on-this-PC) can be used right now;
 * `installed` is that transport's current printer list, or null when it could
 * not be read (then the saved name is still used and the printing side itself
 * reports a missing printer).
 */
export function resolveRoute(
  role: PrinterRole,
  bridgeAvailable: boolean,
  mappings: DevicePrinterMappings,
  installed: InstalledPrinter[] | null,
): Route {
  const mapping = mappings[role];
  if (!bridgeAvailable) {
    return { kind: "default", reason: "no-bridge" };
  }
  if (!mapping) return { kind: "default", reason: "not-configured" };
  if (installed && !installed.some((p) => p.name === mapping.printerName)) {
    return { kind: "missing", printerName: mapping.printerName };
  }
  return { kind: "local", mapping };
}

/** Query parameters for "accept and hand the KOT to this PC". */
export function acceptKotQuery(route: Route, timeZone?: string): string {
  if (route.kind === "missing") return "&kotVia=none";
  if (route.kind !== "local") return "";
  const m = route.mapping;
  if (m.transport === "server") {
    const q = new URLSearchParams({ kotVia: "spooler", kotPrinter: m.printerName, kotPaper: m.paper });
    if (timeZone) q.set("tz", timeZone);
    return `&${q.toString()}`;
  }
  const q = new URLSearchParams({
    kotVia: "device",
    kotFormat: m.method === "driver" ? "html" : "escpos",
    kotPaper: m.paper,
  });
  if (timeZone) q.set("tz", timeZone);
  return `&${q.toString()}`;
}

// --- results -------------------------------------------------------------------

export type LocalPrintStatus = "QUEUED" | "FAILED" | "UNKNOWN";

export interface BridgeFailure {
  code: string;
  message: string;
}

/**
 * Maps a bridge failure to an honest outcome. Only failures where nothing can
 * have reached the printer are FAILED; anything that may have printed is
 * UNKNOWN (and is never resent automatically).
 */
export function classifyBridgeFailure(code: string): LocalPrintStatus {
  switch (code) {
    case "PRINTER_NOT_FOUND":
    case "PRINTER_UNAVAILABLE":
    case "NO_PRINTER":
    case "RAW_REJECTED":
    case "BAD_REQUEST":
    case "FORBIDDEN":
    case "UNSUPPORTED":
    case "NO_BRIDGE":
      return "FAILED";
    case "FAILED":
      return "FAILED";
    default:
      // TIMEOUT, PARTIAL, ERROR, lost replies: it may have printed.
      return "UNKNOWN";
  }
}

export function isMissingPrinterCode(code: string): boolean {
  return code === "PRINTER_NOT_FOUND" || code === "NO_PRINTER";
}

/** Plain-language line for the cashier. Never claims that paper came out. */
export function describeOutcome(
  what: "KOT" | "Bill" | "Test page",
  status: LocalPrintStatus,
  printerName: string,
  error?: string,
): string {
  if (status === "QUEUED") {
    return `${what} sent to "${printerName}" (Windows print queue accepted it). Check the printer to confirm it printed.`;
  }
  if (status === "FAILED") {
    return `${what} was NOT printed on "${printerName}"${error ? `: ${error}` : ""}.`;
  }
  return `${what} print status unknown on "${printerName}"${error ? ` (${error})` : ""}. Check the printer before reprinting — it was not resent automatically.`;
}

// --- duplicate guard -----------------------------------------------------------

/**
 * One in-flight action per key (e.g. "accept:<orderId>"). A second call while
 * the first runs returns null instead of starting another request, which
 * covers double clicks and impatient re-clicks before React re-renders.
 */
export function createSingleFlight() {
  const inFlight = new Set<string>();
  return {
    async run<T>(key: string, fn: () => Promise<T>): Promise<T | null> {
      if (inFlight.has(key)) return null;
      inFlight.add(key);
      try {
        return await fn();
      } finally {
        inFlight.delete(key);
      }
    },
    isRunning(key: string): boolean {
      return inFlight.has(key);
    },
  };
}
