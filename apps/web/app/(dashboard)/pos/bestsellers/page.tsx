"use client";

// Today's best selling dishes, ranked by quantity sold on paid orders (the
// popular-items report, same branch scoping and permissions). The cashier
// lands here from the POS voice command "best selling dish"; one tap
// switches to the last 7 or 30 days. Refreshes on its own while open.

import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { BranchNotice } from "@/components/layout/branch-notice";
import { CashierVoice } from "@/components/pos/cashier-voice";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranch } from "@/hooks/use-branch";
import { useFloors } from "@/hooks/use-tables";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ReportResult {
  columns: string[];
  rows: (string | number | null)[][];
}

const RANGES = [
  { key: "today", label: "Today", days: 1 },
  { key: "7d", label: "Last 7 days", days: 7 },
  { key: "30d", label: "Last 30 days", days: 30 },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];

/** Local calendar date (the restaurant's day, not UTC). */
const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function BestsellersPage() {
  const { branchId } = useBranch();
  const tables = useFloors(branchId).data?.flatMap((f) => f.tables) ?? [];
  const [range, setRange] = useState<RangeKey>("today");
  const [today] = useState(() => new Date());
  const days = RANGES.find((r) => r.key === range)?.days ?? 1;
  const to = localDay(today);
  const from = localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)));

  const { data, isLoading, error } = useQuery({
    queryKey: ["reports", "popular-items", branchId, from, to],
    queryFn: ({ signal }) =>
      api.get<ReportResult>(`/reports/popular-items?branchId=${branchId}&from=${from}&to=${to}`, { signal }),
    enabled: !!branchId,
    refetchInterval: 30_000,
    retry: false,
  });
  const rows = (data?.rows ?? []).map(([name, qty, revenue]) => ({
    name: String(name ?? ""),
    qty: Number(qty ?? 0),
    revenue: Number(revenue ?? 0),
  }));
  const top = rows[0]?.qty || 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link href="/pos" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
          Back to POS
        </Link>
        <CashierVoice branchId={branchId} tables={tables} />
      </div>
      <div>
        <h1 className="text-[28px] font-semibold tracking-tight text-foreground">Best selling dishes</h1>
        <p className="text-sm text-muted-foreground">Ranked by quantity sold on paid orders · updates live</p>
      </div>
      <BranchNotice />

      <div role="tablist" aria-label="Period" className="flex gap-2">
        {RANGES.map((r) => (
          <button
            key={r.key}
            type="button"
            role="tab"
            aria-selected={range === r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition-colors",
              range === r.key ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:bg-secondary",
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Card className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-12 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            {error instanceof ApiError && error.status === 403
              ? "Your role can't view sales numbers. Ask the owner for reports access."
              : "Could not load best sellers. It will retry shortly."}
          </p>
        ) : rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No paid orders in this period yet.</p>
        ) : (
          <ol className="space-y-2">
            {rows.map((r, i) => (
              <li key={`${r.name}-${i}`} className="relative overflow-hidden rounded-xl border border-border px-3 py-2.5">
                <span className="absolute inset-y-0 left-0 bg-primary/10" style={{ width: `${(r.qty / top) * 100}%` }} aria-hidden />
                <div className="relative flex items-center gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-bold tabular-nums">
                    {i === 0 ? <Trophy className="h-4 w-4 text-amber-600" /> : i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{r.name}</span>
                  <span className="text-sm font-bold tabular-nums text-foreground">{r.qty} sold</span>
                  <span className="hidden w-24 text-right text-xs tabular-nums text-muted-foreground sm:inline">{formatCurrency(r.revenue)}</span>
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}
