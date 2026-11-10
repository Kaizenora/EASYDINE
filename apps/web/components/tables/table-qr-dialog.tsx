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
import { Printer, QrCode, RefreshCw } from "lucide-react";

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

  const orderUrl =
    table.qrToken && baseUrl ? `${baseUrl}/order/${table.qrToken}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-neutral-800 bg-[#141416] text-white sm:max-w-sm text-center">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-base font-bold text-white">
            <QrCode className="h-5 w-5 text-amber-400" />
            <span>{table.name ?? `Table ${table.number}`} · QR Code</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-neutral-400">
            Customers scan this QR on their mobile phone to view menu &amp; order
          </DialogDescription>
        </DialogHeader>

        {!baseUrlIsConfigured && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-left text-xs text-amber-300">
            <strong>Setup tip:</strong> Public base URL is not configured. QR codes are using{" "}
            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11px] text-amber-200">
              {baseUrl}
            </code>
            . Customers on another network may not reach this address. Set{" "}
            <code className="rounded bg-black/40 px-1 py-0.5 font-mono text-[11px] text-amber-200">
              NEXT_PUBLIC_BASE_URL
            </code>{" "}
            in your <code>.env</code> for public access.
          </div>
        )}

        <div className="flex flex-col items-center justify-center gap-3 py-2">
          {orderUrl ? (
            <>
              <div className="rounded-2xl border-4 border-amber-500/30 bg-white p-4 shadow-xl">
                <QRCodeSVG value={orderUrl} size={190} level="M" />
              </div>
              <p className="max-w-xs break-all text-center font-mono text-[11px] text-neutral-400">
                {orderUrl}
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <RefreshCw className="h-6 w-6 animate-spin text-amber-400" />
              <p className="text-xs text-neutral-400">Generating secure QR code...</p>
            </div>
          )}

          {confirmRotate ? (
            <div className="flex flex-col gap-2 rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-xs text-red-200">
              <p className="font-semibold">
                Generate new QR code?
              </p>
              <p className="text-[11px] text-red-300/80">
                Any existing printed card or sticker for this table will stop working.
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

        <DialogFooter className="gap-2 sm:gap-0">
          {orderUrl && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl border-neutral-700 bg-neutral-900 text-xs text-white hover:bg-neutral-800"
              onClick={() => window.print()}
            >
              <Printer className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
              Print QR Card
            </Button>
          )}
          {!confirmRotate && (
            <Button
              variant={orderUrl ? "ghost" : "default"}
              size="sm"
              className={
                orderUrl
                  ? "text-xs text-neutral-400 hover:text-white"
                  : "rounded-xl bg-amber-500 text-xs font-bold text-black hover:bg-amber-400"
              }
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
              {orderUrl ? "Re-generate code" : "Generate QR code"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
