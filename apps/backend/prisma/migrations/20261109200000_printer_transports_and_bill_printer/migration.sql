-- Migration: printer_transports_and_bill_printer
-- Drafted 2026-11-09. NOT YET RUN. Run only with explicit approval.
--
-- Changes:
--   1. Add Windows Spooler and COM Port fields to the KOT (kitchen) printer config.
--   2. Add a separate bill printer config block.
--   3. Add per-printer verified status (NOT_TESTED / TEST_SENT / CONFIRMED_BY_STAFF / FAILED).
--   4. Add per-branch saved qrBaseUrl for table QR codes over local Wi-Fi.
--   5. Create persistent print_jobs table to survive app restarts and prevent duplicate accepts.

-- ─── 1. KOT / Kitchen printer: Windows Spooler + COM Port + Status ─────────

ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "printerName"     TEXT,
  ADD COLUMN IF NOT EXISTS "printerComPort"  TEXT,
  ADD COLUMN IF NOT EXISTS "printerBaudRate" INTEGER,
  ADD COLUMN IF NOT EXISTS "printerStatus"   TEXT NOT NULL DEFAULT 'NOT_TESTED';

-- ─── 2. Bill / Receipt printer (separate from KOT kitchen printer) ──────────

ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "billPrinterConnection"   TEXT,
  ADD COLUMN IF NOT EXISTS "billPrinterHost"         TEXT,
  ADD COLUMN IF NOT EXISTS "billPrinterPort"         INTEGER NOT NULL DEFAULT 9100,
  ADD COLUMN IF NOT EXISTS "billPrinterName"         TEXT,
  ADD COLUMN IF NOT EXISTS "billPrinterComPort"      TEXT,
  ADD COLUMN IF NOT EXISTS "billPrinterBaudRate"     INTEGER,
  ADD COLUMN IF NOT EXISTS "billPrinterPaperWidthMm" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN IF NOT EXISTS "billPrinterCodepage"     TEXT NOT NULL DEFAULT 'CP858',
  ADD COLUMN IF NOT EXISTS "billPrinterColumns"      INTEGER,
  ADD COLUMN IF NOT EXISTS "billPrinterStatus"       TEXT NOT NULL DEFAULT 'NOT_TESTED';

-- ─── 3. Local Wi-Fi QR base URL per branch ──────────────────────────────────

ALTER TABLE "branches"
  ADD COLUMN IF NOT EXISTS "qrBaseUrl" TEXT;

-- ─── 4. Persistent Print Jobs Table ─────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "print_jobs" (
  "id"        TEXT NOT NULL,
  "branchId"  TEXT NOT NULL,
  "orderId"   TEXT,
  "kotId"     TEXT,
  "jobType"   TEXT NOT NULL,
  "target"    TEXT NOT NULL,
  "status"    TEXT NOT NULL,
  "attempts"  INTEGER NOT NULL DEFAULT 1,
  "error"     TEXT,
  "reprint"   BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "print_jobs_branchId_createdAt_idx" ON "print_jobs"("branchId", "createdAt");
CREATE INDEX IF NOT EXISTS "print_jobs_orderId_idx" ON "print_jobs"("orderId");
CREATE INDEX IF NOT EXISTS "print_jobs_kotId_idx" ON "print_jobs"("kotId");
