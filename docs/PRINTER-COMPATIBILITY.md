# Printer Compatibility & Hardware Audit Matrix

> [!IMPORTANT]
> **Audit Context**: Audited against local workspace repository on branch `feat/v4-launch-prep` (commit `74a7b28`).
> **SENT** indicates raw ESC/POS bytes were accepted by the transport driver or network socket.
> **PRINTED** (physical paper ejection and legibility) is strictly confirmed by physical inspection of the hardware.

---

## 1. Transport Support & Verification Matrix

| Transport / Connection | Implementation File | Status | Platform Support | Limitations & Hardware Prerequisites |
|---|---|---|---|---|
| **Network TCP (Port 9100 / JetDirect)** | `apps/backend/src/modules/orders/escpos-network.ts` | **SUPPORTED (Code Complete)** | Cross-platform (Windows, Linux, macOS) | Requires thermal printer with Ethernet/Wi-Fi on the same local subnet. Open port 9100. Verified via unit specs (`escpos-network.spec.ts`). Unverified on live physical paper in this environment. |
| **Windows Spooler (RAW Win32)** | `apps/backend/src/modules/orders/escpos-windows-spooler.ts` | **SUPPORTED (Code Complete)** | Windows only (`process.platform === 'win32'`) | Uses P/Invoke `winspool.drv` (`OpenPrinterA`, `StartDocPrinterA` with `pDataType = "RAW"`, `WritePrinter`). Requires manufacturer thermal Windows driver installed in *Devices & Printers*. Unverified on live physical printer in this environment. |
| **USB Direct (`/dev/usb/lp*` & libusb)** | `apps/backend/src/modules/orders/escpos-usb.ts` | **SUPPORTED (Linux only)** | Linux / Linux Docker hosts | Tries kernel `usblp` character devices (`/dev/usb/lp0`-`3`), then fallback to `usb` npm package. Does **not** work on Windows hosts directly (Windows does not expose `/dev/usb/lp*`). |
| **COM Port / Serial (RS-232 / BT SPP)** | `apps/backend/src/modules/orders/escpos-com-port.ts` | **INSTALLED & VERIFIED** | Windows (e.g. `COM3`), Linux (`/dev/ttyS*`) | `serialport` package installed and compiled (`node-gyp-build`). Verified runtime loading. Detects available COM ports (returns empty list `[]` when no physical serial adapter is attached). |
| **Browser Print (`window.print`)** | `apps/backend/src/modules/orders/receipt.html.ts` & `kot.html.ts` | **VERIFIED & WORKING** | All browsers & OS | Renders 80mm thermal CSS print media stylesheets. Served at `GET /orders/:id/receipt` and `GET /orders/:id/kot`. Full Unicode UTF-8 support. |
| **Web Bluetooth & Mobile BT** | `apps/web/lib/device-print.ts` & `bt-printer-dialog.tsx` | **SUPPORTED (Native + Web BLE)** | Android/iOS (Capacitor) & Chrome/Edge (Web Bluetooth) | Uses `NativePrinterPlugin` on mobile. On desktop browsers, connects to thermal printers via W3C Web Bluetooth GATT service (`navigator.bluetooth`) with chunked ESC/POS streaming. |

---

## 2. Separate KOT vs Bill Printer Roles

The database schema (`branches` table) and application logic enforce strict physical and logical separation:

- **Kitchen Ticket Printer (KOT):**
  - Columns: `printerConnection`, `printerHost`, `printerPort`, `printerName`, `printerComPort`, `printerBaudRate`.
  - Service: `KotPrintService` (`apps/backend/src/modules/orders/kot-print.service.ts`).
  - Target: Thermal printer at prep stations or main kitchen.
- **Bill / Cashier Receipt Printer:**
  - Columns: `billPrinterConnection`, `billPrinterHost`, `billPrinterPort`, `billPrinterName`, `billPrinterComPort`, `billPrinterBaudRate`.
  - Service: `OrdersService.billPrinterTarget()` (`apps/backend/src/modules/orders/orders.service.ts:938`).
  - Strict Rule: Zero fallback to KOT printer if bill printer is unconfigured (returns `null` / `Bill printer not set` to prevent customer bills ejecting inside the kitchen).

---

## 3. Character Encoding & Content Rules

| Data / Element | Raw ESC/POS Behavior | HTML / Browser Print Behavior | Architecture Notes |
|---|---|---|---|
| **Rupee Symbol (₹)** | Encoded as `Rs.` | Renders as `₹` | Thermal single-byte codepages (PC437, PC858, PC850) lack `\u20b9`. `escpos-receipt.ts` maps `INR: ['Rs.', 'Rs.']`. |
| **Devanagari / Marathi** | Replaced with `?` | Full native rendering | Raw ESC/POS single-byte mode cannot represent multi-byte Indic scripts without dedicated printer ROM glyphs or bitmap rasterization. Unmapped characters trigger slip notice: `(!) Some characters could not be printed and show as "?"`. Browser print supports full UTF-8. |
| **Kitchen Notes vs Cashier Notes** | Item kitchen notes & modifiers print on KOT | Item notes print on receipt | Customer personal voice/preference notes (`order.notes`) are marked cashier-only (`notes: null` in KOT builder) and never sent to kitchen slips. |

---

## 4. Duplicate Print Guards & Concurrency Control

1. **Atomic Compare-and-Set Claim:**
   - In `KotPrintService.run()`, unprinted tickets execute `prisma.kot.updateMany({ where: { id: kot.id, printedCount: 0 }, data: { printedCount: 1, printedAt: new Date() } })`.
   - If two cashiers or tablets tap simultaneously, only one succeeds (`claimed.count === 1`); the second is silently dropped.
2. **Failure Claim Release:**
   - If `sendToBranchPrinter()` throws (e.g. offline, paper out, unplugged), the catch block resets `printedCount: 0` so the cashier can re-trigger printing once resolved.
3. **Reprint Watermark:**
   - Reprinting requires an explicit `reprint=true` flag. The generated ESC/POS output prominently prints `*** REPRINT #n ***` on the ticket header.
4. **Audit Logging:**
   - Print jobs are recorded in the `print_jobs` table with job status (`SENT`), transport target, timestamp, and attempt counts.
