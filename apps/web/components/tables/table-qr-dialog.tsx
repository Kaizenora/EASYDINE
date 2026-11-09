"use client";

import { QRCodeSVG } from "qrcode.react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useRotateQrToken, type RestaurantTable } from "@/hooks/use-tables";
import { useSettings } from "@/hooks/use-settings";
import { ApiError } from "@/lib/api";

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

    const configuredBaseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "";
  // H2: Prefer per-branch saved QR base URL (from Branch Settings) over env var
  // This allows different branches to use different LAN IPs without env changes
  const { data: settingsData } = useSettings(branchId);
  const branchQrBaseUrl = settingsData?.branch?.qrBaseUrl ?? null;
  const baseUrl =
    branchQrBaseUrl ||
    configuredBaseUrl ||
    (typeof window !== "undefined" ? window.location.origin : "");
  const baseUrlIsConfigured = !!(branchQrBaseUrl || configuredBaseUrl);

  const orderUrl =
    table.qrToken && baseUrl
      ? `${baseUrl}/order/${table.qrToken}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{table.name ?? `Table ${table.number}`} · QR code</DialogTitle>
        </DialogHeader>

        {!baseUrlIsConfigured && (
          <div className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
            <strong>Setup tip:</strong> Public base URL is not configured.
            QR codes are using <code className="font-mono">{baseUrl}</code> (your browser&apos;s address).
            Customers on a different network may not be able to scan this QR.
            Set <code className="font-mono">PUBLIC_BASE_URL</code> in your <code>.env</code> to fix this.
          </div>
        )}
        <div className="flex flex-col items-center gap-4 py-2">
          {orderUrl ? (
            <>
              <div className="rounded-2xl border border-border bg-white p-4">
                <QRCodeSVG value={orderUrl} size={200} />
              </div>
              <p className="max-w-xs text-center text-xs text-muted-foreground break-all">
                {orderUrl}
              </p>
            </>
          ) : (
            <p className="py-8 text-sm text-muted-foreground">
              No QR code yet · generate one below.
            </p>
          )}

          <div className="flex gap-2">
            {orderUrl && (
              <Button variant="outline" onClick={() => window.print()}>
                Print
              </Button>
            )}
            <Button
              variant={orderUrl ? "outline" : "default"}
              disabled={rotate.isPending}
              onClick={() =>
                rotate.mutate(table.id, {
                  onError: (err) =>
                    toast.error(err instanceof ApiError ? err.message : "Could not generate QR code"),
                })
              }
            >
              {orderUrl ? "Generate new code" : "Generate QR code"}
            </Button>
          </div>
          {orderUrl && (
            <p className="text-center text-xs text-muted-foreground">
              Generating a new code invalidates this one · reprint any table tents using it.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
