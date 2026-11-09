"use client";

import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Flame,
  Leaf,
  PenTool,
  Printer,
  Receipt,
  Search,
  Sparkles,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";
import { playSuccessChime, vibrateSuccess } from "@/lib/celebrate";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { ManagedOrder } from "@/hooks/use-orders";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { formatOrderNumber } from "@/lib/format";
import { tableLabel } from "@easydine/types";

interface MasterDetailOrdersProps {
  branchId: string | null;
  orders: ManagedOrder[];
  isLoading: boolean;
  onRefresh?: () => void;
}

export function MasterDetailOrders({
  branchId,
  orders,
  isLoading,
  onRefresh,
}: MasterDetailOrdersProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Tab: Incoming Queue vs Active vs History
  const [activeTab, setActiveTab] = useState<"QUEUE" | "IN_PROGRESS" | "HISTORY">("QUEUE");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);

  // Filter list by tab
  const queueOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status === "OPEN" &&
        (o.acceptance === "PENDING" || !o.acceptance || (o.acceptance as string) === "NEW")
    );
  }, [orders]);

  const inProgressOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status === "OPEN" &&
        o.acceptance !== "PENDING" &&
        (o.acceptance as string) !== "NEW" &&
        o.acceptance !== "REJECTED"
    );
  }, [orders]);

  const historyOrders = useMemo(() => {
    return orders.filter(
      (o) =>
        o.status === "COMPLETED" ||
        o.status === "BILLED" ||
        o.status === "CANCELLED" ||
        o.acceptance === "REJECTED"
    );
  }, [orders]);

  const currentList =
    activeTab === "QUEUE"
      ? queueOrders
      : activeTab === "IN_PROGRESS"
      ? inProgressOrders
      : historyOrders;

  // Selected order in the master-detail
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

  const selectedOrder = useMemo(() => {
    if (selectedOrderId) {
      const found = orders.find((o) => o.id === selectedOrderId || o.orderNumber === selectedOrderId);
      if (found) return found;
    }
    return currentList[0] || orders[0] || null;
  }, [selectedOrderId, orders, currentList]);

  // Mutations for Accept & Reject
  const acceptOrder = useMutation({
    mutationFn: (id: string) =>
      api.post<{ printStatus?: "NO_PRINTER" | "PRINTED" | "FAILED"; printError?: string }>(`/orders/${id}/accept`),
    onSuccess: (data) => {
      vibrateSuccess();
      playSuccessChime();
      queryClient.invalidateQueries({ queryKey: ["managed-orders"] });
      queryClient.invalidateQueries({ queryKey: ["floors"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (data?.printStatus === "PRINTED") {
        toast.success("Order accepted · KOT printed");
      } else if (data?.printStatus === "FAILED") {
        toast.warning(`Order accepted · Printer offline (${data.printError || "KOT visible on kitchen display"})`);
      } else {
        toast.success("Order accepted · KOT sent to kitchen display");
      }
      if (onRefresh) onRefresh();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not accept order");
    },
  });

  const rejectOrder = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      api.post(`/orders/${id}/reject`, { reason }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["managed-orders"] });
      queryClient.invalidateQueries({ queryKey: ["floors"] });
      toast.info("Order rejected");
      if (onRefresh) onRefresh();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not reject order");
    },
  });

  return (
    <div className="flex flex-col gap-4">
      {/* Top Bar: Title & Status */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-white">Incoming orders</h1>
          <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/30">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live · Today
          </span>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-1.5 rounded-xl border border-neutral-800 bg-neutral-900/60 p-1">
          <button
            type="button"
            onClick={() => setActiveTab("QUEUE")}
            className={cn(
              "rounded-lg px-3 py-1 text-xs font-semibold transition-all",
              activeTab === "QUEUE"
                ? "bg-amber-500 text-black shadow-sm"
                : "text-neutral-400 hover:text-white"
            )}
          >
            Queue ({queueOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("IN_PROGRESS")}
            className={cn(
              "rounded-lg px-3 py-1 text-xs font-semibold transition-all",
              activeTab === "IN_PROGRESS"
                ? "bg-amber-500 text-black shadow-sm"
                : "text-neutral-400 hover:text-white"
            )}
          >
            In progress ({inProgressOrders.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("HISTORY")}
            className={cn(
              "rounded-lg px-3 py-1 text-xs font-semibold transition-all",
              activeTab === "HISTORY"
                ? "bg-amber-500 text-black shadow-sm"
                : "text-neutral-400 hover:text-white"
            )}
          >
            History ({historyOrders.length})
          </button>
        </div>
      </div>

      {/* Master-Detail Split Pane */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_1fr]">
        {/* Left Column: Order Queue List */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1 text-xs font-bold uppercase tracking-wider text-neutral-400">
            <span>
              {activeTab === "QUEUE"
                ? `QUEUE · ${queueOrders.length} NEW`
                : activeTab === "IN_PROGRESS"
                ? `IN PROGRESS · ${inProgressOrders.length}`
                : `HISTORY · ${historyOrders.length}`}
            </span>
          </div>

          <div className="flex flex-col gap-3">
            {currentList.length === 0 ? (
              <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-neutral-800 bg-[#121214] py-16 text-center">
                <UtensilsCrossed className="h-8 w-8 text-neutral-600 mb-2" />
                <p className="text-sm font-semibold text-neutral-300">No orders in this view</p>
                <p className="text-xs text-neutral-500">New orders from phone QR will appear here instantly.</p>
              </div>
            ) : (
              currentList.map((order) => {
                const isSelected = selectedOrder?.id === order.id;
                const itemsCount = Array.isArray(order.items) ? order.items.length : 0;
                const tableName = tableLabel(order.table?.number, order.table?.name);
                const guestName = order.guestName || order.customer?.name || "Walk-in";
                const guestPhone = order.deliveryPhone || order.customer?.phone;
                const isPending = order.acceptance === "PENDING" || !order.acceptance || (order.acceptance as string) === "NEW";
                const isKotPrinted = order.acceptance === "ACCEPTED";
                const hasItemNotes = (order.items || []).some((it: any) => it.kitchenNote || it.instructions);

                return (
                  <div
                    key={order.id}
                    onClick={() => setSelectedOrderId(order.id)}
                    className={cn(
                      "group relative flex cursor-pointer flex-col gap-2 rounded-2xl border p-4 transition-all duration-150",
                      isSelected
                        ? "border-amber-500 bg-[#171512] shadow-md shadow-amber-500/10 ring-1 ring-amber-500"
                        : "border-neutral-800 bg-[#131315] hover:border-neutral-700 hover:bg-[#161618]"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-white">
                          {tableName} · {guestName}
                        </span>
                        {guestPhone && (
                          <span className="text-[11px] text-amber-400/90 font-mono">📞 {guestPhone}</span>
                        )}
                      </div>
                      <span className="text-xs text-neutral-400">1 min</span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-neutral-300">
                      <span>
                        {itemsCount} {itemsCount === 1 ? "dish" : "dishes"} · ₹{order.totalAmount}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      {hasItemNotes && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800/80 px-2 py-0.5 text-[10px] font-semibold text-neutral-300 border border-neutral-700">
                          <PenTool className="h-2.5 w-2.5 text-amber-400" />
                          1 item note
                        </span>
                      )}

                      {isPending ? (
                        <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                          NEW
                        </span>
                      ) : isKotPrinted ? (
                        <span className="rounded-md bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-blue-300 border border-blue-500/30">
                          KOT PRINTED
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                          {order.status}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Pane (Image 3 match) */}
        <div className="flex flex-col gap-4">
          {selectedOrder ? (
            <div className="flex flex-col gap-5 rounded-2xl border border-neutral-800 bg-[#131315] p-6">
              {/* Header: Table & Order Number */}
              <div className="flex flex-col gap-1 border-b border-neutral-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-xl font-black text-white">
                      {tableLabel(selectedOrder.table?.number, selectedOrder.table?.name)} · Order {formatOrderNumber(selectedOrder.orderNumber)}
                    </h2>
                    <span className="rounded-full bg-amber-500/15 px-3 py-0.5 text-xs font-bold text-amber-400 border border-amber-500/30">
                      {selectedOrder.acceptance === "ACCEPTED" ? "ACCEPTED · COOKING" : "WAITING APPROVAL"}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    {selectedOrder.guestName || selectedOrder.customer?.name || "Guest"}{(selectedOrder.deliveryPhone || selectedOrder.customer?.phone) ? ` · 📞 ${selectedOrder.deliveryPhone || selectedOrder.customer?.phone}` : ""} · QR check-in · placed just now
                  </p>
                </div>
              </div>

              {/* Itemized Dish Breakdown */}
              <div className="flex flex-col gap-3 rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-4">
                {(selectedOrder.items || []).map((item: any, idx: number) => {
                  const isVeg = item.isVeg !== false;
                  const unitPrice = item.unitPriceSnapshot ? parseFloat(item.unitPriceSnapshot) : 0;
                  const total = parseFloat(item.lineTotal || String(unitPrice * (item.quantity || 1)));

                  return (
                    <div
                      key={item.id || idx}
                      className={cn(
                        "flex items-start justify-between py-2.5",
                        idx > 0 && "border-t border-neutral-800/60"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-neutral-800 text-xs font-bold text-neutral-300">
                          {item.quantity || 1}
                        </span>

                        {/* Veg / Non-Veg Indicator */}
                        <div className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border border-emerald-600 bg-emerald-950/40">
                          <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        </div>

                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold text-white">
                            {item.nameSnapshot || item.name || "Delicious Dish"}
                          </span>

                          {/* Modifiers */}
                          {Array.isArray(item.modifiers) && item.modifiers.length > 0 && (
                            <div className="text-xs text-neutral-400">
                              {item.modifiers.map((m: any, mIdx: number) => (
                                <span key={mIdx}>+ {m.name || m.nameSnapshot} {m.priceAdjustment ? `(+₹${m.priceAdjustment})` : ''}</span>
                              ))}
                            </div>
                          )}

                          {/* Cooking Instructions / Notes */}
                          {item.kitchenNote && (
                            <div className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-300">
                              <PenTool className="h-3 w-3" />
                              <span>&ldquo;{item.kitchenNote}&rdquo;</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <span className="text-sm font-bold text-white">
                        ₹{total.toFixed(0)}
                      </span>
                    </div>
                  );
                })}

                {/* Subtotal & Total Line */}
                <div className="flex items-center justify-between border-t border-neutral-800 pt-3 text-xs text-neutral-400">
                  <span>
                    {(selectedOrder.items || []).length} dishes · items ₹{selectedOrder.totalAmount}
                  </span>
                  <div className="text-base font-black text-white">
                    Total ₹{selectedOrder.totalAmount}
                  </div>
                </div>
              </div>

              {/* Notice Banner: KOT prints on kitchen printer */}
              <div className="flex items-center gap-2.5 rounded-xl border border-neutral-800 bg-[#161513] p-3 text-xs text-neutral-300">
                <Printer className="h-4 w-4 shrink-0 text-amber-400" />
                <span>
                  On accept: <strong>KOT prints on the kitchen printer</strong> · customer sees &ldquo;Accepted&rdquo;
                </span>
              </div>

              {/* Action Buttons: Reject & Accept & Print KOT */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[140px_1fr]">
                <Button
                  variant="outline"
                  className="h-12 rounded-xl border-neutral-800 bg-neutral-900 text-sm font-bold text-neutral-300 hover:bg-neutral-800 hover:text-white"
                  disabled={rejectOrder.isPending || acceptOrder.isPending}
                  onClick={() => setRejectDialogOpen(true)}
                >
                  Reject
                </Button>

                <Button
                  className="h-12 rounded-xl bg-amber-500 text-sm font-black text-black hover:bg-amber-400"
                  disabled={acceptOrder.isPending || rejectOrder.isPending || selectedOrder.acceptance === "ACCEPTED"}
                  onClick={() => acceptOrder.mutate(selectedOrder.id)}
                >
                  <Check className="mr-2 h-5 w-5 stroke-[3]" />
                  {selectedOrder.acceptance === "ACCEPTED"
                    ? "KOT Sent to Kitchen (Accepted)"
                    : "Accept & print KOT"}
                </Button>
              </div>

              {/* Footer caption */}
              <p className="text-center text-[11px] text-neutral-500">
                Payment on hold · bill settles at the counter after the meal
              </p>
            </div>
          ) : (
            <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-neutral-800 bg-[#131315] p-8 text-center">
              <FileText className="h-10 w-10 text-neutral-600 mb-2" />
              <p className="text-sm font-semibold text-neutral-300">Select an order</p>
              <p className="text-xs text-neutral-500">Click on any order on the left queue to view details and accept.</p>
            </div>
          )}
        </div>
      </div>

      {selectedOrder && (
        <ReasonDialog
          open={rejectDialogOpen}
          onOpenChange={setRejectDialogOpen}
          title={`Reject Order ${formatOrderNumber(selectedOrder.orderNumber)}?`}
          description="Declining returns the table to its previous state. The guest will see the order was not accepted."
          reasons={[
            "Kitchen closing soon",
            "Item out of stock",
            "Table unavailable",
            "Duplicate order",
            "Guest requested cancellation",
          ]}
          confirmLabel="Reject order"
          keepLabel="Keep order"
          onSubmit={async (reason) => {
            await rejectOrder.mutateAsync({ id: selectedOrder.id, reason });
          }}
        />
      )}
    </div>
  );
}
