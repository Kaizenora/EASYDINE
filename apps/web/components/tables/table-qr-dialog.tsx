"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRotateQrToken, type RestaurantTable } from "@/hooks/use-tables";
import { useSettings } from "@/hooks/use-settings";
import { ApiError } from "@/lib/api";
import { Check, Copy, Printer, QrCode, RefreshCw } from "lucide-react";

export function TableQrDialog({
  table,
  branchId,
  open,
  onOpenChange,
}: {
  table: RestaurantTable;
  branchId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const rotate = useRotateQrToken(branchId);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [copied, setCopied] = useState(false);

  const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  const { data: settingsData } = useSettings(branchId);
  const branchQrBaseUrl = settingsData?.branch?.qrBaseUrl ?? null;
  const baseUrl =
    branchQrBaseUrl ||
    configuredBaseUrl ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const baseUrlIsConfigured = !!(branchQrBaseUrl || configuredBaseUrl);

  // Auto-generate QR token if table does not yet have one
  useEffect(() => {
    if (open && !table.qrToken && !rotate.isPending) {
      rotate.mutate(table.id, {
        onError: (err) =>
          toast.error(err instanceof ApiError ? err.message : "Could not generate QR code"),
      });
    }
  }, [open, table.id, table.qrToken]);

  const restoName = settingsData?.restaurant?.name || settingsData?.branch?.name || "";
  const tableNum = table.name || (table.number ? `Table ${table.number}` : "");
  const queryParams = [
    restoName ? `resto=${encodeURIComponent(restoName)}` : "",
    tableNum ? `table=${encodeURIComponent(tableNum)}` : "",
  ].filter(Boolean).join("&");

  const orderUrl =
    table.qrToken && baseUrl
      ? `${baseUrl}/order/${table.qrToken}${queryParams ? `?${queryParams}` : ""}`
      : null;

  const handleCopy = () => {
    if (!orderUrl) return;
    navigator.clipboard.writeText(orderUrl);
    setCopied(true);
    toast.success("Order link copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <>
      {/* Print-specific style ensuring ONLY the standee card prints full-bleed and color-accurate */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-qr-standee, #printable-qr-standee * {
            visibility: visible !important;
          }
          #printable-qr-standee {
            position: fixed !important;
            left: 50% !important;
            top: 50% !important;
            transform: translate(-50%, -50%) !important;
            width: 130mm !important;
            max-width: 92vw !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
        }
      `}</style>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="border-neutral-800 bg-[#121214] text-white sm:max-w-md max-h-[92vh] overflow-y-auto text-center p-5">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2 text-base font-bold text-white">
              <QrCode className="h-5 w-5 text-amber-400" />
              <span>{table.name ?? `Table ${table.number}`} · Luxury Standee</span>
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              Customers scan this QR card at the table to browse menu &amp; order
            </DialogDescription>
          </DialogHeader>

          {!baseUrlIsConfigured && (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-left text-xs text-amber-300">
              <strong>Setup tip:</strong> Public base URL is not configured. QR code uses{" "}
              <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11px] text-amber-200">
                {baseUrl}
              </code>
              . Set <code>NEXT_PUBLIC_BASE_URL</code> in your environment for public customer access.
            </div>
          )}

          {/* Luxury Standee Card Preview */}
          <div className="flex flex-col items-center justify-center py-2">
            {orderUrl ? (
              <div className="flex flex-col items-center gap-3">
                <div
                  id="printable-qr-standee"
                  className="relative w-[280px] sm:w-[320px] aspect-[682/1024] rounded-2xl overflow-hidden shadow-2xl border border-amber-500/30 select-none bg-[#4a2612]"
                >
                  {/* Standee background template image */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/qr-template.jpg"
                    alt="Menu QR Standee"
                    className="w-full h-full object-cover block pointer-events-none"
                  />

                  {/* Dynamic scannable QR code overlay right over the white card box */}
                  <div
                    className="absolute bg-white rounded-[14px] sm:rounded-[18px] p-[6%] flex items-center justify-center shadow-md"
                    style={{
                      left: "37.4%",
                      top: "18.0%",
                      width: "50.3%",
                      height: "32.8%",
                    }}
                  >
                    <QRCodeSVG
                      value={orderUrl}
                      level="Q"
                      className="w-full h-full"
                    />
                  </div>

                  {/* Dynamic Restaurant name line overlay */}
                  <div
                    className="absolute text-left font-sans font-bold text-[#f7e0b5] truncate text-[11px] sm:text-[13px] tracking-wide"
                    style={{
                      left: "55.6%",
                      top: "62.4%",
                      width: "36%",
                    }}
                    title={restoName || "EasyDine"}
                  >
                    {restoName || "EasyDine"}
                  </div>

                  {/* Dynamic Table No line overlay */}
                  <div
                    className="absolute text-left font-sans font-bold text-[#f7e0b5] truncate text-[12px] sm:text-[14px] tracking-wide"
                    style={{
                      left: "51.8%",
                      top: "66.8%",
                      width: "36%",
                    }}
                    title={tableNum || `Table ${table.number}`}
                  >
                    {tableNum || `Table ${table.number}`}
                  </div>
                </div>

                <div className="flex items-center gap-1.5 max-w-xs">
                  <p className="truncate font-mono text-[11px] text-neutral-400 bg-neutral-900/80 px-2.5 py-1 rounded-lg border border-neutral-800">
                    {orderUrl}
                  </p>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 shrink-0 text-neutral-300 hover:text-white"
                    onClick={handleCopy}
                    title="Copy QR URL"
                  >
                    {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-14 gap-2">
                <RefreshCw className="h-6 w-6 animate-spin text-amber-400" />
                <p className="text-xs text-neutral-400">Generating secure QR code...</p>
              </div>
            )}

            {confirmRotate ? (
              <div className="mt-3 flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-200 text-left">
                <p className="font-semibold">
                  Generate new QR code?
                </p>
                <p className="text-[11px] text-red-300/80">
                  Any existing printed card or standee for this table will stop working.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-neutral-700 bg-neutral-900 text-white"
                    onClick={() => setConfirmRotate(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 bg-red-600 text-xs font-bold text-white hover:bg-red-500"
                    disabled={rotate.isPending}
                    onClick={() => {
                      rotate.mutate(table.id, {
                        onSuccess: () => {
                          toast.success("New QR code generated");
                          setConfirmRotate(false);
                        },
                        onError: (err) =>
                          toast.error(err instanceof ApiError ? err.message : "Could not rotate QR"),
                      });
                    }}
                  >
                    Confirm &amp; Invalidate Old
                  </Button>
                </div>
              </div>
            ) : null}
          </div>

          <DialogFooter className="flex flex-row items-center justify-between gap-2 pt-2 border-t border-neutral-800">
            {orderUrl && (
              <Button
                variant="outline"
                size="sm"
                className="rounded-xl border-amber-500/40 bg-amber-500/10 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                onClick={() => window.print()}
              >
                <Printer className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
                Print Standee Card
              </Button>
            )}
            {!confirmRotate && (
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-neutral-400 hover:text-white"
                disabled={rotate.isPending}
                onClick={() => {
                  if (orderUrl) {
                    setConfirmRotate(true);
                  } else {
                    rotate.mutate(table.id, {
                      onSuccess: () => toast.success("QR code generated"),
                      onError: (err) =>
                        toast.error(err instanceof ApiError ? err.message : "Could not generate QR"),
                    });
                  }
                }}
              >
                {orderUrl ? "Re-generate" : "Generate"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
