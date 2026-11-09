# EasyDine Gap Inventory & Hardware Requirements

**Date:** 9 November 2026  
**Branch:** `feat/v4-launch-prep`  

---

## 1. Hardware Verification Gaps (Pending Real Restaurant PC / Hardware)

| Area | Description | Current Status | Required Verification on Target Hardware |
|------|-------------|----------------|------------------------------------------|
| **KOT Thermal Printer** | 80mm ESC/POS direct printing | Sent bytes unit-tested | Connect physical ESC/POS printer via USB or Network TCP:9100, verify paper feeds and cuts with correct Indian formatting. |
| **Bill / Receipt Printer** | 80mm / 58mm thermal receipts | Formatting & reprint logic unit-tested | Test print provisional bill and final paid receipt on real printer. |
| **COM Port / Serial** | Serial thermal printing | Code written with lazy `serialport` require | Requires serial printer attached to COM1-COM4 on Windows POS machine. |
| **Windows Spooler** | Printing via Windows Print Queue | Code written (`escpos-windows-spooler.ts`) | Install printer driver in Windows Devices & Printers, send test print through spooler. |
| **Phone QR Over Wi-Fi** | Scanning table QR on customer smartphone | `qrBaseUrl` configuration + dialog verified | Connect laptop/PC and smartphone to the same Wi-Fi router; open `http://<LAN-IP>:1995/order/<token>` from phone. |

---

## 2. Windows Packaging & Signing Gaps (Part G)

| Item | Status | Action Needed |
|------|--------|---------------|
| **.NET SDK & Windows SDK** | Not installed on current workspace agent host (`dotnet`, `makeappx`, `signtool` not in PATH) | To build the MSIX package on a developer PC, install .NET 8.0 SDK and Windows 10/11 SDK. |
| **MSIX Identity (N9)** | `AppxManifest.xml` contains `Publisher="CN=11C721FC-E399-4888-B532-7BFCD5C491B3"` | **Awaiting user confirmation:** Is this your Partner Center publisher identity? If not, a self-signed test cert should be used for sideload testing only, and production signing configured later. |
| **App Lifecycle (G3)** | Service supervisor restart & shutdown | Verify on Windows PC that closing the launcher cleanly terminates background Node/Nest backend processes. |

---

## 3. Platform & Browser Limitations

| Feature | Root Cause / Restriction | Recommended Action / Fallback |
|---------|--------------------------|-------------------------------|
| **Web Speech API over LAN (C10)** | Modern mobile browsers (Chrome, Safari) strictly require a **Secure Context (HTTPS)** for the Web Speech API. When accessed over plain HTTP (`http://192.168.x.x:1995`), the browser blocks microphone access. | **Working fallback:** Text input box is always editable. If voice input is required on mobile phones, configure a local TLS certificate or Caddy reverse proxy with self-signed root cert. |
| **Static QR Token Hijacking (N4)** | Table QR tokens are currently static strings. A guest who saves the URL could potentially submit orders from home if the table is open. | **Proposed options:** (A) Rotate QR token daily/weekly from Table dialog; (B) Require cashier acceptance on every QR order (already implemented); (C) Geo-fence or require local Wi-Fi IP validation. |
| **Station-Level Printers (N6)** | `KitchenStation.printerName` is stored in schema but `kot-print.service.ts` routes all tickets to the branch-level kitchen printer. | Documented as current design: single branch kitchen printer. Station routing can be enabled in a future release if kitchen has multiple physical printers (e.g., Tandoor vs Curry). |
| **Role Permissions (N5)** | `permissions.ts` currently grants `orders.accept` to `WAITER` and `KITCHEN_STAFF`. | If the restaurant wants only CASHIER or MANAGER to accept incoming orders, adjust `permissions.ts`. Preserved as-is per instructions not to alter role permissions without explicit direction. |

---

## 4. Database Migration Safety

- **Migration File:** `apps/backend/prisma/migrations/20261109200000_printer_transports_and_bill_printer/migration.sql`
- **Safety Status:** Staged and drafted only. Never executed against any live database in accordance with pair-programming safety boundaries.
- **Run Command when ready on real environment:**
  ```powershell
  cd apps/backend
  pnpm prisma migrate deploy
  ```
