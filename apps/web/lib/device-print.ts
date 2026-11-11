// Printing from the phone itself (EasyDine Android app) or desktop browser (Web Bluetooth):
// a paired Bluetooth thermal printer, or Android's print dialog (Save as PDF and every installed
// printer). In a normal browser, Web Bluetooth or the browser print dialog is used.
import { isNativeApp, plugin } from "./native.ts";

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
  return typeof navigator !== "undefined" && typeof (navigator as any).bluetooth !== "undefined";
}

/** True inside the app on a phone or in a browser supporting Web Bluetooth. */
export function canPrintOnDevice(): boolean {
  return (isNativeApp() && !!nativePrinter()) || isWebBluetoothSupported();
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
  if (isNativeApp()) {
    return new Promise((resolve) => (pickerListener ? pickerListener(resolve) : resolve(null)));
  }

  // Web Bluetooth browser prompt
  if (isWebBluetoothSupported()) {
    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: [
          "000018f0-0000-1000-8000-00805f9b34fb",
          "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
          "49535343-fe7d-4ae5-8fa9-9fafd205e455",
        ],
      });
      const printer: BtPrinter = {
        name: device.name || "Bluetooth Thermal Printer",
        address: device.id || "web-bluetooth",
      };
      saveBtPrinter(printer);
      return printer;
    } catch {
      return null;
    }
  }

  return null;
}

/** Sends raw ESC/POS bytes via Web Bluetooth GATT service. */
async function printViaWebBluetooth(chunks: string[]): Promise<void> {
  if (!isWebBluetoothSupported()) {
    throw new Error("Web Bluetooth is not supported in this browser. Use Chrome or Edge over HTTPS/localhost.");
  }

  const device = await (navigator as any).bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: [
      "000018f0-0000-1000-8000-00805f9b34fb",
      "e7810a71-73ae-499d-8c15-faa9aef0c3f2",
      "49535343-fe7d-4ae5-8fa9-9fafd205e455",
    ],
  });

  const server = await device.gatt?.connect();
  if (!server) throw new Error("Could not connect to Bluetooth device GATT server.");

  const services = await server.getPrimaryServices();
  let writeChar: any = null;

  for (const service of services) {
    const chars = await service.getCharacteristics();
    for (const c of chars) {
      if (c.properties.write || c.properties.writeWithoutResponse) {
        writeChar = c;
        break;
      }
    }
    if (writeChar) break;
  }

  if (!writeChar) {
    throw new Error("No writable ESC/POS characteristic found on this Bluetooth device.");
  }

  for (const base64Chunk of chunks) {
    const binary = atob(base64Chunk);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    // Send in chunks of 100 bytes to accommodate BLE MTU
    const CHUNK_SIZE = 100;
    for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
      const slice = bytes.slice(offset, offset + CHUNK_SIZE);
      if (writeChar.writeValueWithoutResponse) {
        await writeChar.writeValueWithoutResponse(slice);
      } else {
        await writeChar.writeValue(slice);
      }
    }
  }
}

/** Sends ESC/POS data (base64 from the server) to the chosen Bluetooth printer. */
export async function printEscposOnDevice(chunks: string[]): Promise<void> {
  const np = nativePrinter();
  if (np) {
    let printer = savedBtPrinter();
    if (!printer) {
      printer = await chooseBtPrinter();
      if (!printer) throw new PrinterNotChosen();
      saveBtPrinter(printer);
    }
    for (const data of chunks) await np.btPrint({ address: printer.address, data });
    return;
  }

  if (isWebBluetoothSupported()) {
    await printViaWebBluetooth(chunks);
    return;
  }

  throw new Error("Bluetooth printing requires the EasyDine app or a Web Bluetooth supported browser (Chrome/Edge).");
}

/** Opens browser/system print dialog for a bill / receipt / ticket. */
export async function printHtmlOnDevice(html: string, name: string): Promise<void> {
  const np = nativePrinter();
  if (np) {
    await np.printHtml({ html, name });
    return;
  }
  window.print();
}
