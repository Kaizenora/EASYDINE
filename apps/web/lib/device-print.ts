// Printing from the phone itself (EasyDine Android app): a paired Bluetooth
// thermal printer, or Android's print dialog (Save as PDF and every installed
// printer). Desktop Web Bluetooth is a separate ESC/POS path; browser bill
// printing uses the receipt-only OS print dialog.
import { isNativeApp, nativePlatform, plugin } from "./native.ts";

export interface BtPrinter {
  name: string;
  address: string;
}

interface NativePrinterApi {
  btPrinters: () => Promise<{ enabled: boolean; supported: boolean; devices: BtPrinter[] }>;
  btPrint: (o: { address: string; data: string }) => Promise<void>;
  printHtml: (o: { html: string; name?: string }) => Promise<void>;
}

const KEY = "easydine.btPrinter";

export function nativePrinter(): NativePrinterApi | null {
  return plugin<NativePrinterApi>("NativePrinter");
}

export function isWebBluetoothSupported(): boolean {
  return typeof navigator !== "undefined" && "bluetooth" in navigator;
}

/** True inside the Android app when its native printer plugin is installed. */
export function canPrintOnDevice(): boolean {
  return isNativeApp() && nativePlatform() === "ANDROID" && !!nativePrinter();
}

// --- Direct Web Bluetooth printing (optional, off by default) ----------------
// System/browser printing stays the default transport. Direct BLE is used only
// when the cashier has paired a printer whose GATT profile was VERIFIED and has
// explicitly switched the active transport to "ble".

export type PrintTransport = "system" | "ble";

/** A printer profile this app knows how to write to: one service, one characteristic. */
export interface BleProfile {
  service: string;
  characteristic: string;
}

/** The only profiles we write to. Nothing outside this list is ever guessed. */
export const SUPPORTED_BLE_PROFILES: readonly BleProfile[] = [
  { service: "000018f0-0000-1000-8000-00805f9b34fb", characteristic: "00002af1-0000-1000-8000-00805f9b34fb" },
  { service: "e7810a71-73ae-499d-8c15-faa9aef0c3f2", characteristic: "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f" },
  { service: "49535343-fe7d-4ae5-8fa9-9fafd205e455", characteristic: "49535343-8841-43f4-a8d4-ecbe34729bb3" },
];

/** A device the browser was allowed to use AND whose profile we confirmed. */
export interface WebBtPrinter {
  id: string;
  name: string;
  profile: BleProfile;
}

const WEB_PRINTER_KEY = "easydine.webBtPrinter";
const TRANSPORT_KEY = "easydine.printTransport";

export const BLE_UNSUPPORTED_MESSAGE =
  "This Bluetooth device is not a supported receipt printer profile, so it was not saved. Keep using system printing (install the printer in your OS and use the print dialog).";
export const BLE_RECONNECT_MESSAGE =
  "The Bluetooth printer is not available. Switch it on, then open Settings > Printers and choose it again. Nothing was sent. System printing still works.";
export const BLE_INTERRUPTED_MESSAGE =
  "Connection to the printer dropped while sending - the print may be incomplete. Check the printer, then reprint manually if needed. It was not retried, so nothing is duplicated.";
export const BLE_SENT_MESSAGE = "Data sent to the printer. Check the paper to confirm it printed.";

export class BlePrinterError extends Error {
  readonly kind: "unsupported" | "unavailable" | "interrupted" | "busy";
  constructor(message: string, kind: "unsupported" | "unavailable" | "interrupted" | "busy") {
    super(message);
    this.kind = kind;
  }
}

function readJson<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function isProfile(p: unknown): p is BleProfile {
  const x = p as BleProfile | null;
  return (
    !!x &&
    typeof x.service === "string" &&
    typeof x.characteristic === "string" &&
    SUPPORTED_BLE_PROFILES.some((k) => k.service === x.service && k.characteristic === x.characteristic)
  );
}

/** The saved verified printer, or null (also null for anything that fails validation). */
export function savedWebPrinter(): WebBtPrinter | null {
  const v = readJson<WebBtPrinter>(WEB_PRINTER_KEY);
  if (!v || typeof v.id !== "string" || !v.id || typeof v.name !== "string" || !isProfile(v.profile)) return null;
  return v;
}

export function forgetWebPrinter() {
  try {
    window.localStorage.removeItem(WEB_PRINTER_KEY);
    window.localStorage.setItem(TRANSPORT_KEY, "system");
  } catch {
    // storage blocked: nothing was saved either
  }
}

/** "system" unless the cashier explicitly chose BLE AND a verified printer is saved. */
export function getPrintTransport(): PrintTransport {
  try {
    if (window.localStorage.getItem(TRANSPORT_KEY) === "ble" && savedWebPrinter()) return "ble";
  } catch {
    // fall through to the default
  }
  return "system";
}

export function setPrintTransport(t: PrintTransport) {
  if (t === "ble" && !savedWebPrinter()) throw new Error("Choose and verify a Bluetooth printer first.");
  window.localStorage.setItem(TRANSPORT_KEY, t);
  window.dispatchEvent(new Event("easydine:printer"));
}

/** Whether the browser can silently reconnect to an already-allowed device. */
export function canReconnectWithoutChooser(): boolean {
  return (
    isWebBluetoothSupported() &&
    typeof (navigator.bluetooth as { getDevices?: unknown }).getDevices === "function"
  );
}

/**
 * Confirms a connected GATT server exposes one of the supported printer
 * profiles with a writable characteristic. Reads only - nothing is written.
 */
export async function verifyPrinterProfile(server: BluetoothRemoteGATTServer): Promise<BleProfile | null> {
  for (const profile of SUPPORTED_BLE_PROFILES) {
    try {
      const service = await server.getPrimaryService(profile.service);
      const c = await service.getCharacteristic(profile.characteristic);
      if (c.properties.write || c.properties.writeWithoutResponse) return profile;
    } catch {
      // not this profile; try the next supported one
    }
  }
  return null;
}

/**
 * Opens the browser's device chooser and verifies the pick. MUST be called
 * straight from a click handler (the chooser needs a user gesture). Saves the
 * printer only after verification, and never writes any bytes to it.
 */
export async function pairWebBluetoothPrinter(): Promise<WebBtPrinter | null> {
  if (!isWebBluetoothSupported()) {
    throw new BlePrinterError("Web Bluetooth is not available in this browser. Use Chrome or Edge, or system printing.", "unavailable");
  }
  let device: BluetoothDevice;
  try {
    device = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: SUPPORTED_BLE_PROFILES.map((p) => p.service),
    });
  } catch {
    return null; // chooser dismissed
  }
  try {
    const server = await device.gatt?.connect();
    if (!server) throw new BlePrinterError(BLE_RECONNECT_MESSAGE, "unavailable");
    const profile = await verifyPrinterProfile(server);
    if (!profile) throw new BlePrinterError(BLE_UNSUPPORTED_MESSAGE, "unsupported");
    const printer: WebBtPrinter = { id: device.id, name: device.name || "Bluetooth printer", profile };
    window.localStorage.setItem(WEB_PRINTER_KEY, JSON.stringify(printer));
    return printer;
  } finally {
    try {
      device.gatt?.disconnect();
    } catch {
      // already disconnected
    }
  }
}

/**
 * True when ESC/POS bytes should be sent from this device: the Android app, or
 * a browser where the cashier explicitly selected a verified BLE printer.
 * Everything else (the default) uses system/server printing.
 */
export function canPrintEscposLocally(): boolean {
  return canPrintOnDevice() || (canReconnectWithoutChooser() && getPrintTransport() === "ble");
}

export function savedBtPrinter(): BtPrinter | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BtPrinter) : null;
  } catch {
    return null;
  }
}

export function saveBtPrinter(p: BtPrinter | null) {
  try {
    if (p) window.localStorage.setItem(KEY, JSON.stringify(p));
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage blocked: the printer is asked for again next time
  }
}

export class PrinterNotChosen extends Error {
  constructor() {
    super("No Bluetooth printer chosen. Pair the printer in Bluetooth settings, then choose it here.");
  }
}

// --- picker bus: the printing code asks, the dialog (mounted once) answers -----
type Resolve = (p: BtPrinter | null) => void;
let pickerListener: ((resolve: Resolve) => void) | null = null;

export function registerPrinterPicker(listener: (resolve: Resolve) => void) {
  pickerListener = listener;
  return () => {
    if (pickerListener === listener) pickerListener = null;
  };
}

/** Opens the "choose a Bluetooth printer" dialog and resolves with the choice. */
export async function chooseBtPrinter(): Promise<BtPrinter | null> {
  if (canPrintOnDevice()) {
    return new Promise((resolve) => (pickerListener ? pickerListener(resolve) : resolve(null)));
  }

  return null;
}

let bleJobActive = false;

/**
 * Sends ESC/POS bytes to the saved, verified printer. Reconnects through
 * getDevices() - it never opens the chooser. A dropped connection stops the
 * job and is reported as ambiguous; the job is NEVER retried or resent.
 */
async function printViaWebBluetooth(chunks: string[]): Promise<void> {
  const saved = savedWebPrinter();
  if (!saved || !canReconnectWithoutChooser()) throw new BlePrinterError(BLE_RECONNECT_MESSAGE, "unavailable");
  if (bleJobActive) throw new BlePrinterError("Another Bluetooth print is still being sent. Wait for it, then print again.", "busy");
  bleJobActive = true;
  let device: BluetoothDevice | undefined;
  try {
    const allowed = await (navigator.bluetooth as unknown as { getDevices: () => Promise<BluetoothDevice[]> }).getDevices();
    device = allowed.find((d) => d.id === saved.id);
    if (!device?.gatt) throw new BlePrinterError(BLE_RECONNECT_MESSAGE, "unavailable");

    let characteristic: BluetoothRemoteGATTCharacteristic;
    try {
      const server = await device.gatt.connect();
      const profile = await verifyPrinterProfile(server);
      if (!profile || profile.service !== saved.profile.service || profile.characteristic !== saved.profile.characteristic) {
        throw new BlePrinterError(BLE_UNSUPPORTED_MESSAGE, "unsupported");
      }
      characteristic = await (await server.getPrimaryService(profile.service)).getCharacteristic(profile.characteristic);
    } catch (e) {
      if (e instanceof BlePrinterError) throw e;
      throw new BlePrinterError(BLE_RECONNECT_MESSAGE, "unavailable"); // nothing was sent yet
    }

    let sentAnything = false;
    try {
      for (const base64Chunk of chunks) {
        const binary = atob(base64Chunk);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        // 100-byte slices stay under the conservative BLE write size.
        for (let offset = 0; offset < bytes.length; offset += 100) {
          const slice = bytes.slice(offset, offset + 100);
          if (characteristic.properties.writeWithoutResponse) await characteristic.writeValueWithoutResponse(slice);
          else await characteristic.writeValueWithResponse(slice);
          sentAnything = true;
        }
      }
    } catch {
      throw new BlePrinterError(
        sentAnything ? BLE_INTERRUPTED_MESSAGE : BLE_RECONNECT_MESSAGE,
        sentAnything ? "interrupted" : "unavailable",
      );
    }
  } finally {
    bleJobActive = false;
    try {
      device?.gatt?.disconnect();
    } catch {
      // already disconnected
    }
  }
}

/** Sends ESC/POS data (base64 from the server) to the chosen Bluetooth printer. */
export async function printEscposOnDevice(chunks: string[]): Promise<void> {
  if (canPrintOnDevice()) {
    const np = nativePrinter();
    if (!np) throw new Error("The Android printer plugin is not available.");
    let printer = savedBtPrinter();
    if (!printer) {
      printer = await chooseBtPrinter();
      if (!printer) throw new PrinterNotChosen();
      saveBtPrinter(printer);
    }
    for (const data of chunks) await np.btPrint({ address: printer.address, data });
    return;
  }

  if (canReconnectWithoutChooser() && getPrintTransport() === "ble") {
    await printViaWebBluetooth(chunks);
    return;
  }

  throw new Error("Direct Bluetooth printing is not enabled. Use system printing, or choose a Bluetooth printer in Settings > Printers.");
}

/** Opens browser/system print dialog for a bill / receipt / ticket. */
export async function printHtmlOnDevice(html: string, name: string): Promise<void> {
  const np = nativePrinter();
  if (!canPrintOnDevice() || !np) {
    throw new Error("Native receipt printing requires the EasyDine Android printer plugin.");
  }
  await np.printHtml({ html, name });
}
