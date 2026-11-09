// Picks the transport for a branch's thermal printer.
//
// Connection types (stored in Branch.printerConnection /
// Branch.billPrinterConnection):
//   USB              – kernel usblp / libusb (Linux/Docker only)
//   NETWORK          – raw ESC/POS over TCP to host:port (JetDirect / port 9100)
//   WINDOWS_SPOOLER  – raw bytes via Windows print queue (by printer name)
//   COM_PORT         – RS-232 / Bluetooth SPP (serial port path, e.g. "COM3")
//
// "SENT" means bytes were accepted by the transport.  Paper output is
// confirmed only by physically looking at the printer — this code NEVER claims
// PRINTED.

import { sendViaNetwork } from './escpos-network';
import { PrinterNotFoundError, sendRaw } from './escpos-usb';
import { sendViaWindowsSpooler } from './escpos-windows-spooler';
import { sendViaComPort } from './escpos-com-port';

export interface BranchPrinterTarget {
  printerConnection: string;
  printerHost: string | null;
  printerPort: number;
  /** Windows Spooler: exact printer name as shown in Devices & Printers */
  printerName?: string | null;
  /** COM_PORT path, e.g. "COM3" or "/dev/ttyS0" */
  printerComPort?: string | null;
  printerBaudRate?: number | null;
}

export async function sendToBranchPrinter(
  branch: BranchPrinterTarget,
  buffer: Buffer,
): Promise<void> {
  switch (branch.printerConnection) {
    case 'NETWORK':
      if (!branch.printerHost) {
        throw new PrinterNotFoundError(
          'Network printing is selected but no printer address is set — add it in Settings › Printer',
        );
      }
      return sendViaNetwork(
        { host: branch.printerHost, port: branch.printerPort },
        buffer,
      );

    case 'WINDOWS_SPOOLER': {
      const name = branch.printerName ?? branch.printerHost;
      if (!name) {
        throw new PrinterNotFoundError(
          'Windows Spooler is selected but no printer name is set — add it in Settings › Printer',
        );
      }
      return sendViaWindowsSpooler({ printerName: name }, buffer);
    }

    case 'COM_PORT': {
      const portPath = branch.printerComPort ?? branch.printerHost;
      if (!portPath) {
        throw new PrinterNotFoundError(
          'COM Port is selected but no port path is set — add it in Settings › Printer',
        );
      }
      return sendViaComPort(
        {
          portPath,
          baudRate: branch.printerBaudRate ?? 9600,
        },
        buffer,
      );
    }

    default:
      // USB (Linux/Docker) or unknown — fall back to usblp / libusb
      return sendRaw(buffer);
  }
}
