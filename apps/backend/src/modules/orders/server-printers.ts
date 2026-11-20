// Printers installed in Windows on the machine that runs this EasyDine server.
//
// Used when the cashier's browser is open on that same PC (EasyDine server on
// the cashier PC — no extra install): the cashier picks the Bill / Kitchen
// printer from this list, and the server prints raw ESC/POS to that exact
// Windows printer queue (escpos-windows-spooler.ts).
//
// A printer name coming from a browser is ONLY used if it exactly matches a
// printer Windows itself reports. Nothing is guessed, nothing falls back to
// the default printer, and drivers / ports / defaults are never changed.
import { PrinterNotFoundError } from './escpos-usb';
import { listWindowsPrinters } from './escpos-windows-spooler';
import type { BranchPrinterTarget } from './printer-transport';

const CACHE_MS = 15_000;
let cache: { at: number; names: string[] } | null = null;

/** Test hook: replaces the Windows query. */
let lister: () => Promise<string[]> = listWindowsPrinters;
export function __setPrinterListerForTests(fn: (() => Promise<string[]>) | null) {
  lister = fn ?? listWindowsPrinters;
  cache = null;
}

export async function serverWindowsPrinters(fresh = false): Promise<{
  supported: boolean;
  printers: string[];
}> {
  const supported = process.platform === 'win32' || lister !== listWindowsPrinters;
  if (!supported) return { supported: false, printers: [] };
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) {
    return { supported, printers: cache.names };
  }
  const names = (await lister()).filter((n) => typeof n === 'string' && n.length > 0);
  cache = { at: Date.now(), names };
  return { supported, printers: names };
}

/**
 * Spooler target for a printer the cashier saved. Throws PrinterNotFoundError
 * when that exact name is not installed on this server PC (re-select it).
 */
export async function spoolerTargetFor(
  printerName: string | undefined | null,
): Promise<BranchPrinterTarget> {
  const name = (printerName ?? '').trim();
  if (!name || name.length > 200) {
    throw new PrinterNotFoundError('No printer was chosen on this PC.');
  }
  // The spooler transport passes the name through a PowerShell command line;
  // refuse characters that could break out of it (rename the printer instead).
  if (/["`%\r\n\x00]/.test(name)) {
    throw new PrinterNotFoundError(
      `The printer name "${name}" contains characters EasyDine cannot use. Rename the printer in Windows and choose it again.`,
    );
  }
  const { supported, printers } = await serverWindowsPrinters();
  if (!supported) {
    throw new PrinterNotFoundError(
      'This EasyDine server is not running on Windows, so it cannot use this PC\'s installed printers.',
    );
  }
  let found = printers.includes(name);
  if (!found) {
    // The list may be stale (printer just installed): check once more.
    found = (await serverWindowsPrinters(true)).printers.includes(name);
  }
  if (!found) {
    throw new PrinterNotFoundError(
      `The printer "${name}" is not installed on this PC. Choose the printer again in Settings › Printers.`,
    );
  }
  return {
    printerConnection: 'WINDOWS_SPOOLER',
    printerHost: null,
    printerPort: 9100,
    printerName: name,
  };
}
