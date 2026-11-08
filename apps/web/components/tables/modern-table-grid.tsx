"use client";

import {
  BellRing,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  PhoneCall,
  Plus,
  QrCode,
  Receipt,
  RotateCcw,
  Search,
  Sparkles,
  Users,
  Utensils,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { TableQrDialog } from "./table-qr-dialog";
import type { RestaurantTable } from "@/hooks/use-tables";

interface ModernTableGridProps {
  tables: RestaurantTable[];
  branchId: string | null;
  onRefresh?: () => void;
}

function timeAgo(iso?: string): string {
  if (!iso) return "";
  const seconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return `${hours}h ago`;
}

export function ModernTableGrid({ tables, branchId, onRefresh }: ModernTableGridProps) {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Search & Filter
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ORDERING" | "PREPARING" | "BILL">("ALL");

  // Selected Table for Dialogs
  const [selectedTable, setSelectedTable] = useState<RestaurantTable | null>(null);
  const [qrTable, setQrTable] = useState<RestaurantTable | null>(null);
  const [settleDialogOpen, setSettleDialogOpen] = useState(false);
  const [settlePaymentMethod, setSettlePaymentMethod] = useState<"CASH" | "UPI" | "CARD">("UPI");

  // Settle table mutation
  const settleMutation = useMutation({
    mutationFn: (tableId: string) =>
      api.post<{ success: boolean }>(`/tables/${tableId}/settle`, { method: settlePaymentMethod }),
    onSuccess: (_, tableId) => {
      queryClient.invalidateQueries({ queryKey: ["floors", branchId] });
      queryClient.invalidateQueries({ queryKey: ["orders"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Bill settled successfully. Table is now FREE.");
      setSettleDialogOpen(false);
      setSelectedTable(null);
      if (onRefresh) onRefresh();
    },
    onError: (err) => {
      toast.error(err instanceof ApiError ? err.message : "Could not settle table");
    },
  });

  // Acknowledge waiter call / bill request
  const resolveRequest = useMutation({
    mutationFn: (tableId: string) =>
      api.post(`/tables/${tableId}/status`, { status: "OCCUPIED" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["floors", branchId] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Request acknowledged");
      if (onRefresh) onRefresh();
    },
  });

  // Dynamic banners from table data
  const waiterCallTables = useMemo(() =>
    tables.filter((t) => (t.status as string) === "WAITER_CALL" || (t as any).serviceRequest === "WAITER"),
    [tables]
  );
  const billRequestedTables = useMemo(() =>
    tables.filter((t) => (t.status as string) === "BILL_REQUESTED" || (t as any).serviceRequest === "BILL"),
    [tables]
  );
  const newOrderTables = useMemo(() =>
    tables.filter((t) => (t as any).orderNumber && (t.status as string) === "OCCUPIED"),
    [tables]
  );

  // Filtered tables
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = (t.name || "").toLowerCase().includes(q);
        const matchesNum = String(t.number).toLowerCase().includes(q);
        const matchesGuest = (t.customerName || "").toLowerCase().includes(q);
        if (!matchesName && !matchesNum && !matchesGuest) return false;
      }
      if (filter === "ORDERING") {
        return (t.status as string) === "OCCUPIED" || (t.status as string) === "BROWSING" || t.customerName;
      }
      if (filter === "PREPARING") {
        return (t.status as string) === "PREPARING";
      }
      if (filter === "BILL") {
        return (t.status as string) === "BILL_REQUESTED" || (t as any).serviceRequest === "BILL";
      }
      return true;
    });
  }, [tables, search, filter]);

  // Counts for pills
  const counts = useMemo(() => {
    const total = tables.length;
    const ordering = tables.filter(
      (t) => (t.status as string) === "OCCUPIED" || (t.status as string) === "BROWSING" || t.customerName
    ).length;
    const preparing = tables.filter((t) => (t.status as string) === "PREPARING").length;
    const bill = tables.filter(
      (t) => (t.status as string) === "BILL_REQUESTED" || (t as any).serviceRequest === "BILL"
    ).length;
    return { total, ordering, preparing, bill };
  }, [tables]);

  // Helper to get status badge info
  function getStatusBadge(table: RestaurantTable) {
    const tAny = table as any;
    const status = table.status;
    
    if (tAny.serviceRequest === "WAITER" || (status as string) === "WAITER_CALL") {
      return { text: "WAITER CALL", class: "bg-red-500/20 text-red-300 border-red-500/40", pulse: false };
    }
    if (tAny.serviceRequest === "BILL" || (status as string) === "BILL_REQUESTED") {
      return { text: "BILL REQUESTED", class: "bg-rose-500/20 text-rose-300 border-rose-500/40", pulse: false };
    }
    if ((status as string) === "OCCUPIED" && tAny.orderNumber && (tAny.acceptance === "PENDING" || !tAny.acceptance)) {
      return { text: "NEW ORDER", class: "bg-amber-500/20 text-amber-300 border-amber-500/40", pulse: true };
    }
    if ((status as string) === "SERVED") {
      return { text: "SERVED", class: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", pulse: false };
    }
    if ((status as string) === "PREPARING") {
      return { text: "PREPARING", class: "bg-blue-500/20 text-blue-300 border-blue-500/40", pulse: false };
    }
    if ((status as string) === "BROWSING" || (table.customerName && (status as string) !== "FREE" && (status as string) !== "AVAILABLE")) {
      return { text: "SEATED · BROWSING", class: "bg-amber-900/30 text-amber-200 border-amber-800/40", pulse: false };
    }
    if ((status as string) === "OCCUPIED") {
      return { text: "OCCUPIED", class: "bg-amber-500/20 text-amber-300 border-amber-500/40", pulse: false };
    }
    return { text: "FREE", class: "bg-neutral-800 text-neutral-400 border-neutral-700", pulse: false };
  }

  const isFree = (table: RestaurantTable) => {
    return (table.status as string) === "AVAILABLE" || (table.status as string) === "FREE" || (!table.customerName && !table.status?.includes("_"));
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. TOP URGENT ACTION BANNERS */}
      {(waiterCallTables.length > 0 || billRequestedTables.length > 0 || newOrderTables.length > 0) && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {waiterCallTables.map((t) => (
            <div key={`waiter-${t.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-[#141210] p-4 transition-all hover:border-amber-500/30">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <PhoneCall className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Waiter call · {t.name || `Table ${t.number}`}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {t.customerName ? `${t.customerName} · ` : ""}{timeAgo((t as any).statusSince)}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-lg border-neutral-700 bg-neutral-900/60 text-xs font-semibold text-neutral-200 hover:bg-neutral-800 hover:text-white"
                onClick={() => {
                  resolveRequest.mutate(t.id);
                  toast.success(`Waiter dispatched to ${t.name || `Table ${t.number}`}`);
                }}
              >
                Send waiter
              </Button>
            </div>
          ))}

          {billRequestedTables.map((t) => (
            <div key={`bill-${t.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-[#161410] p-4 transition-all hover:border-amber-500/30">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <Receipt className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    Bill requested · {t.name || `Table ${t.number}`}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {(t as any).totalAmount ? `₹${(t as any).totalAmount} · ` : ""}{timeAgo((t as any).statusSince)}
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="h-8 rounded-lg bg-amber-500 text-xs font-bold text-black hover:bg-amber-400"
                onClick={() => {
                  setSelectedTable(t);
                  setSettleDialogOpen(true);
                }}
              >
                Print bill
              </Button>
            </div>
          ))}

          {newOrderTables.map((t) => (
            <div key={`order-${t.id}`} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-[#161410] p-4 transition-all hover:border-amber-500/30">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
                  <Clock className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">
                    New order · {t.name || `Table ${t.number}`}
                  </p>
                  <p className="text-xs text-neutral-400">
                    {(t as any).dishesCount ? `${(t as any).dishesCount} dishes · ` : ""}waiting approval
                  </p>
                </div>
              </div>
              <Button
                size="sm"
                className="h-8 rounded-lg bg-amber-500 text-xs font-bold text-black hover:bg-amber-400"
                onClick={() => router.push("/orders")}
              >
                Review
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 2. DINE-IN FLOOR FILTER BAR & SEARCH */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm font-bold text-white">Dine-in floor</span>
          {(["ALL", "ORDERING", "PREPARING", "BILL"] as const).map((f) => {
            const label = f === "ALL" ? `All (${counts.total})` : f === "ORDERING" ? "Ordering" : f === "PREPARING" ? "Preparing" : "Bill requested";
            return (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full px-3.5 py-1 text-xs font-semibold transition-all",
                  filter === f
                    ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                    : "bg-neutral-900 text-neutral-400 border border-neutral-800 hover:text-white"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-neutral-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search table or guest"
            className="h-9 rounded-xl border-neutral-800 bg-neutral-900/80 pl-9 text-xs text-white placeholder:text-neutral-500 focus-visible:border-amber-500"
          />
        </div>
      </div>

      {/* 3. TABLE CARDS GRID — larger cards with visible names */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {filteredTables.map((table) => {
          const tAny = table as any;
          const badge = getStatusBadge(table);
          const free = isFree(table);
          const isNewOrder = badge.text === "NEW ORDER";

          // Customer info
          const customerLine = table.customerName
            ? `${table.customerName}${tAny.checkInType ? ` · ${tAny.checkInType}` : ""}${tAny.guestCount ? ` · ${tAny.guestCount} guests` : ""}`
            : null;

          // Detail line
          const detailLine = tAny.dishesCount !== undefined && tAny.dishesCount > 0
            ? `${tAny.dishesCount} ${tAny.dishesCount === 1 ? "item" : "items"} · ₹${parseFloat(tAny.totalAmount || "0").toLocaleString("en-IN")}`
            : free
            ? `Seats ${table.capacity || 4}`
            : table.customerName
            ? "Not ordered yet"
            : `Seats ${table.capacity || 4}`;

          // Time line
          const timeLine = tAny.statusSince ? timeAgo(tAny.statusSince) : null;
          const statusHint =
            isNewOrder ? "Waiting approval" :
            badge.text === "PREPARING" ? "KOT sent" :
            badge.text === "SERVED" ? "Served" :
            badge.text === "BILL REQUESTED" ? "Requested" :
            badge.text === "WAITER CALL" ? "Called" :
            badge.text.includes("BROWSING") ? "Seated" :
            null;

          return (
            <div
              key={table.id}
              onClick={() => {
                if (free) {
                  setQrTable(table);
                } else if (isNewOrder) {
                  router.push("/orders");
                } else {
                  setSelectedTable(table);
                }
              }}
              className={cn(
                "group relative flex min-h-[160px] cursor-pointer flex-col justify-between rounded-2xl border p-5 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg",
                isNewOrder
                  ? "border-amber-500/60 bg-[#161410] shadow-amber-500/10"
                  : free
                  ? "border-neutral-800/80 bg-[#111113] hover:border-neutral-700"
                  : "border-neutral-800 bg-[#141416] hover:border-amber-500/40"
              )}
            >
              {/* Pulsing indicator for new orders */}
              {badge.pulse && (
                <div className="absolute right-4 top-4 flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500" />
                </div>
              )}

              {/* Card Header */}
              <div className="flex items-start justify-between gap-2">
                <span className="text-base font-bold text-white tracking-tight">
                  {table.name || `Table ${table.number}`}
                </span>
                <span
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    badge.class
                  )}
                >
                  {badge.text}
                </span>
              </div>

              {/* Card Body — Customer & Items */}
              <div className="my-2 flex flex-col gap-1.5">
                {customerLine ? (
                  <p className="text-sm font-semibold text-neutral-200">
                    {customerLine}
                  </p>
                ) : null}
                <p className={cn("text-xs font-medium", free ? "text-neutral-500" : "text-amber-300/90")}>
                  {detailLine}
                </p>
              </div>

              {/* Card Footer */}
              <div className="flex items-center justify-between border-t border-neutral-800/60 pt-2 text-[11px] text-neutral-400">
                <span>
                  {statusHint && timeLine ? `${statusHint} · ${timeLine}` : timeLine || `Seats ${table.capacity || 4}`}
                </span>
                {!free && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedTable(table);
                      setSettleDialogOpen(true);
                    }}
                    className="text-[10px] font-bold text-amber-400 opacity-80 hover:opacity-100 hover:underline"
                  >
                    Settle bill ›
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. TABLE DETAILS & ACTIONS MODAL */}
      <Dialog
        open={!!selectedTable && !settleDialogOpen}
        onOpenChange={(open) => {
          if (!open) setSelectedTable(null);
        }}
      >
        <DialogContent className="border-neutral-800 bg-[#141416] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-white">
              {selectedTable?.name || `Table ${selectedTable?.number}`}
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              Manage live dine-in session and billing
            </DialogDescription>
          </DialogHeader>

          {selectedTable && (
            <div className="flex flex-col gap-4 py-2">
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-3">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Guest:</span>
                  <span className="font-bold text-white">
                    {selectedTable.customerName || (selectedTable as any).guestName || "Walk-in Guest"}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-neutral-400">
                  <span>Status:</span>
                  <Badge variant="outline" className="text-[10px] uppercase text-amber-300 border-amber-500/40">
                    {selectedTable.status}
                  </Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs text-neutral-400">
                  <span>Bill Amount:</span>
                  <span className="text-sm font-bold text-amber-400">
                    ₹{(selectedTable as any).totalAmount || "0.00"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="rounded-xl border-neutral-700 bg-neutral-900 text-xs font-semibold text-white hover:bg-neutral-800"
                  onClick={() => setQrTable(selectedTable)}
                >
                  <QrCode className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
                  View QR code
                </Button>
                <Button
                  variant="outline"
                  className="rounded-xl border-neutral-700 bg-neutral-900 text-xs font-semibold text-white hover:bg-neutral-800"
                  onClick={() => router.push(`/pos?tableId=${selectedTable.id}`)}
                >
                  <Plus className="mr-1.5 h-3.5 w-3.5 text-amber-400" />
                  Add dishes
                </Button>
              </div>

              <Button
                className="w-full rounded-xl bg-amber-500 font-bold text-black hover:bg-amber-400"
                onClick={() => setSettleDialogOpen(true)}
              >
                <Receipt className="mr-2 h-4 w-4" />
                Settle bill & Mark table Free
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 5. SETTLE BILL CONFIRMATION DIALOG */}
      <Dialog open={settleDialogOpen} onOpenChange={setSettleDialogOpen}>
        <DialogContent className="border-neutral-800 bg-[#161619] text-white sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-bold text-white">
              <Receipt className="h-5 w-5 text-amber-400" />
              Settle Bill & Free Table {selectedTable?.number}
            </DialogTitle>
            <DialogDescription className="text-xs text-neutral-400">
              Confirm payment receipt. Table will be reset to FREE and customer name will be cleared.
            </DialogDescription>
          </DialogHeader>

          {selectedTable && (
            <div className="flex flex-col gap-4 py-2">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex justify-between text-xs text-neutral-400">
                  <span>Customer:</span>
                  <span className="font-semibold text-white">
                    {selectedTable.customerName || (selectedTable as any).guestName || "Walk-in Guest"}
                  </span>
                </div>
                <div className="mt-2 flex justify-between text-sm font-semibold text-white">
                  <span>Total Amount Due:</span>
                  <span className="text-lg font-black text-amber-400">
                    ₹{(selectedTable as any).totalAmount || "0.00"}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-xs font-semibold text-neutral-300">Select Payment Method</Label>
                <div className="grid grid-cols-3 gap-2">
                  {(["UPI", "CASH", "CARD"] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={() => setSettlePaymentMethod(method)}
                      className={cn(
                        "rounded-xl border py-2.5 text-xs font-bold transition-all",
                        settlePaymentMethod === method
                          ? "border-amber-500 bg-amber-500/20 text-amber-300 shadow-sm"
                          : "border-neutral-800 bg-neutral-900 text-neutral-400 hover:text-white"
                      )}
                    >
                      {method === "UPI" ? "📱 UPI" : method === "CASH" ? "💵 Cash" : "💳 Card"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              className="rounded-xl border-neutral-700 bg-neutral-900 text-xs font-semibold text-white hover:bg-neutral-800"
              onClick={() => setSettleDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              className="rounded-xl bg-amber-500 text-xs font-bold text-black hover:bg-amber-400"
              disabled={settleMutation.isPending}
              onClick={() => {
                if (selectedTable) {
                  settleMutation.mutate(selectedTable.id);
                }
              }}
            >
              {settleMutation.isPending ? "Settling..." : "✔ Confirm Paid & Free Table"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 6. QR CODE DIALOG */}
      {qrTable && (
        <TableQrDialog
          branchId={branchId}
          table={qrTable}
          open={!!qrTable}
          onOpenChange={(open) => {
            if (!open) setQrTable(null);
          }}
        />
      )}
    </div>
  );
}
