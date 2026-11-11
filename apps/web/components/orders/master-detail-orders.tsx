"use client";

import { formatClock, formatElapsed } from "@/lib/order-time";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Clock,
  CreditCard,
  DollarSign,
  FileText,
  Flame,
  Leaf,
  PenTool,
  Phone,
  Printer,
  QrCode,
  Receipt,
  Search,
  Sparkles,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api";
import { playSuccessChime, vibrateSuccess } from "@/lib/celebrate";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { useCheckoutOrder, type ManagedOrder } from "@/hooks/use-orders";
import { useUpdateKotStatus } from "@/hooks/use-kds";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { formatCurrency, formatOrderNumber } from "@/lib/format";
import { tableLabel, type PaymentMethodDto } from "@easydine/types";
import { openReceiptPrint } from "@/lib/print";

interface MasterDetailOrdersProps {
  branchId: string | null;
  orders: ManagedOrder[];
  isLoading: boolean;
  onRefresh?: () => void;
}

/** Re-renders every `intervalMs` so relative times ("5 min") stay current. */
function useNow(intervalMs = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function getCookingStatus(order: ManagedOrder): {
  label: string;
  color: string;
  step: "NEW" | "ACCEPTED" | "PREPARING" | "READY" | "SERVED";
} {
  if (order.status === "PAID" || (order as any).orderStatus === "PAID") {
    return {
      label: "PAID",
      color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
      step: "SERVED",
    };
  }
  if (order.acceptance === "PENDING" || (order.acceptance as string) === "NEW") {
    return {
      label: "WAITING ACCEPTANCE",
      color: "bg-rose-500/20 text-rose-300 border-rose-500/30",
      step: "NEW",
    };
  }
  if (order.acceptance === "REJECTED" || order.status === "CANCELLED") {
    return {
      label: "REJECTED",
      color: "bg-neutral-800 text-neutral-400 border-neutral-700",
      step: "NEW",
    };
  }

  const kots = order.kots || [];
  const kotStatuses = kots.map((k) => k.status);
  const activeItems = (order.items || []).map((i: any) => i.status).filter(Boolean);
  const combined = [...kotStatuses, ...activeItems];

  if (combined.length > 0) {
    if (combined.every((s) => s === "SERVED")) {
      return {
        label: "SERVED / DELIVERED",
        color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        step: "SERVED",
      };
    }
    if (combined.every((s) => s === "READY" || s === "SERVED")) {
      return {
        label: "READY FOR PICKUP",
        color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
        step: "READY",
      };
    }
    if (combined.some((s) => s === "SERVED")) {
      return {
        label: "SERVED / DELIVERED",
        color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
        step: "SERVED",
      };
    }
    if (combined.some((s) => s === "READY")) {
      return {
        label: "READY FOR PICKUP",
        color: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
        step: "READY",
      };
    }
    if (combined.some((s) => s === "PREPARING")) {
      return {
        label: "PREPARING IN KITCHEN",
        color: "bg-amber-500/20 text-amber-300 border-amber-500/30",
        step: "PREPARING",
      };
    }
    if (combined.some((s) => s === "ACCEPTED") || order.acceptance === "ACCEPTED") {
      return {
        label: "ACCEPTED · COOKING",
        color: "bg-amber-500/15 text-amber-400 border-amber-500/30",
        step: "ACCEPTED",
      };
    }
  }

  if (order.acceptance === "ACCEPTED") {
    return {
      label: "ACCEPTED · COOKING",
      color: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      step: "ACCEPTED",
    };
  }

  return {
    label: order.status,
    color: "bg-neutral-800 text-neutral-300 border-neutral-700",
    step: "NEW",
  };
}

export function MasterDetailOrders({
  branchId,
  orders,
  isLoading,
  onRefresh,
}: MasterDetailOrdersProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  // Ticks every 30s so "5 min" / "placed 10:28 AM · 7 min" stay current.
  const now = useNow();

  // Tab: Incoming Queue vs Active vs History
  const [activeTab, setActiveTab] = useState<"QUEUE" | "IN_PROGRESS" | "HISTORY">("QUEUE");
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [selectedPaymentMethodDto, setSelectedPaymentMethodDto] = useState<PaymentMethodDto>("CASH");

  const checkoutOrder = useCheckoutOrder(branchId);
  const updateKot = useUpdateKotStatus(branchId);

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
        o.status === "PAID" ||
        (o as any).orderStatus === "PAID" ||
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

  useEffect(() => {
    setSelectedOrderId(null);
  }, [activeTab]);

  const selectedOrder = useMemo(() => {
    if (selectedOrderId) {
      const found = currentList.find((o) => o.id === selectedOrderId || o.orderNumber === selectedOrderId);
      if (found) return found;
    }
    return currentList[0] || null;
  }, [selectedOrderId, currentList]);

  // Mutations for Accept & Reject
  const acceptOrder = useMutation({
    mutationFn: (id: string) =>
      api.post<{ printStatus?: "NO_PRINTER" | "SENT" | "PRINTED" | "FAILED" | "UNKNOWN"; printError?: string }>(`/orders/${id}/accept`),
    onSuccess: (data) => {
      vibrateSuccess();
      playSuccessChime();
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["floors"] });
      queryClient.invalidateQueries({ queryKey: ["kds"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      if (data?.printStatus === "SENT" || data?.printStatus === "PRINTED") {
        toast.success("Order accepted · KOT sent to the printer");
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
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["floors"] });
      queryClient.invalidateQueries({ queryKey: ["kds"] });
      toast.info("Order rejected");
      if (onRefresh) onRefresh();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not reject order");
    },
  });

  // Handle Quick Payment
  const handleCollectPayment = () => {
    if (!selectedOrder) return;
    const amount = parseFloat(selectedOrder.totalAmount);
    if (!amount || amount <= 0) {
      toast.error("Invalid order total amount");
      return;
    }

    checkoutOrder.mutate(
      {
        orderId: selectedOrder.id,
        dto: {
          payments: [
            {
              method: selectedPaymentMethodDto,
              amount: amount,
            },
          ],
        },
      },
      {
        onSuccess: () => {
          vibrateSuccess();
          playSuccessChime();
          toast.success(`Payment of ₹${amount} received (${selectedPaymentMethodDto})! Order marked as PAID.`);
          setPaymentDialogOpen(false);
          queryClient.invalidateQueries({ queryKey: ["orders"] });
          queryClient.invalidateQueries({ queryKey: ["dashboard"] });
          queryClient.invalidateQueries({ queryKey: ["customers"] });
          if (onRefresh) onRefresh();
        },
        onError: (err) => {
          toast.error(err instanceof ApiError ? err.message : "Could not settle payment");
        },
      }
    );
  };

  const selectedOrderIsTakeaway = selectedOrder?.type === "TAKEAWAY" || !selectedOrder?.table;
  const selectedOrderCookingStatus = selectedOrder ? getCookingStatus(selectedOrder) : null;
  const selectedOrderIsPaid =
    selectedOrder?.status === "PAID" ||
    (selectedOrder as any)?.orderStatus === "PAID" ||
    ((selectedOrder?.payments?.length ?? 0) > 0 &&
      (selectedOrder?.payments ?? []).reduce((acc, p) => acc + parseFloat(p.amount || "0"), 0) >=
        parseFloat(selectedOrder?.totalAmount || "0"));

  const firstKot = selectedOrder?.kots?.[0];

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
                const isTakeaway = order.type === "TAKEAWAY" || !order.table;
                const tableName = isTakeaway
                  ? "🥡 Takeaway"
                  : tableLabel(order.table?.number, order.table?.name);
                const guestName = order.guestName || order.customer?.name || "Walk-in";
                const guestPhone = order.deliveryPhone || order.customer?.phone;
                const isPending =
                  order.acceptance === "PENDING" || !order.acceptance || (order.acceptance as string) === "NEW";
                const hasItemNotes = (order.items || []).some((it: any) => it.kitchenNote || it.instructions);
                const cookingStatus = getCookingStatus(order);
                const isPaid =
                  order.status === "PAID" ||
                  (order as any).orderStatus === "PAID" ||
                  ((order.payments?.length ?? 0) > 0 &&
                    (order.payments ?? []).reduce((acc, p) => acc + parseFloat(p.amount || "0"), 0) >=
                      parseFloat(order.totalAmount || "0"));

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
                      <span className="text-xs text-neutral-400">{formatElapsed(order.createdAt, now)}</span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-neutral-300">
                      <span>
                        {itemsCount} {itemsCount === 1 ? "dish" : "dishes"} · ₹{order.totalAmount}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {hasItemNotes && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-neutral-800/80 px-2 py-0.5 text-[10px] font-semibold text-neutral-300 border border-neutral-700">
                          <PenTool className="h-2.5 w-2.5 text-amber-400" />
                          note
                        </span>
                      )}

                      {/* Kitchen Status Badge */}
                      <span
                        className={cn(
                          "rounded-md px-2 py-0.5 text-[10px] font-bold border",
                          cookingStatus.color
                        )}
                      >
                        {cookingStatus.label}
                      </span>

                      {/* Payment Status Badge */}
                      {isPaid ? (
                        <span className="rounded-md bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/30">
                          PAID ✓
                        </span>
                      ) : (
                        <span className="rounded-md bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/20">
                          UNPAID
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Detail Pane */}
        <div className="flex flex-col gap-4">
          {selectedOrder ? (
            <div className="flex flex-col gap-5 rounded-2xl border border-neutral-800 bg-[#131315] p-6">
              {/* Header: Table & Order Number */}
              <div className="flex flex-col gap-2 border-b border-neutral-800 pb-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-3">
                    <h2 className="text-xl font-black text-white">
                      {selectedOrderIsTakeaway
                        ? "🥡 Takeaway"
                        : tableLabel(selectedOrder.table?.number, selectedOrder.table?.name)}{" "}
                      · Order {formatOrderNumber(selectedOrder.orderNumber)}
                    </h2>
                    {selectedOrderCookingStatus && (
                      <span
                        className={cn(
                          "rounded-full px-3 py-0.5 text-xs font-bold border",
                          selectedOrderCookingStatus.color
                        )}
                      >
                        {selectedOrderCookingStatus.label}
                      </span>
                    )}
                    {selectedOrderIsPaid ? (
                      <span className="rounded-full bg-emerald-500/20 px-3 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                        PAID ✓
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-500/20 px-3 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/30">
                        PAYMENT PENDING
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-xs text-neutral-400">
                    {selectedOrder.guestName || selectedOrder.customer?.name || "Guest"}
                    {selectedOrder.deliveryPhone || selectedOrder.customer?.phone
                      ? ` · 📞 ${selectedOrder.deliveryPhone || selectedOrder.customer?.phone}`
                      : ""}{" "}
                    · {selectedOrderIsTakeaway ? "Takeaway QR" : "Table QR"} · placed{" "}
                    {formatClock(selectedOrder.createdAt)} · {formatElapsed(selectedOrder.createdAt, now)}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-xl border-neutral-700 bg-neutral-800 text-xs font-bold text-neutral-200 hover:bg-neutral-700 hover:text-white"
                    onClick={() => {
                      if (branchId) openReceiptPrint(selectedOrder.id, branchId);
                    }}
                  >
                    <Printer className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
                    {selectedOrderIsPaid ? "Reprint Receipt" : "Print Bill"}
                  </Button>
                </div>
              </div>

              {/* Live Kitchen Status Section with Quick Advance */}
              <div className="flex flex-col gap-2.5 rounded-xl border border-neutral-800/80 bg-neutral-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">Kitchen Progress:</span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-bold border",
                        selectedOrderCookingStatus?.color
                      )}
                    >
                      {selectedOrderCookingStatus?.label}
                    </span>
                  </div>

                  {firstKot && firstKot.status !== "SERVED" && (
                    <Button
                      size="sm"
                      className="h-8 rounded-lg bg-amber-500 text-xs font-black text-black hover:bg-amber-400 transition-all"
                      disabled={updateKot.isPending}
                      onClick={() => {
                        const targetStatus =
                          firstKot.status === "NEW" || firstKot.status === "ACCEPTED"
                            ? "PREPARING"
                            : firstKot.status === "PREPARING"
                            ? "READY"
                            : "SERVED";
                        updateKot.mutate(
                          { id: firstKot.id, status: targetStatus as any },
                          {
                            onSuccess: () => {
                              toast.success(`Kitchen status updated to ${targetStatus}`);
                              queryClient.invalidateQueries({ queryKey: ["orders"] });
                              queryClient.invalidateQueries({ queryKey: ["kds"] });
                              if (onRefresh) onRefresh();
                            },
                          }
                        );
                      }}
                    >
                      <Check className="mr-1 h-3.5 w-3.5 stroke-[3]" />
                      {firstKot.status === "NEW" || firstKot.status === "ACCEPTED"
                        ? "Mark: Preparing in kitchen"
                        : firstKot.status === "PREPARING"
                        ? "Mark: Ready for pickup"
                        : "Mark: Served / Handed Over"}
                    </Button>
                  )}
                </div>
                <p className="text-[11px] text-neutral-400">
                  Kitchen screens advance status live (or click above to update). Customers see this progress instantly on their mobile phones.
                </p>
              </div>

              {/* Payment Status & Action Card (Essential for Takeaway & Dine-in) */}
              <div className="flex flex-col gap-3 rounded-xl border border-neutral-800/80 bg-neutral-900/60 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-amber-400" />
                    <span className="text-xs font-bold text-white">Payment Status:</span>
                    {selectedOrderIsPaid ? (
                      <span className="rounded-md bg-emerald-500/20 px-2.5 py-0.5 text-xs font-bold text-emerald-300 border border-emerald-500/30">
                        PAID ✓
                      </span>
                    ) : (
                      <span className="rounded-md bg-amber-500/20 px-2.5 py-0.5 text-xs font-bold text-amber-300 border border-amber-500/30">
                        UNPAID · Balance Due
                      </span>
                    )}
                  </div>
                  <span className="text-base font-black text-white">₹{selectedOrder.totalAmount}</span>
                </div>

                {!selectedOrderIsPaid ? (
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        type="button"
                        className="h-11 rounded-xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-500 transition-all shadow-md shadow-emerald-950/40"
                        onClick={() => {
                          setSelectedPaymentMethodDto("CASH");
                          setPaymentDialogOpen(true);
                        }}
                      >
                        <DollarSign className="mr-1.5 h-4 w-4" />
                        Collect Cash (₹{selectedOrder.totalAmount})
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11 rounded-xl border-amber-500/40 bg-amber-500/10 text-xs font-black text-amber-300 hover:bg-amber-500/20 transition-all"
                        onClick={() => {
                          setSelectedPaymentMethodDto("UPI");
                          setPaymentDialogOpen(true);
                        }}
                      >
                        <QrCode className="mr-1.5 h-4 w-4" />
                        Collect UPI / Card
                      </Button>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 w-full rounded-xl border-neutral-700 bg-neutral-800 text-xs font-bold text-neutral-200 hover:bg-neutral-700 hover:text-white"
                      onClick={() => {
                        if (branchId) openReceiptPrint(selectedOrder.id, branchId);
                      }}
                    >
                      <Printer className="mr-2 h-4 w-4 text-amber-400" />
                      Print Bill (Customer Check)
                    </Button>
                    <p className="text-[11px] text-neutral-400">
                      Settle payment when customer pays at the counter. Order will be marked PAID and moved to History.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                      <CheckCircle2 className="h-4 w-4" />
                      <span>Bill settled. Transaction completed.</span>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-8 rounded-lg border-neutral-700 bg-neutral-800 text-xs font-bold text-neutral-200 hover:bg-neutral-700 hover:text-white"
                      onClick={() => {
                        if (branchId) openReceiptPrint(selectedOrder.id, branchId);
                      }}
                    >
                      <Printer className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
                      Reprint Receipt
                    </Button>
                  </div>
                )}
              </div>

              {/* Itemized Dish Breakdown */}
              <div className="flex flex-col gap-3 rounded-xl border border-neutral-800/80 bg-neutral-900/40 p-4">
                {(selectedOrder.items || []).map((item: any, idx: number) => {
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
                          <span className="text-sm font-bold text-white">{item.nameSnapshot}</span>

                          {/* Modifiers List */}
                          {item.modifiers && item.modifiers.length > 0 && (
                            <div className="flex flex-col gap-0.5">
                              {item.modifiers.map((mod: any, mIdx: number) => {
                                const adj = Number(mod.priceAdjSnapshot || 0);
                                return (
                                  <span key={mIdx} className="text-xs text-amber-300 font-medium">
                                    + {mod.nameSnapshot} {adj > 0 ? `(+₹${adj})` : ""}
                                  </span>
                                );
                              })}
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

                      <span className="text-sm font-bold text-white">₹{total.toFixed(0)}</span>
                    </div>
                  );
                })}

                {/* Subtotal & Total Line */}
                <div className="flex items-center justify-between border-t border-neutral-800 pt-3 text-xs text-neutral-400">
                  <span>
                    {(selectedOrder.items || []).length} dishes · items ₹{selectedOrder.totalAmount}
                  </span>
                  <div className="text-base font-black text-white">Total ₹{selectedOrder.totalAmount}</div>
                </div>
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
                  disabled={
                    acceptOrder.isPending || rejectOrder.isPending || selectedOrder.acceptance === "ACCEPTED"
                  }
                  onClick={() => acceptOrder.mutate(selectedOrder.id)}
                >
                  <Check className="mr-2 h-5 w-5 stroke-[3]" />
                  {selectedOrder.acceptance === "ACCEPTED"
                    ? "KOT Sent to Kitchen (Accepted)"
                    : "Accept & print KOT"}
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex h-96 flex-col items-center justify-center rounded-2xl border border-neutral-800 bg-[#131315] p-8 text-center">
              <FileText className="h-10 w-10 text-neutral-600 mb-2" />
              <p className="text-sm font-semibold text-neutral-300">Select an order</p>
              <p className="text-xs text-neutral-500">
                Click on any order on the left queue to view details and accept.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Reject Order Reason Dialog */}
      {selectedOrder && (
        <ReasonDialog
          open={rejectDialogOpen}
          onOpenChange={setRejectDialogOpen}
          title={`Reject Order ${formatOrderNumber(selectedOrder.orderNumber)}?`}
          description="Declining returns the order to history. The guest will see the order was not accepted."
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

      {/* Settle / Collect Payment Dialog */}
      {selectedOrder && (
        <Dialog open={paymentDialogOpen} onOpenChange={setPaymentDialogOpen}>
          <DialogContent className="border-neutral-800 bg-[#141416] text-white sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
                <Receipt className="h-5 w-5 text-amber-400" />
                <span>
                  Settle Order #{formatOrderNumber(selectedOrder.orderNumber)} · ₹{selectedOrder.totalAmount}
                </span>
              </DialogTitle>
              <DialogDescription className="text-xs text-neutral-400">
                {selectedOrderIsTakeaway ? "Takeaway customer" : "Dine-in table"} payment at counter.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4 py-3">
              <div className="rounded-xl border border-neutral-800 bg-[#19191c] p-4 text-center">
                <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  Total Amount to Settle
                </span>
                <p className="text-3xl font-black text-white mt-1">₹{selectedOrder.totalAmount}</p>
              </div>

              <div className="flex flex-col gap-2">
                <span className="text-xs font-bold text-neutral-300">Choose Payment Method:</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethodDto("CASH")}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-bold transition-all",
                      selectedPaymentMethodDto === "CASH"
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 ring-2 ring-emerald-500/40"
                        : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white"
                    )}
                  >
                    <DollarSign className="h-5 w-5" />
                    <span>Cash</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethodDto("UPI")}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-bold transition-all",
                      selectedPaymentMethodDto === "UPI"
                        ? "border-amber-500 bg-amber-500/20 text-amber-300 ring-2 ring-amber-500/40"
                        : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white"
                    )}
                  >
                    <QrCode className="h-5 w-5" />
                    <span>UPI / QR</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedPaymentMethodDto("CARD")}
                    className={cn(
                      "flex flex-col items-center justify-center gap-1.5 rounded-xl border p-3 text-xs font-bold transition-all",
                      selectedPaymentMethodDto === "CARD"
                        ? "border-blue-500 bg-blue-500/20 text-blue-300 ring-2 ring-blue-500/40"
                        : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white"
                    )}
                  >
                    <CreditCard className="h-5 w-5" />
                    <span>Card / POS</span>
                  </button>
                </div>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                variant="outline"
                className="rounded-xl border-neutral-700 bg-neutral-900 text-xs text-white"
                onClick={() => setPaymentDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                className="rounded-xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-500"
                disabled={checkoutOrder.isPending}
                onClick={handleCollectPayment}
              >
                <Check className="mr-1.5 h-4 w-4 stroke-[3]" />
                {checkoutOrder.isPending ? "Processing..." : `Confirm Payment (₹${selectedOrder.totalAmount})`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
