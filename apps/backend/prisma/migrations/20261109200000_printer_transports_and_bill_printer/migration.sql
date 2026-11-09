-- Migration: printer_transports_and_bill_printer
-- Drafted 2026-11-09. NOT YET RUN. Run only with explicit approval.
--
-- Changes:
--   1. Add Windows Spooler and COM Port fields to the KOT (kitchen) printer
--      config that already exists on branches.
--   2. Add a separate bill printer config block (for receipt/bill printing,
--      separate from the KOT kitchen printer).
--
-- All new columns are nullable with defaults so existing rows need no data
-- migration and existing installs continue to work without change.

-- ─── 1. KOT / Kitchen printer: Windows Spooler + COM Port fields ───────────

ALTER TABLE "branches"
  -- Windows Spooler: exact name as it appears in Windows Devices & Printers.
  -- When printerConnection = 'WINDOWS_SPOOLER' this is used instead of
  -- printerHost (printerHost is kept as a secondary fallback for the spooler
  -- name so old UI code that only knows printerHost still works).
  ADD COLUMN "printerName"     TEXT,

  -- COM Port path: "COM3" on Windows, "/dev/ttyS0" on Linux.
  -- Used when printerConnection = 'COM_PORT'.
  ADD COLUMN "printerComPort"  TEXT,

  -- Baud rate for COM port (most thermal printers: 9600).
  ADD COLUMN "printerBaudRate" INTEGER;

-- ─── 2. Bill / Receipt printer (separate from KOT kitchen printer) ──────────
--
-- A restaurant may have one printer for kitchen tickets (KOT) and a second
-- one at the cashier for receipts/bills.  If billPrinterConnection is NULL
-- the system falls back to the KOT printer for bills too.

ALTER TABLE "branches"
  ADD COLUMN "billPrinterConnection"  TEXT,
  ADD COLUMN "billPrinterHost"        TEXT,
  ADD COLUMN "billPrinterPort"        INTEGER NOT NULL DEFAULT 9100,
  ADD COLUMN "billPrinterName"        TEXT,
  ADD COLUMN "billPrinterComPort"     TEXT,
  ADD COLUMN "billPrinterBaudRate"    INTEGER,
  ADD COLUMN "billPrinterPaperWidthMm" INTEGER NOT NULL DEFAULT 80,
  ADD COLUMN "billPrinterCodepage"    TEXT NOT NULL DEFAULT 'CP858',
  ADD COLUMN "billPrinterColumns"     INTEGER;
