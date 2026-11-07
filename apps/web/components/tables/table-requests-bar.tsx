"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, Receipt, CheckCircle } from "lucide-react";
import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { playSuccessChime, vibrateSuccess } from "@/lib/celebrate";
import { toast } from "@/lib/toast";

interface TableRequestRow {
  id: string;
  type: "WAITER" | "BILL";
  createdAt: string;
  table: { id: string; number: string; name: string | null };
}

/** Guest "call waiter" / "request bill" taps from the table QR page. */
export function TableRequestsBar({ branchId }: { branchId: string | null }) {
  const queryClient = useQueryClient();
  const prevCount = useRef(0);

  const { data } = useQuery({
    queryKey: ["table-requests", branchId],
    queryFn: () => api.get<TableRequestRow[]>(`/tables/requests?branchId=${branchId}`),
    enabled: !!branchId,
    refetchInterval: 3_000,
  });

  useEffect(() => {
    if (data && data.length > prevCount.current) {
      playSuccessChime();
      vibrateSuccess();
      const latest = data[0];
      toast.info(
        latest.type === "BILL"
          ? `🧾 ${latest.table.name ?? `Table ${latest.table.number}`} requested the bill!`
          : `🔔 ${latest.table.name ?? `Table ${latest.table.number}`} is calling for a waiter!`
      );
    }
    prevCount.current = data?.length ?? 0;
  }, [data]);

  const resolve = useMutation({
    mutationFn: (id: string) => api.patch(`/tables/requests/${id}/resolve?branchId=${branchId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["table-requests"] }),
  });

  if (!data || data.length === 0) return null;
  return (
    <div className="flex flex-col gap-2 rounded-2xl border-2 border-amber-500/40 bg-gradient-to-r from-amber-500/15 via-background to-background p-3.5 shadow-md animate-in slide-in-from-top duration-300">
      <div className="flex items-center justify-between text-xs font-bold text-amber-500 uppercase tracking-wider">
        <span className="flex items-center gap-1.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
          </span>
          Live Guest Service Alerts ({data.length})
        </span>
      </div>
      {data.map((r) => (
        <div key={r.id} className="flex items-center justify-between gap-3 text-sm font-medium bg-card/90 rounded-xl px-3 py-2 border border-border">
          <span className="flex items-center gap-2 text-foreground">
            {r.type === "BILL" ? (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/20 text-emerald-500">
                <Receipt className="h-4 w-4" />
              </span>
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-amber-500">
                <BellRing className="h-4 w-4 animate-bounce" />
              </span>
            )}
            <strong className="text-foreground font-semibold">{r.table.name ?? `Table ${r.table.number}`}</strong>
            <span className="text-muted-foreground">—</span>
            <span className={r.type === "BILL" ? "text-emerald-500 font-semibold" : "text-amber-500 font-semibold"}>
              {r.type === "BILL" ? "Requested the Bill 🧾" : "Called for Waiter 🔔"}
            </span>
          </span>
          <Button
            size="sm"
            variant="default"
            className="h-8 gap-1 text-xs"
            disabled={resolve.isPending}
            onClick={() => resolve.mutate(r.id)}
          >
            <CheckCircle className="h-3.5 w-3.5" />
            Acknowledge
          </Button>
        </div>
      ))}
    </div>
  );
}
