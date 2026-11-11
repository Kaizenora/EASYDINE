"use client";

import { Bluetooth, CheckCircle2, ChefHat, Printer } from "lucide-react";
import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useBranch } from "@/hooks/use-branch";
import { useOpenCashDrawer, usePrintTestBill, usePrintTestSlip } from "@/hooks/use-print";
import {
  canPrintOnDevice,
  chooseBtPrinter,
  saveBtPrinter,
  savedBtPrinter,
  type BtPrinter,
} from "@/lib/device-print";
import {
  getReceiptPrintLayout,
  isReceiptPrintLayout,
  saveReceiptPrintLayout,
  type ReceiptPrintLayout,
} from "@/lib/receipt-print-layout";
import { toast } from "@/lib/toast";

export function BluetoothPrinterCard() {
  const { branchId } = useBranch();
  const testBill = usePrintTestBill();
  const testKot = usePrintTestSlip(branchId, "kot");
  const openDrawer = useOpenCashDrawer();
  const testBillPending = useRef(false);

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

  const [pairingCashier, setPairingCashier] = useState(false);
  const [pairingKitchen, setPairingKitchen] = useState(false);
  const [pairedPrinter, setPairedPrinter] = useState<BtPrinter | null>(savedBtPrinter);
  const [confirmAction, setConfirmAction] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);
  const [receiptLayout, setReceiptLayout] = useState<ReceiptPrintLayout>(getReceiptPrintLayout);

  const native = canPrintOnDevice();

  const savePrinters = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("easydine.cashierPrinterName", cashierPrinterName);
      window.localStorage.setItem("easydine.kitchenPrinterName", kitchenPrinterName);
      if (native && pairedPrinter) saveBtPrinter(pairedPrinter);
      window.dispatchEvent(new Event("easydine:printer"));
      toast.success("Printer configuration saved");
    }
  };

  const handlePairAndroidPrinter = async (target: "cashier" | "kitchen") => {
    if (!native) return;
    if (target === "cashier") setPairingCashier(true);
    else setPairingKitchen(true);
    try {
      const p = await chooseBtPrinter();
      if (p) {
        setPairedPrinter(p);
        if (target === "cashier") setCashierPrinterName(p.name);
        else setKitchenPrinterName(p.name);
        window.dispatchEvent(new Event("easydine:printer"));
        toast.success(`Paired ${p.name}`);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not pair the Bluetooth printer.");
    } finally {
      setPairingCashier(false);
      setPairingKitchen(false);
    }
  };

  const changeReceiptLayout = (value: string) => {
    if (!isReceiptPrintLayout(value)) return;
    try {
      saveReceiptPrintLayout(value);
      setReceiptLayout(value);
    } catch {
      toast.error("Could not save the receipt paper layout on this device.");
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
              Pair Bluetooth printers in the Android app. Desktop bills use the OS print dialog and installed printer drivers.
            </p>
          </div>
        </div>
        <Badge variant="outline" className="border-emerald-500/30 bg-emerald-500/10 text-emerald-400 gap-1.5 py-1">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          {native ? "Native printer ready" : "OS print dialog"}
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
            Opens customer bills in the print dialog. Cash drawer behavior depends on the selected printer path.
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
            {native ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pairingCashier}
                onClick={() => void handlePairAndroidPrinter("cashier")}
                className="gap-1.5 text-xs"
              >
                <Bluetooth className="h-3.5 w-3.5 text-blue-500" />
                {pairingCashier ? "Scanning..." : "Pair Bluetooth"}
              </Button>
            ) : (
              <p className="w-full text-xs text-muted-foreground">
                Bluetooth pairing is available only in the Android app. Choose a Windows-installed printer in the print dialog.
              </p>
            )}

            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={testBill.isPending}
              onClick={() =>
                setConfirmAction({
                  title: "Confirm Test Bill Print",
                  message: "Open a synthetic test bill in the print dialog? No order or payment will be created.",
                  onConfirm: () => {
                    if (testBillPending.current) return;
                    testBillPending.current = true;
                    testBill.mutate(undefined, {
                      onSuccess: () => toast.success("Print dialog opened"),
                      onError: (e) => toast.error(e instanceof Error ? e.message : "Print test failed"),
                      onSettled: () => {
                        testBillPending.current = false;
                      },
                    });
                  },
                })
              }
              className="gap-1.5 text-xs"
            >
              <Printer className="h-3.5 w-3.5" />
              {testBill.isPending ? "Opening..." : "Test Bill Print"}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={openDrawer.isPending}
              onClick={() =>
                setConfirmAction({
                  title: "Confirm Open Cash Drawer",
                  message: "Trigger cash drawer kick pulse on the connected receipt printer?",
                  onConfirm: () =>
                    openDrawer.mutate(branchId, {
                      onSuccess: () => toast.success("Cash drawer kick pulse sent!"),
                      onError: () => toast.error("Cash drawer pulse error"),
                    }),
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
            {native ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={pairingKitchen}
                onClick={() => void handlePairAndroidPrinter("kitchen")}
                className="gap-1.5 text-xs"
              >
                <Bluetooth className="h-3.5 w-3.5 text-blue-500" />
                {pairingKitchen ? "Scanning..." : "Pair Bluetooth"}
              </Button>
            ) : (
              <p className="w-full text-xs text-muted-foreground">
                Bluetooth pairing is available only in the Android app.
              </p>
            )}

            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={testKot.isPending}
              onClick={() =>
                setConfirmAction({
                  title: "Confirm Kitchen KOT Test Print",
                  message: `Send a sample kitchen order ticket to ${kitchenPrinterName}?`,
                  onConfirm: () =>
                    testKot.mutate(undefined, {
                      onSuccess: () => toast.success("Test KOT ticket printed to Kitchen!"),
                      onError: (e) => toast.error(e instanceof Error ? e.message : "Kitchen print failed"),
                    }),
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

      <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Label htmlFor="receipt-print-layout">Bill paper layout (this device)</Label>
          <p className="text-xs text-muted-foreground">
            Uses the OS print dialog and compatible installed printer drivers; model support varies.
          </p>
        </div>
        <select
          id="receipt-print-layout"
          className="h-9 rounded-lg border border-border bg-background px-2 text-sm"
          value={receiptLayout}
          onChange={(event) => changeReceiptLayout(event.target.value)}
        >
          <option value="58mm">58 mm thermal</option>
          <option value="80mm">80 mm thermal</option>
          <option value="A4">A4</option>
        </select>
      </div>

      <div className="flex items-center justify-between border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          Desktop printing supports compatible Windows-installed USB, LAN, or Bluetooth-driver printers. Verify compatibility with the printer model and driver.
        </p>
        <Button size="sm" onClick={savePrinters} className="gap-1.5 text-xs font-semibold">
          <CheckCircle2 className="h-3.5 w-3.5" />
          Save Printer Settings
        </Button>
      </div>

      {/* Confirmation Dialog for Printer Operations */}
      <Dialog open={confirmAction !== null} onOpenChange={(open) => !open && setConfirmAction(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{confirmAction?.title}</DialogTitle>
          </DialogHeader>
          <p className="py-2 text-sm text-muted-foreground">
            {confirmAction?.message}
          </p>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" size="sm" onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={testBill.isPending}
              onClick={() => {
                confirmAction?.onConfirm();
                setConfirmAction(null);
              }}
            >
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
