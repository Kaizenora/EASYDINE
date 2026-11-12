"use client";

import { getActivePrintScope, prefetchKotPage, reprintKot } from "@/lib/local-print";
import { kotPageVersion } from "@/lib/printer-routing";
import { ApiError } from "@/lib/api";
import { CloudOff, Flame, Globe, Printer, RotateCcw, Star, Timer, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusNote, useNoteToast } from "@/components/ui/status-note";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContactDetailsDialog } from "@/components/contact-details-dialog";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { hasPermission, useCurrentUser } from "@/hooks/use-auth";
import {
  NEXT_STATUS,
  kotStepRank,
  useRejectKot,
  useSetKotPriority,
  useUpdateKotStatus,
  type KotTicket,
} from "@/hooks/use-kds";
import type { KotStatusDto } from "@easydine/types";
import { cn } from "@/lib/utils";
import { tableLabel } from "@easydine/types";

const STATUS_NAMES: Record<string, string> = {
  NEW: "Ordered (New)",
  ACCEPTED: "Ordered",
  PREPARING: "Preparing in Kitchen",
  READY: "Ready to Serve",
  SERVED: "Served & Delivered",
};

const STATUS_LABEL: Record<string, string> = {
  NEW: "Accept",
  ACCEPTED: "Start preparing",
  PREPARING: "Mark ready",
  READY: "Mark served",
};

const REJECT_REASONS = ["Out of stock", "Item unavailable", "Kitchen too busy", "Equipment problem"];

// A ticket this young is new enough to draw the eye (and it stops on its own).
const FRESH_MINUTES = 2;

function useElapsedMinutes(createdAt: string) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const compute = () =>
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)));
    compute();
    const id = setInterval(compute, 30_000);
    return () => clearInterval(id);
  }, [createdAt]);
  return elapsed;
}

function customerDisplayName(order: KotTicket["order"]) {
  return order.customer?.name || order.guestName || null;
}

function customerPhone(order: KotTicket["order"]) {
  return order.customer?.phone || null;
}

export function TicketCard({ ticket, branchId }: { ticket: KotTicket; branchId: string | null }) {
  const elapsed = useElapsedMinutes(ticket.createdAt);
  const updateStatus = useUpdateKotStatus(branchId);
  const setPriority = useSetKotPriority(branchId);
  // This ticket only, through the KOT routing rule (helper direct print when
  // reachable and mapped, otherwise the browser dialog). Never the server/LAN
  // printer and never the order's other tickets.
  const [printing, setPrinting] = useState(false);
  const ticketVersion = kotPageVersion(ticket.items as { id?: string; quantity?: number; status?: string }[]);
  const ticketReprint = ticket.printedCount > 0;
  // This ticket's page is loaded in the background, so the print dialog
  // opens the moment the printer icon is pressed.
  useEffect(() => {
    if (branchId) prefetchKotPage(ticket.orderId, { ...getActivePrintScope(), branchId }, ticketVersion, { kotIds: [ticket.id], reprint: ticketReprint });
  }, [branchId, ticket.orderId, ticket.id, ticketVersion, ticketReprint]);
  const printThisTicket = () => {
    if (!branchId || printing) return;
    setPrinting(true);
    void reprintKot(ticket.orderId, { ...getActivePrintScope(), branchId }, {
      kotIds: [ticket.id],
      reprint: ticketReprint,
      version: ticketVersion,
    })
      .then((e) => {
        if (e.status === "FAILED" || e.status === "UNKNOWN") toast.error(e.message);
        else if (e.status === "QUEUED") toast.success(e.message);
      })
      .finally(() => setPrinting(false));
  };
  const { note, clear: clearNote, toast } = useNoteToast();
  const nextStatus = NEXT_STATUS[ticket.status];
  const isLate = elapsed >= 15;
  const isFresh = ticket.status === "NEW" && elapsed < FRESH_MINUTES;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<KotStatusDto | null>(null);
  // Forward steps apply at once (shown immediately, confirmed by the server
  // in the background); only a step back asks first.
  const applyStatus = (target: KotStatusDto) => {
    updateStatus.mutate(
      { id: ticket.id, status: target },
      {
        onError: (err) =>
          toast.error(
            err instanceof ApiError && err.message
              ? `Ticket #${ticket.order.orderNumber}: ${err.message}`
              : `Could not update ticket #${ticket.order.orderNumber}`,
          ),
      },
    );
  };
  const requestStatus = (target: KotStatusDto) => {
    if (target === ticket.status) return;
    if (kotStepRank(target) > kotStepRank(ticket.status)) applyStatus(target);
    else setConfirmStatus(target);
  };
  const reject = useRejectKot(branchId);
  const { data: me } = useCurrentUser();
  // Rejecting before cooking starts is for anyone on the kitchen screen; food
  // already on the stove is a manager's call (the server enforces the same).
  const started = ticket.status === "PREPARING";
  const canReject =
    (ticket.status === "NEW" || ticket.status === "ACCEPTED" || started) &&
    (!started || hasPermission(me?.user, "orders.cancel"));

  return (
    <Card
      className={cn(
        "flex shrink-0 flex-col gap-3 p-4",
        (isLate || ticket.isPriority) && "border-warning/50 ring-1 ring-warning/30",
        isFresh && "border-primary ring-2 ring-primary/40 motion-safe:animate-pulse",
      )}
    >
      <StatusNote note={note} onClear={clearNote} />
      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`Reject ticket for order #${ticket.order.orderNumber}?`}
        description={
          ticket.order.table
            ? `${tableLabel(ticket.order.table.number, (ticket.order.table as any).name)} will be told the kitchen cannot make this. The ticket stays on record with your name and reason.`
            : "The guest will be told the kitchen cannot make this. The ticket stays on record with your name and reason."
        }
        warning={started ? "This ticket is already being prepared. Rejecting it means the food in progress is wasted." : undefined}
        reasons={REJECT_REASONS}
        confirmLabel="Reject ticket"
        keepLabel="Keep ticket"
        onSubmit={(reason) =>
          reject.mutateAsync({ id: ticket.id, reason, confirmStarted: started ? true : undefined })
        }
      />
      <ContactDetailsDialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        title={`Order #${ticket.order.orderNumber}`}
        name={customerDisplayName(ticket.order)}
        subtitle={ticket.order.table ? `${tableLabel(ticket.order.table.number, (ticket.order.table as any).name)}` : ticket.order.type}
        phone={customerPhone(ticket.order)}
        waMessage={`Hi ${customerDisplayName(ticket.order) ?? ""}, this is regarding your order #${ticket.order.orderNumber}.`}
      />
      <button
        type="button"
        onClick={() => setDetailsOpen(true)}
        className="flex items-center justify-between rounded-md text-left transition hover:opacity-80"
        title="View customer details"
      >
        <div>
          <p className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
            #{ticket.order.orderNumber}
            {ticket.isPriority && <Star className="h-3.5 w-3.5 fill-warning text-warning" />}
            {ticket.order.channel === "ONLINE" && (
              <Globe className="h-3.5 w-3.5 text-muted-foreground" aria-label="Online order" />
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {ticket.order.table ? `${tableLabel(ticket.order.table.number, (ticket.order.table as any).name)}` : ticket.order.type}
            {ticket.station && ` · ${ticket.station.name}`}
            {customerDisplayName(ticket.order) && ` · ${customerDisplayName(ticket.order)}`}
          </p>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium tabular-nums",
            isLate ? "bg-warning/15 text-warning" : "bg-secondary text-muted-foreground",
          )}
        >
          <Timer className="h-3 w-3" />
          {elapsed}m
        </div>
      </button>

      {ticket.savedOnPhone && (
        <p className="flex items-center gap-1.5 text-xs text-warning">
          <CloudOff className="h-3 w-3" aria-hidden /> Saved on this phone - will be sent when the connection is back
        </p>
      )}

      {/* Customer preference note is cashier-only, hidden from KDS */}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        {ticket.items.map((item) => (
          <div key={item.id} className="text-sm">
            <p className="font-medium text-foreground">
              {item.orderItem.quantity}× {item.orderItem.nameSnapshot}
            </p>
            {item.orderItem.modifiers.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {item.orderItem.modifiers.map((m) => m.nameSnapshot).join(", ")}
              </p>
            )}
            {item.orderItem.kitchenNote && (
              <p className="flex items-center gap-1 text-xs text-warning">
                <Flame className="h-3 w-3" /> {item.orderItem.kitchenNote}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-2.5">
        {/* Status Pipeline: 1. Ordered -> 2. Preparing -> 3. Ready */}
        <div className="flex items-center justify-between rounded-xl border border-border/80 bg-muted/40 p-1 text-xs font-medium">
          <button
            type="button"
            disabled={updateStatus.isPending}
            onClick={() => {
              if (ticket.status !== "NEW" && ticket.status !== "ACCEPTED") {
                requestStatus("ACCEPTED");
              }
            }}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition-all cursor-pointer",
              ticket.status === "NEW" || ticket.status === "ACCEPTED"
                ? "bg-primary text-primary-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
            title="Click to revert to 1. Ordered"
          >
            1. Ordered
          </button>
          <span className="px-1 text-muted-foreground/40 font-bold">→</span>
          <button
            type="button"
            disabled={updateStatus.isPending}
            onClick={() => {
              if (ticket.status !== "PREPARING") {
                requestStatus("PREPARING");
              }
            }}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition-all cursor-pointer",
              ticket.status === "PREPARING"
                ? "bg-primary text-primary-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
            title="Click to set to 2. Preparing"
          >
            2. Preparing
          </button>
          <span className="px-1 text-muted-foreground/40 font-bold">→</span>
          <button
            type="button"
            disabled={updateStatus.isPending}
            onClick={() => {
              if (ticket.status !== "READY") {
                requestStatus("READY");
              }
            }}
            className={cn(
              "flex-1 rounded-lg py-1.5 text-center text-xs font-semibold transition-all cursor-pointer",
              ticket.status === "READY"
                ? "bg-primary text-primary-foreground shadow-sm font-bold"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
            title="Click to set to 3. Ready"
          >
            3. Ready
          </button>
        </div>

        {/* Action Button Row with Reversible Step-Back option */}
        <div className="flex gap-2">
          {ticket.status === "PREPARING" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={updateStatus.isPending}
              onClick={() => requestStatus("ACCEPTED")}
              className="h-10 px-3 text-xs gap-1 font-medium text-muted-foreground hover:text-foreground"
              title="Move back to Ordered"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Back
            </Button>
          )}

          {ticket.status === "READY" && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={updateStatus.isPending}
              onClick={() => requestStatus("PREPARING")}
              className="h-10 px-3 text-xs gap-1 font-medium text-muted-foreground hover:text-foreground"
              title="Move back to Preparing"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Back to Prep
            </Button>
          )}

          {ticket.status !== "READY" ? (
            <Button
              className="h-10 flex-1 text-sm font-semibold"
              disabled={updateStatus.isPending}
              onClick={() => {
                const target = (ticket.status === "NEW" || ticket.status === "ACCEPTED") ? "PREPARING" : "READY";
                requestStatus(target);
              }}
            >
              {(ticket.status === "NEW" || ticket.status === "ACCEPTED")
                  ? "Start Preparing →"
                  : "Mark Ready to Serve →"}
            </Button>
          ) : (
            <Button
              className="h-10 flex-1 bg-emerald-600 text-white hover:bg-emerald-700 text-sm font-semibold"
              disabled={updateStatus.isPending}
              onClick={() => requestStatus("SERVED")}
            >
              ✓ Served & Delivered
            </Button>
          )}
        </div>

        {/* Status Change Confirmation Dialog */}
        <Dialog open={confirmStatus !== null} onOpenChange={(open) => !open && setConfirmStatus(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm Kitchen Status Change</DialogTitle>
            </DialogHeader>
            <div className="py-3 text-sm text-muted-foreground">
              Are you sure you want to move Ticket <strong className="text-foreground">#{ticket.order.orderNumber}</strong> to{" "}
              <strong className="text-primary">{confirmStatus ? (STATUS_NAMES[confirmStatus] || confirmStatus) : ""}</strong>?
            </div>
            <DialogFooter className="flex gap-2 sm:justify-end">
              <Button variant="outline" onClick={() => setConfirmStatus(null)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (confirmStatus) {
                    // Closed at once; the board already shows the new step.
                    applyStatus(confirmStatus);
                    setConfirmStatus(null);
                  }
                }}
              >
                Confirm Change
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="flex items-center gap-2">
        {canReject && (
          <Button
            variant="destructive"
            className="h-9 min-w-0 flex-1 px-3 text-xs"
            onClick={() => setRejectOpen(true)}
            aria-label={`Reject ticket for order ${ticket.order.orderNumber}`}
          >
            <X className="h-4 w-4" aria-hidden />
            Reject
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title={ticket.isPriority ? "Unmark priority" : "Mark priority"}
          aria-label={ticket.isPriority ? "Unmark priority" : "Mark priority"}
          disabled={setPriority.isPending}
          onClick={() =>
            setPriority.mutate({ id: ticket.id, isPriority: !ticket.isPriority })
          }
        >
          <Star className={cn("h-4 w-4", ticket.isPriority && "fill-warning text-warning")} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 shrink-0"
          title={ticket.printedCount > 0 ? "Reprint ticket (marked REPRINT)" : "Print ticket"}
          aria-label={ticket.printedCount > 0 ? "Reprint ticket" : "Print ticket"}
          disabled={printing}
          onClick={printThisTicket}
        >
          <Printer className="h-4 w-4" />
        </Button>
        </div>
      </div>
    </Card>
  );
}
