// COM port (RS-232 / Bluetooth SPP) transport for ESC/POS thermal printers.
//
// Bluetooth printers paired via Windows SPP appear as a COM port (e.g. COM3).
// This transport writes raw bytes to that port using Node's SerialPort library.
//
// PREREQUISITE: `pnpm add serialport` in apps/backend AND the backend must be
// restarted after installation.  serialport is a native addon compiled for the
// host Node ABI.  Installation steps are in docs/WINDOWS-SETUP-AND-TEST.md.
//
// If serialport is NOT installed the transport throws a clear
// PrinterNotFoundError with instructions — it does NOT crash the server.
//
// "SENT" = bytes accepted by the OS serial driver.  Paper output is confirmed
// only by physically looking at the printer.

import { PrinterNotFoundError } from './escpos-usb';

export interface ComPortTarget {
  portPath: string; // e.g. "COM3" on Windows, "/dev/ttyS0" on Linux
  baudRate?: number; // default 9600 for most thermal printers
}

/** Lazy-loaded SerialPort — only imported when actually needed. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let SerialPortClass: (new (opts: any) => any) | null | undefined;
let listPortsFn: (() => Promise<{ path: string; friendlyName?: string; manufacturer?: string }[]>) | null | undefined;

async function loadSerialPort(): Promise<boolean> {
  if (SerialPortClass !== undefined) return SerialPortClass !== null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const mod = require('serialport') as any;
    // serialport v10+ exports SerialPort; v9 exports SerialPort directly.
    SerialPortClass = mod.SerialPort ?? mod.default ?? mod;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    listPortsFn = async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cls: any = mod.SerialPort ?? mod.default ?? mod;
      return cls.list();
    };
    return true;
  } catch {
    SerialPortClass = null;
    listPortsFn = null;
    return false;
  }
}

export async function sendViaComPort(
  target: ComPortTarget,
  buffer: Buffer,
): Promise<void> {
  const available = await loadSerialPort();
  if (!available || !SerialPortClass) {
    throw new PrinterNotFoundError(
      'COM port printing requires the "serialport" npm package. ' +
        'Run: pnpm add serialport  in apps/backend, then restart the server. ' +
        'See docs/WINDOWS-SETUP-AND-TEST.md for the full installation steps.',
    );
  }

  const SP = SerialPortClass;
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const port: any = new SP({
      path: target.portPath,
      baudRate: target.baudRate ?? 9600,
      autoOpen: false,
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    port.open((openErr: any) => {
      if (openErr) {
        const msg: string = openErr.message ?? String(openErr);
        if (/not found|no such|access denied|ENOENT/i.test(msg)) {
          reject(
            new PrinterNotFoundError(
              `COM port ${target.portPath} not found or access denied. ` +
                `Pair the Bluetooth printer first and check the port in Settings › Printer.`,
            ),
          );
        } else {
          reject(new Error(`COM port ${target.portPath} open failed: ${msg}`));
        }
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      port.write(buffer, (writeErr: any) => {
        if (writeErr) {
          port.close(() => undefined);
          reject(
            new Error(
              `COM port ${target.portPath} write failed: ${writeErr.message}`,
            ),
          );
          return;
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        port.drain((drainErr: any) => {
          port.close(() => undefined);
          if (drainErr) {
            reject(
              new Error(
                `COM port ${target.portPath} drain failed: ${drainErr.message}`,
              ),
            );
          } else {
            resolve();
          }
        });
      });
    });
  });
}

/**
 * Returns the list of COM ports visible to the OS.
 * On Windows these include both physical and Bluetooth SPP virtual ports.
 * Empty array if serialport is not installed or the query fails.
 */
export async function listComPorts(): Promise<
  { path: string; friendlyName?: string }[]
> {
  const available = await loadSerialPort();
  if (!available || !listPortsFn) return [];
  try {
    const ports = await listPortsFn();
    return ports.map((p) => ({
      path: p.path,
      friendlyName: p.friendlyName ?? p.manufacturer ?? undefined,
    }));
  } catch {
    return [];
  }
}
