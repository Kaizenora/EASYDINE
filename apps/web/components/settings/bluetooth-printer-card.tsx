"use client";

import { AlertCircle, Bluetooth, CheckCircle2, FileText, Info, Laptop, Printer, Sparkles, Unplug } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  chooseBtPrinter,
  isWebBluetoothSupported,
  saveBtPrinter,
  savedBtPrinter,
  type BtPrinter,
} from "@/lib/device-print";
import { isNativeApp } from "@/lib/native";
import {
  type CashierPaperSize,
  getCashierPaperSize,
  openTestReceiptPrint,
  setCashierPaperSize,
} from "@/lib/print";
import { toast } from "@/lib/toast";

const subscribeBt = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("easydine:printer", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("easydine:printer", cb);
  };
};

const subscribePaper = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("easydine:paperSize", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("easydine:paperSize", cb);
  };
};

export function BluetoothPrinterCard() {
  const [paperSize, setPaperSizeState] = useState<CashierPaperSize>("80mm");
  const [testPrintStatus, setTestPrintStatus] = useState<string | null>(null);
  const [pairingBle, setPairingBle] = useState(false);
  const [pairedDevice, setPairedDevice] = useState<BtPrinter | null>(null);

  useEffect(() => {
    setPaperSizeState(getCashierPaperSize());
    setPairedDevice(savedBtPrinter());
  }, []);

  const handleSelectPaperSize = (size: CashierPaperSize) => {
    setPaperSizeState(size);
    setCashierPaperSize(size);
    toast.info(`Paper format set to ${size}`);
  };

  const handlePrintTestBill = () => {
    setTestPrintStatus("Print dialog opened");
    try {
      openTestReceiptPrint(paperSize);
    } catch {
      setTestPrintStatus("Could not open print dialog");
    }
  };

  const handlePairBle = async () => {
    setPairingBle(true);
    try {
      const printer = await chooseBtPrinter();
      if (printer) {
        setPairedDevice(printer);
        window.dispatchEvent(new Event("easydine:printer"));
        toast.success(`Paired with ${printer.name}`);
      }
    } catch (err) {
      toast.info("Bluetooth pairing window closed or cancelled.");
    } finally {
      setPairingBle(false);
    }
  };

  const handleUnpairBle = () => {
    saveBtPrinter(null);
    setPairedDevice(null);
    window.dispatchEvent(new Event("easydine:printer"));
    toast.info("Bluetooth printer disconnected");
  };

  const isBleAvailable = isWebBluetoothSupported() || isNativeApp();

  return (
    <Card className="flex flex-col gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Printer className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Cashier Bill Printer
            </h2>
            <p className="text-xs text-muted-foreground">
              Set up and test receipt printing for customer bills on this cashier computer
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 gap-1.5 py-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500" />
          Ready for Printing
        </Badge>
      </div>

      {/* Cashier First-Time Setup Instructions */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs">
        <div className="flex items-center gap-2 font-semibold text-foreground mb-1.5">
          <Laptop className="h-4 w-4 text-primary" />
          <span>Easy Cashier Printer Setup (3 simple steps):</span>
        </div>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-1">
          <li>
            <strong className="text-foreground">Connect printer to this computer</strong> via USB cable, Wi-Fi, or system Bluetooth, and install its manufacturer driver.
          </li>
          <li>
            <strong className="text-foreground">Select your receipt paper width</strong> below (58mm, 80mm thermal, or A4).
          </li>
          <li>
            <strong className="text-foreground">Click &quot;Print test bill&quot;</strong> and select your printer from the browser print dialog.
          </li>
        </ol>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Note: In this hosted web app, bill printing uses your device&apos;s installed printer drivers via the browser print dialog. Driver support depends on your operating system (Windows/macOS/Linux).
        </p>
      </div>

      {/* Paper Size Configuration */}
      <div className="flex flex-col gap-3">
        <label className="text-sm font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-4 w-4 text-primary" />
          Receipt Paper Size
        </label>
        <p className="text-xs text-muted-foreground">
          Choose the roll width of your thermal printer. This drives the receipt layout and margins when printing.
        </p>

        <div className="grid gap-3 sm:grid-cols-3">
          {/* 80mm Thermal */}
          <button
            type="button"
            onClick={() => handleSelectPaperSize("80mm")}
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
              paperSize === "80mm"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                : "border-border bg-card/60 hover:border-border/80 hover:bg-card"
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-bold text-foreground">80mm Thermal</span>
              {paperSize === "80mm" && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-primary text-black font-semibold">
                  Active
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground mt-1">
              Standard POS receipt rolls (3.15 inch). Recommended for all restaurant bills.
            </span>
          </button>

          {/* 58mm Thermal */}
          <button
            type="button"
            onClick={() => handleSelectPaperSize("58mm")}
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
              paperSize === "58mm"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                : "border-border bg-card/60 hover:border-border/80 hover:bg-card"
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-bold text-foreground">58mm Thermal</span>
              {paperSize === "58mm" && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-primary text-black font-semibold">
                  Active
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground mt-1">
              Compact / mobile 2-inch roll printers. Compact narrow layout.
            </span>
          </button>

          {/* A4 Standard */}
          <button
            type="button"
            onClick={() => handleSelectPaperSize("A4")}
            className={`flex flex-col items-start rounded-xl border p-3.5 text-left transition-all ${
              paperSize === "A4"
                ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary"
                : "border-border bg-card/60 hover:border-border/80 hover:bg-card"
            }`}
          >
            <div className="flex w-full items-center justify-between">
              <span className="text-sm font-bold text-foreground">A4 Full Page</span>
              {paperSize === "A4" && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0 h-4 bg-primary text-black font-semibold">
                  Active
                </Badge>
              )}
            </div>
            <span className="text-[11px] text-muted-foreground mt-1">
              Standard office laser / inkjet printer for full-page invoices.
            </span>
          </button>
        </div>
      </div>

      {/* Test Bill Printing Action */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card/40 p-4">
        <div className="space-y-0.5">
          <div className="text-sm font-medium text-foreground flex items-center gap-2">
            <span>Test Bill Print</span>
            <span className="text-xs font-normal text-muted-foreground">({paperSize})</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Renders a safe synthetic sample bill through the real receipt renderer to verify alignment.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {testPrintStatus && (
            <span className="text-xs text-emerald-400 font-medium animate-in fade-in">
              {testPrintStatus}
            </span>
          )}
          <Button
            type="button"
            onClick={handlePrintTestBill}
            className="gap-2 text-xs font-bold"
          >
            <Printer className="h-4 w-4" />
            Print test bill
          </Button>
        </div>
      </div>

      {/* Direct Bluetooth Thermal Section (Opt-in) */}
      <div className="rounded-xl border border-border bg-card/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bluetooth className="h-4 w-4 text-blue-400" />
            <span className="text-sm font-semibold text-foreground">
              Direct Bluetooth Thermal (Optional BLE)
            </span>
          </div>
          {pairedDevice ? (
            <Badge variant="outline" className="border-blue-500/30 bg-blue-500/10 text-blue-400 text-[10px] gap-1">
              Paired
            </Badge>
          ) : (
            <span className="text-[11px] text-muted-foreground">Not paired</span>
          )}
        </div>

        <p className="text-xs text-muted-foreground">
          For wireless BLE thermal receipt printers paired directly via Web Bluetooth (Chrome/Edge on desktop, or the EasyDine Android app). Only pairs with genuine discoverable BLE devices.
        </p>

        {pairedDevice ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 p-2.5 text-xs">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-blue-400" />
              <div>
                <span className="font-semibold text-foreground">{pairedDevice.name}</span>
                <span className="ml-2 text-muted-foreground font-mono text-[10px]">({pairedDevice.address})</span>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleUnpairBle}
              className="gap-1.5 text-xs h-7 text-red-400 hover:text-red-300"
            >
              <Unplug className="h-3 w-3" />
              Disconnect
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pairingBle || !isBleAvailable}
              onClick={handlePairBle}
              className="gap-1.5 text-xs"
            >
              <Bluetooth className="h-3.5 w-3.5 text-blue-400" />
              {pairingBle ? "Scanning for BLE..." : "Pair BLE Printer"}
            </Button>
            {!isBleAvailable && (
              <span className="text-[11px] text-muted-foreground">
                Web Bluetooth is only supported in Chrome or Edge over HTTPS.
              </span>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
