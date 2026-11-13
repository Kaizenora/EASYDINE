"use client";

import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { QueuedOrder } from "@/lib/order-queue";
import { formatCurrency } from "@/lib/format";

/**
 * New orders this device saved while the connection was down or uncertain.
 * Honest states: Pending locally (not confirmed by the server), Syncing,
 * Confirmed #number, Needs attention (with the reason). Never shows "sent"
 * for something the server has not confirmed.
 */
export function PendingOrdersBar({
  entries,
  onRetry,
  onDiscard,
  onDismiss,
}: {
  entries: QueuedOrder[];
  onRetry: () => void;
  onDiscard: (requestId: string) => Promise<"discarded" | "already-saved" | "offline">;
  onDismiss: (requestId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  if (entries.length === 0) return null;
  const waiting = entries.filter((e) => e.status !== "confirmed").length;

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold text-foreground">
          <CloudOff className="h-4 w-4 text-amber-500" aria-hidden />
          {waiting > 0 ? `${waiting} order${waiting === 1 ? "" : "s"} saved on this device, not yet confirmed` : "Orders confirmed"}
        </p>
        {waiting > 0 && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={onRetry}>
            <RefreshCw className="h-3 w-3" /> Send now
          </Button>
        )}
      </div>
      <ul className="flex flex-col gap-1.5">
        {entries.map((e) => (
          <li key={e.requestId} className="flex items-start justify-between gap-2 rounded-lg bg-background/60 px-2.5 py-1.5">
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground">
                {e.label} · {formatCurrency(e.localTotal)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {e.status === "pending" && "Pending locally: it will be sent automatically (same order, no duplicate)."}
                {e.status === "syncing" && (
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-3 w-3 animate-spin" /> Syncing…
                  </span>
                )}
                {e.status === "confirmed" && (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="h-3 w-3" /> Confirmed{e.orderNumber ? ` · Order #${e.orderNumber}` : ""}
                    {e.serverTotal !== undefined && Math.abs(e.serverTotal - e.localTotal) > 0.009
                      ? ` · price now ${formatCurrency(e.serverTotal)}`
                      : ""}
                    {!e.kotPrinted ? " · KOT not printed yet: use Reprint KOT" : ""}
                  </span>
                )}
                {e.status === "needs-attention" && (
                  <span className="inline-flex items-center gap-1 text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Needs attention: {e.lastError || "the server refused this order."}
                  </span>
                )}
              </p>
            </div>
            {e.status === "confirmed" ? (
              <button type="button" aria-label="Hide" className="text-muted-foreground hover:text-foreground" onClick={() => onDismiss(e.requestId)}>
                <X className="h-3.5 w-3.5" />
              </button>
            ) : e.status !== "syncing" ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-[11px] text-muted-foreground"
                disabled={busy === e.requestId}
                onClick={async () => {
                  setBusy(e.requestId);
                  const r = await onDiscard(e.requestId);
                  setBusy(null);
                  setNote(
                    r === "already-saved"
                      ? "That order was already saved on the server, so it was kept."
                      : r === "offline"
                        ? "Can't check with the server while offline, so the order was kept (it may already be saved)."
                        : null,
                  );
                }}
              >
                Discard
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {note && <p className="text-[11px] text-muted-foreground">{note}</p>}
    </div>
  );
}
