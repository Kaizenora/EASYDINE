# EasyDine Launch-Readiness Gap Inventory
**Audited Date:** 8 November 2026  
**Repository Branch:** `fix/launch-readiness`  
**Commit Baseline:** `7753939a`  
**Audit Standard:** Strict verification. No slogans, no unfounded claims.

---

## 1. Verified & Tested Features

| Component / Flow | Verified Test | Result |
|---|---|---|
| **Production Build** | `pnpm --filter @easydine/types build && cd apps/web && pnpm build` | All 50 routes compiled with 0 errors via Webpack runner. |
| **Backend Build** | `cd apps/backend && pnpm build` | NestJS compilation passed with 0 TypeScript errors. |
| **Table Settle & Checkout** | `POST /api/v1/tables/:id/settle` | Settle table triggers full checkout with inclusive tax math, releases table to `AVAILABLE`, resolves waiter/bill requests, and auto-syncs customer. |
| **Shift Management** | `PATCH /api/v1/hr/shifts/:id` | Handles shift updates with boundary validation, clash checks, and staff assignment. |
| **Reject Order Flow** | `POST /api/v1/orders/:id/reject` | Reason dialog with structured reason submission and button disabling during mutation. |
| **Order Numbering** | `formatOrderNumber` | `#N` format across KDS, cashier, and customer tracker, retaining `YYYYMMDD-NNNN` in database. |
| **QR Check-in & Idempotency** | `POST /api/v1/menu/:qrToken/check-in` & `order` | Idempotent `requestId` handling, optional guest name and phone number without blocking menu access. |
| **KOT Print on Accept** | `KotPrintService.printOrder` in `acceptOrder` | Auto-dispatches to printer queue without failing HTTP accept if printer is unreachable. |
| **Repository Links** | All config, compose, and updater scripts | Updated to point to `Kaizenora/EASYDINE`. |

---

## 2. Gap Inventory (Unverified / Requires Physical Hardware / Out-of-Scope)

| Component | Status | Reason & Action Required Prior to Live Operation |
|---|---|---|
| **Physical ESC/POS Thermal Printers** | **UNVERIFIED (Hardware)** | Simulated and unit tested via `escpos-network.spec.ts` and `escpos-receipt.spec.ts`. Must test against actual USB/TCP thermal printer hardware on site. |
| **Physical Cash Drawers** | **UNVERIFIED (Hardware)** | Cash drawer pulse commands (ESC/POS `27, 112, 0, 25, 250`) require physical RJ11 kick connection from receipt printer. |
| **Web Bluetooth Direct Printing** | **PARTIAL** | Web Bluetooth API is limited to Google Chrome / Edge on Android, Windows, and ChromeOS with BLE GATT profiles. Legacy Bluetooth Serial Port Profile (SPP) requires native OS printer drivers or USB. |
| **Physical UPI Soundbox / Payment Webhooks** | **NOT CONFIGURED** | Product decision: Cash/UPI-at-counter only. No automatic online webhook verification for dynamic UPI QR; cashier visually verifies UPI receipt before tapping Confirm Paid. |
| **Disaster Recovery Live Drill** | **UNVERIFIED on Production** | Synthetic restore specification created in `TOPOLOGY-ASSESSMENT.md`. Production restore drill must only be executed during a planned maintenance window with live database backups secured. |
| **Multi-Branch Concurrent Load Benchmarks** | **ESTIMATED** | Standard node/Postgres capacity tested locally. Multi-thousand order-per-hour concurrency tests require dedicated load testing harness (e.g. k6 / Locust). |
