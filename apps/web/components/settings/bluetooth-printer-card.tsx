"use client";

import { Bluetooth, CheckCircle2, ChefHat, Printer, RefreshCw, Smartphone, Sparkles, Unplug } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBranch } from "@/hooks/use-branch";
import { useOpenCashDrawer, usePrintTestSlip } from "@/hooks/use-print";
import { canPrintOnDevice, chooseBtPrinter, saveBtPrinter, savedBtPrinter } from "@/lib/device-print";
import { toast } from "@/lib/toast";

const subscribe = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener("easydine:printer", cb);
  return () => {
    window.removeEventListener("storage", cb);
    window.removeEventListener("easydine:printer", cb);
  };
};
const read = () => window.localStorage.getItem("easydine.btPrinter") ?? "";

export function BluetoothPrinterCard() {
  const raw = useSyncExternalStore(subscribe, read, () => "");
  const { branchId } = useBranch();
  const testReceipt = usePrintTestSlip(branchId);
  const testKot = usePrintTestSlip(branchId, "kot");
  const openDrawer = useOpenCashDrawer();

  const [cashierPrinterName, setCashierPrinterName] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("easydine.cashierPrinterName") || "POS-80 Bluetooth Thermal";
    }
    return "POS-80 Bluetooth Thermal";
  });

  const [kitchenPrinterName, setKitchenPrinterName] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("easydine.kitchenPrinterName") || "Kitchen KOT 80mm ESC/POS";
    }
    return "Kitchen KOT 80mm ESC/POS";
  });

  const [note, setNote] = useState<string | null>(null);
  const [pairingCashier, setPairingCashier] = useState(false);
  const [pairingKitchen, setPairingKitchen] = useState(false);

  const native = canPrintOnDevice();
  const savedPrinter = raw ? savedBtPrinter() : null;

  const savePrinters = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("easydine.cashierPrinterName", cashierPrinterName);
      window.localStorage.setItem("easydine.kitchenPrinterName", kitchenPrinterName);
      saveBtPrinter({ name: cashierPrinterName, address: "00:11:22:33:44:55" });
      window.dispatchEvent(new Event("easydine:printer"));
      toast.success("Printer configuration saved");
    }
  };

  const handlePairWebBluetooth = async (target: "cashier" | "kitchen") => {
    if (native) {
      const p = await chooseBtPrinter();
      if (p) {
        if (target === "cashier") setCashierPrinterName(p.name);
        else setKitchenPrinterName(p.name);
        window.dispatchEvent(new Event("easydine:printer"));
        toast.success(`Paired ${p.name}`);
      }
      return;
    }

    if (typeof navigator !== "undefined" && "bluetooth" in navigator) {
      try {
        if (target === "cashier") setPairingCashier(true);
        else setPairingKitchen(true);

        const nav = navigator as unknown as { bluetooth: { requestDevice: (opt: any) => Promise<{ name?: string }> } };
        const device = await nav.bluetooth.requestDevice({
          acceptAllDevices: true,
          optionalServices: ["000018f0-0000-1000-8000-00805f9b34fb"],
        });

        const name = device.name || (target === "cashier" ? "Bluetooth POS Thermal" : "Bluetooth Kitchen KOT");
        if (target === "cashier") {
          setCashierPrinterName(name);
        } else {
          setKitchenPrinterName(name);
        }
        toast.success(`Connected to ${name}`);
      } catch (err) {
        // User cancelled or bluetooth not available
        toast.info("Bluetooth pairing window closed or cancelled.");
      } finally {
        setPairingCashier(false);
        setPairingKitchen(false);
      }
    } else {
      toast.info("Web Bluetooth requires Chrome/Edge with Bluetooth enabled. You can also specify the printer profile name directly below.");
    }
  };

  return (
    <Card className="flex flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bluetooth className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              Thermal & Bluetooth Printers
            </h2>
            <p className="text-xs text-muted-foreground">
              Connect 58mm / 80mm ESC-POS wireless and Bluetooth thermal printers for Cashier & Kitchen
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 gap-1.5 py-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          ESC/POS Engine Ready
        </Badge>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Cashier Printer Card */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Printer className="h-4 w-4 text-primary" />
              <span className="text-sm font-semibold text-foreground">Cashier Bill Printer</span>
            </div>
            <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Counter POS
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Prints customer bills, payment slips, and triggers automatic cash drawer kick.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="cashier-pr-name" className="text-xs text-muted-foreground">
              Printer Device Name / Model
            </Label>
            <Input
              id="cashier-pr-name"
              value={cashierPrinterName}
              onChange={(e) => setCashierPrinterName(e.target.value)}
              placeholder="e.g. POS-80 Bluetooth / RP326"
              className="h-9 text-xs"
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pairingCashier}
              onClick={() => handlePairWebBluetooth("cashier")}
              className="gap-1.5 text-xs"
            >
              <Bluetooth className="h-3.5 w-3.5 text-blue-500" />
              {pairingCashier ? "Scanning..." : "Pair Bluetooth"}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={testReceipt.isPending}
              onClick={() =>
                testReceipt.mutate(undefined, {
                  onSuccess: () => toast.success("Test bill slip printed on Cashier printer!"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Print test failed"),
                })
              }
              className="gap-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              {testReceipt.isPending ? "Printing..." : "Test Bill Print"}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={openDrawer.isPending}
              onClick={() =>
                openDrawer.mutate(branchId, {
                  onSuccess: () => toast.success("Cash drawer kick pulse sent!"),
                  onError: () => toast.error("Cash drawer pulse error"),
                })
              }
              className="text-xs"
            >
              Kick Drawer
            </Button>
          </div>
        </div>

        {/* Kitchen KOT Printer Card */}
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card/60 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ChefHat className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-semibold text-foreground">Kitchen (KOT) Printer</span>
            </div>
            <span className="rounded bg-secondary px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
              Chef Station
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Instantly cuts tickets in kitchen when orders are confirmed from Cashier or Table QR.
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="kitchen-pr-name" className="text-xs text-muted-foreground">
              Kitchen Printer Device Name
            </Label>
            <Input
              id="kitchen-pr-name"
              value={kitchenPrinterName}
              onChange={(e) => setKitchenPrinterName(e.target.value)}
              placeholder="e.g. Kitchen KOT 80mm ESC/POS"
              className="h-9 text-xs"
            />
          </div>

          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={pairingKitchen}
              onClick={() => handlePairWebBluetooth("kitchen")}
              className="gap-1.5 text-xs"
            >
              <Bluetooth className="h-3.5 w-3.5 text-blue-500" />
              {pairingKitchen ? "Scanning..." : "Pair Bluetooth"}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={testKot.isPending}
              onClick={() =>
                testKot.mutate(undefined, {
                  onSuccess: () => toast.success("Test KOT ticket printed to Kitchen!"),
                  onError: (e) => toast.error(e instanceof Error ? e.message : "Kitchen print failed"),
                })
              }
              className="gap-1.5 text-xs"
            >
              <ChefHat className="h-3.5 w-3.5 text-amber-500" />
              {testKot.isPending ? "Printing..." : "Test KOT Ticket"}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          Works with all standard 58mm / 80mm ESC-POS Bluetooth and USB thermal receipt printers (TVS, Epson, Xprinter, NGX, Everycom).
        </p>
        <Button size="sm" onClick={savePrinters} className="gap-1.5 text-xs font-semibold">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Save Printer Settings
        </Button>
      </div>
    </Card>
  );
}
