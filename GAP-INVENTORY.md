# EasyDine Gap Inventory & Hardware Verification Plan
**Audited Date:** 9 November 2026  
**Repository Branch:** `feat/v4-launch-prep` (Local only)  
**Commit Baseline:** `fdf4d16`  
**Audit Standard:** Strict empirical verification. No unsupported claims.

---

## 1. Verified & Tested Features

| Component / Flow | Verified Test | Result |
|---|---|---|
| **Production Web Build** | `cd apps/web && pnpm build` | All 50 routes compiled with 0 errors via Webpack runner. |
| **Backend NestJS Build** | `cd apps/backend && pnpm build` | NestJS compilation passed with 0 TypeScript errors. |
| **Table Settle & Checkout Route** | `POST /api/v1/tables/:id/settle` | Settle table route implemented, tested via `tables.controller.spec.ts`. Frontend fake receipt calculation removed. |
| **Shift Management PATCH Route** | `PATCH /api/v1/hr/shifts/:id` | Handles shift updates with boundary validation and branch authorization; tested via `hr.controller.spec.ts`. |
| **KOT Auto-Print on Accept** | `KotPrintService.printOrder` in `acceptOrder` | Auto-dispatches to printer pipeline, returns `SENT`, `FAILED`, `UNKNOWN`, `NO_PRINTER` without failing acceptance; tested via `order-accept-print.spec.ts`. |
| **Waiter Dispatch Notification** | `modern-table-grid.tsx` | Toast only shown on mutation success or error. Single dispatch tracking disables repeated taps. |
| **Guest Phone Persistence** | `orders.service.ts` | Guest phone passed in first QR order is persisted in `deliveryPhone` on the order record. Migration script drafted. |
| **Customer Voice Note Privacy** | `order/[qrToken]/page.tsx`, KDS, KOT | Voice speech-to-text goes to editable box, saved to cashier-only notes. Excluded from KDS and paper KOT. No voice/mic badge. |
| **Placeholder Cleanliness** | Codebase audit | All hardcoded instances of "Hotel Sanjog" removed from source code. |
| **Table Labels (T1, T2)** | `@easydine/types` `tableLabel` | Standardized `tableLabel(number, name)` helper exported and used across backend and web. |

---

## 2. Gap Inventory (Unverified / Requires Physical Hardware / Out-of-Scope)

| Component | Status | Reason & Action Required Prior to Live Operation |
|---|---|---|
| **Physical ESC/POS Thermal Printers** | **UNVERIFIED (Hardware)** | Tested via mock and TCP loopback. Must be physically tested with a real 58mm/80mm USB or Network ESC/POS thermal printer. |
| **Windows Spooler Direct Printing** | **UNVERIFIED (Hardware)** | Raw Windows spooler / driver printing on a real Windows PC with actual POS printer drivers installed. |
| **LAN Mobile QR Scans & CORS** | **UNVERIFIED on Multi-Device LAN** | Needs verification on local Wi-Fi between physical mobile phone and host PC running the app. |
| **SpeechRecognition Provider Audio Routing** | **DOCUMENTED** | The browser Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) in Chrome, Edge, and Safari transmits spoken audio to external vendor speech-to-text servers (Google / Apple) unless an offline OS language pack is used. |
| **MSIX Partner Center Signing** | **UNVERIFIED (Identity)** | Publisher CN and Identity in `AppxManifest.xml` require owner verification against Microsoft Partner Center account. Self-signed certificate used for local staging. |
