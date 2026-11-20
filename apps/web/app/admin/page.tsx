"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, LogOut, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { EasyDineWordmark } from "@/components/brand/easydine-logo";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

// Platform admin: approves or rejects restaurant signups. Not a restaurant
// session: it never opens the cashier POS or any restaurant screen. Every
// call is checked by the server (admin cookie + audience); this page only
// shows what the server returns.

type Status = "PENDING" | "APPROVED" | "REJECTED";
interface AccountRequest {
  id: string;
  restaurantName: string;
  ownerName: string | null;
  ownerEmail: string | null;
  createdAt: string;
  status: Status;
  decidedAt: string | null;
}

const TABS: { key: Status | "ALL"; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ALL", label: "All" },
];

const STATUS_STYLE: Record<Status, string> = {
  PENDING: "bg-warning/15 text-warning border-warning/30",
  APPROVED: "bg-success/15 text-success border-success/30",
  REJECTED: "bg-destructive/15 text-destructive border-destructive/30",
};

function fmt(d: string | null) {
  if (!d) return "";
  return new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function PlatformAdminPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Status | "ALL">("PENDING");
  const [note, setNote] = useState<string | null>(null);

  const me = useQuery({
    queryKey: ["platform-admin", "me"],
    queryFn: () => api.get<{ platformAdmin: boolean }>("/platform-admin/me"),
    retry: false,
  });
  const list = useQuery({
    queryKey: ["platform-admin", "restaurants", tab],
    queryFn: () => api.get<AccountRequest[]>(`/platform-admin/restaurants${tab === "ALL" ? "" : `?status=${tab}`}`),
    enabled: me.isSuccess,
  });
  const decide = useMutation({
    mutationFn: ({ id, action }: { id: string; action: "approve" | "reject" }) =>
      api.post<{ status: Status; changed: boolean }>(`/platform-admin/restaurants/${id}/${action}`),
    onSuccess: (r, v) => {
      setNote(r.changed ? `Restaurant ${v.action === "approve" ? "approved" : "rejected"}.` : "Already in that state; nothing changed.");
      queryClient.invalidateQueries({ queryKey: ["platform-admin", "restaurants"] });
    },
    onError: (e) => setNote(e instanceof ApiError ? e.message : "Could not update the account."),
  });
  const logout = useMutation({
    mutationFn: () => api.post("/platform-admin/logout"),
    onSettled: () => router.replace("/login"),
  });

  if (me.isLoading) return <main className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">Loading…</main>;

  if (me.isError) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <EasyDineWordmark height={32} />
        <p className="max-w-sm text-sm text-muted-foreground">
          {me.error instanceof ApiError && me.error.message ? me.error.message : "Platform admin sign-in required."}
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Go to sign in
        </Link>
      </main>
    );
  }

  const rows = list.data ?? [];
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <EasyDineWordmark height={28} />
          <span className="rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-muted-foreground">Platform admin</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
          <LogOut className="mr-1.5 h-4 w-4" /> Sign out
        </Button>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Account requests</h1>
          <p className="text-sm text-muted-foreground">New restaurants can sign in only after you approve them.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void list.refetch()} disabled={list.isFetching} aria-label="Refresh">
          <RefreshCw className={cn("h-4 w-4", list.isFetching && "animate-spin")} />
        </Button>
      </div>

      <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border border-border bg-card p-1 text-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              "rounded-lg px-3 py-1.5 font-medium transition-colors",
              tab === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {note && (
        <p role="status" className="rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground">
          {note}
        </p>
      )}

      {list.isLoading ? (
        <p className="text-sm text-muted-foreground">Loading requests…</p>
      ) : list.isError ? (
        <p className="text-sm text-destructive">Could not load account requests.</p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No accounts here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate font-semibold text-foreground">{r.restaurantName}</p>
                  <span className={cn("rounded-full border px-2 py-0.5 text-[11px] font-semibold", STATUS_STYLE[r.status])}>{r.status}</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {r.ownerName ?? "Owner"}
                  {r.ownerEmail ? ` · ${r.ownerEmail}` : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Signed up {fmt(r.createdAt)}
                  {r.decidedAt ? ` · decided ${fmt(r.decidedAt)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {r.status !== "APPROVED" && (
                  <Button
                    size="sm"
                    disabled={decide.isPending}
                    onClick={() => {
                      if (window.confirm(`Approve ${r.restaurantName}? They can sign in right away.`)) decide.mutate({ id: r.id, action: "approve" });
                    }}
                  >
                    <Check className="mr-1.5 h-4 w-4" /> Approve
                  </Button>
                )}
                {r.status !== "REJECTED" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    disabled={decide.isPending}
                    onClick={() => {
                      if (window.confirm(`Reject ${r.restaurantName}? They will not be able to sign in, and current sessions end.`))
                        decide.mutate({ id: r.id, action: "reject" });
                    }}
                  >
                    <X className="mr-1.5 h-4 w-4" /> Reject
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
