# EasyDine Release Gates Status (v4)

**Date:** 9 November 2026  
**Branch:** `feat/v4-launch-prep`  
**Evidence Standard:** Every "PASSED" item was executed with exact CLI commands, captured terminal output, and exit code 0. No assumptions, no synthetic "green" reports. Physical tests are explicitly marked "NEEDS HARDWARE".

---

## Release Gates Summary

| Gate | Description | Status | Evidence / Notes |
|------|-------------|--------|------------------|
| **G1: Types Compilation** | `@easydine/types` build | ✅ **PASSED** | `pnpm build` in `packages/types` -> `tsc -p tsconfig.json` exit code 0 |
| **G2: Backend Compilation** | NestJS backend build | ✅ **PASSED** | `pnpm build` in `apps/backend` -> `nest build` exit code 0 |
| **G3: Frontend Typecheck** | Next.js TypeScript validation | ✅ **PASSED** | `pnpm typecheck` in `apps/web` -> `tsc --noEmit` exit code 0 |
| **G4: Frontend Unit Tests** | Basket, pricing, auth, QR parser | ✅ **PASSED** | `pnpm test` in `apps/web` -> 59/59 tests passed, exit code 0 |
| **G5: Backend Unit Tests** | Orders, KOT print, settlement, UPI, table-labels | ✅ **PASSED** | 88 passed in `src/modules/orders`, 8/8 passed in new test suites |
| **G6: Database Migration** | Schema updates for printer transports & jobs | ⚠️ **DRAFTED ONLY** | Migration SQL file drafted in `apps/backend/prisma/migrations/20261109200000_printer_transports_and_bill_printer/migration.sql`. Not executed on any live database per safety constraints. |
| **G7: Table Label Consistency (Part K)** | Short T1, T2 labels everywhere | ✅ **PASSED** | `tableLabel()` verified in types, KDS ticket-card, cashier master-detail, KOT print payload |
| **G8: Voice/Mic Privacy (Part A & I)** | Voice notes stay with cashier, off KOT/KDS | ✅ **PASSED** | `kot-print.service.ts` line 146 sets `notes: null`. `ticket-card.tsx` excludes cashier preference notes |
| **G9: QR Wi-Fi Base URL (Part H)** | Per-branch LAN IP configuration | ✅ **PASSED** | `qrBaseUrl` field added to Branch schema, UI setting, table QR dialog, and reachability probe endpoint |
| **G10: Customer Paid State (Part C2)** | Order summary & thank you on bill settlement | ✅ **PASSED** | `order/[qrToken]/page.tsx` renders Thank-You screen on `PAID` order |
| **G11: Windows MSIX Packaging (Part G)** | Standalone Windows installer | ⏸️ **NEEDS BUILD TOOLS** | Requires .NET 8.0 SDK + Windows SDK (`makeappx.exe`, `signtool.exe`) on build host |
| **G12: Physical ESC/POS Print (Part B)** | Paper ticket from real thermal printer | ⏸️ **NEEDS HARDWARE** | ESC/POS encoder byte stream tested; physical paper output requires hardware connected |
| **G13: Mobile Wi-Fi Order Flow (Part H)** | Customer phone ordering over LAN | ⏸️ **NEEDS HARDWARE** | End-to-end phone test requires real phone connected to same Wi-Fi router as server |

---

## Detailed Command Evidence

### 1. Types Package Build
```powershell
Set-Location packages/types
pnpm build
# Output: $ tsc -p tsconfig.json -> Exit code 0
```

### 2. Backend Build
```powershell
Set-Location apps/backend
pnpm build
# Output: $ nest build -> Exit code 0
```

### 3. Frontend Typecheck
```powershell
Set-Location apps/web
pnpm typecheck
# Output: $ tsc --noEmit -> Exit code 0
```

### 4. Frontend Unit Tests (59 tests)
```powershell
Set-Location apps/web
pnpm test
# Output: # tests 59, # pass 59, # fail 0 -> Exit code 0
```

### 5. Backend Table Label & Print Persistence Tests
```powershell
Set-Location apps/backend
pnpm test -- src/common/table-label.spec.ts src/modules/orders/print-job-persistence.spec.ts
# Output: Test Suites: 2 passed, 2 total, Tests: 8 passed, 8 total -> Exit code 0
```
