"use client";

import { useSearchParams } from "next/navigation";
import { StatusNote, useNoteToast } from "@/components/ui/status-note";
import { AdjustLineDialog, PayRunDialog, SlipButton } from "@/components/team/payroll-dialogs";
import { EditShiftDialog, DeleteShiftConfirmDialog } from "@/components/team/edit-shift-dialog";
import { Pencil, Trash2, Clock, CheckCircle2 } from "lucide-react";
import { Suspense, useState } from "react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useBranch } from "@/hooks/use-branch";
import {
  useHrActions,
  useLeave,
  usePay,
  usePayrollRun,
  usePayrollRuns,
  usePerformance,
  useShifts,
  type Shift,
} from "@/hooks/use-hr";
import { ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const errMsg = (e: unknown) => (e instanceof ApiError ? e.message : "Something went wrong");
const fmtDate = (s: string) => new Date(s).toLocaleDateString([], { day: "numeric", month: "short" });
const fmtTime = (s: string) => new Date(s).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const TABS = ["schedule", "leave", "payroll", "performance"] as const;
type Tab = (typeof TABS)[number];

function Schedule({ branchId }: { branchId: string | null }) {
  const [from, setFrom] = useState(() => iso(new Date()));
  const to = iso(addDays(new Date(from), 6));
  const { data: shifts, isLoading } = useShifts(branchId, from, to);
  const { data: staff } = usePay(branchId);
  const { addShift, updateShift, deleteShift } = useHrActions(branchId);
  const [form, setForm] = useState({ userId: "", date: iso(new Date()), start: "09:00", end: "17:00" });
  const [customStaffName, setCustomStaffName] = useState("");
  const [isTypingName, setIsTypingName] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [deletingShift, setDeletingShift] = useState<Shift | null>(null);

  const submit = () => {
    const chosenName = isTypingName ? customStaffName.trim() : (staff?.find(s => s.userId === form.userId)?.name || customStaffName.trim());
    const chosenUserId = isTypingName || !form.userId
      ? `staff-${(chosenName || Date.now()).toString().toLowerCase().replace(/[^a-z0-9]/g, "-")}`
      : form.userId;

    if (!chosenName && !chosenUserId) return toast.error("Pick or type a staff member name");

    addShift.mutate(
      {
        userId: chosenUserId,
        startsAt: new Date(`${form.date}T${form.start}`).toISOString(),
        endsAt: new Date(`${form.date}T${form.end}`).toISOString(),
        staffName: chosenName,
      } as any,
      {
        onSuccess: () => {
          toast.success(`Shift scheduled for ${chosenName}`);
          setCustomStaffName("");
          setForm((prev) => ({ ...prev, userId: "" }));
        },
        onError: (e) => toast.error(errMsg(e)),
      },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-5">
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Staff Member</span>
            <button
              type="button"
              onClick={() => setIsTypingName(!isTypingName)}
              className="text-primary hover:underline font-semibold"
            >
              {isTypingName ? "Pick from list" : "+ Type custom name"}
            </button>
          </div>
          {isTypingName ? (
            <Input
              placeholder="e.g. Ramesh Patil"
              value={customStaffName}
              onChange={(e) => setCustomStaffName(e.target.value)}
              className="h-9"
            />
          ) : (
            <select
              aria-label="Staff"
              value={form.userId}
              onChange={(e) => setForm({ ...form, userId: e.target.value })}
              className="h-9 rounded-lg border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">Staff…</option>
              {Array.isArray(staff) &&
                staff.map((s) => (
                  <option key={s.userId} value={s.userId}>
                    {s.name}
                  </option>
                ))}
            </select>
          )}
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Shift Date</span>
          <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="h-9" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">Start Time</span>
          <Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} className="h-9" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-muted-foreground">End Time</span>
          <Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} className="h-9" />
        </div>
        <div className="flex flex-col justify-end">
          <Button onClick={submit} disabled={addShift.isPending} className="h-9">
            Add shift
          </Button>
        </div>
      </Card>
      <div className="flex items-center gap-2 text-sm">
        <Button size="sm" variant="outline" onClick={() => setFrom(iso(addDays(new Date(from), -7)))}>← Prev</Button>
        <span className="text-muted-foreground">{fmtDate(from)} – {fmtDate(to)}</span>
        <Button size="sm" variant="outline" onClick={() => setFrom(iso(addDays(new Date(from), 7)))}>Next →</Button>
      </div>
      <Card className="flex flex-col divide-y divide-border p-2">
        {isLoading ? (
          <Skeleton className="m-4 h-12" />
        ) : Array.isArray(shifts) && shifts.length > 0 ? (
          shifts.map((s) => {
            const hasClockIn = !!s.clockIn;
            const hasClockOut = !!s.clockOut;
            return (
              <div key={s.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{s.user.name}</span>
                    <span className="rounded-full bg-secondary/80 px-2 py-0.5 text-xs text-muted-foreground">
                      {fmtDate(s.startsAt)}
                    </span>
                    {hasClockIn && !hasClockOut && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-500">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Clocked In
                      </span>
                    )}
                    {hasClockOut && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/10 px-2 py-0.5 text-xs font-medium text-blue-500">
                        <CheckCircle2 className="h-3 w-3" /> Completed
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                    <span>
                      Scheduled: <strong>{fmtTime(s.startsAt)} – {fmtTime(s.endsAt)}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      In: <strong className={hasClockIn ? "text-emerald-500" : ""}>{hasClockIn ? fmtTime(s.clockIn!) : "—"}</strong>
                    </span>
                    <span>•</span>
                    <span>
                      Out: <strong className={hasClockOut ? "text-blue-500" : ""}>{hasClockOut ? fmtTime(s.clockOut!) : "—"}</strong>
                    </span>
                    {s.note && (
                      <>
                        <span>•</span>
                        <span className="italic">{s.note}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs"
                    onClick={() => setEditingShift(s)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                    onClick={() => setDeletingShift(s)}
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </Button>
                </div>
              </div>
            );
          })
        ) : (
          <p className="p-6 text-center text-sm text-muted-foreground">No shifts this week.</p>
        )}
      </Card>

      <EditShiftDialog
        shift={editingShift}
        staffList={Array.isArray(staff) ? staff : []}
        open={!!editingShift}
        onOpenChange={(o) => !o && setEditingShift(null)}
        onSave={async (updated) => {
          await updateShift.mutateAsync(updated);
        }}
      />

      <DeleteShiftConfirmDialog
        shift={deletingShift}
        open={!!deletingShift}
        onOpenChange={(o) => !o && setDeletingShift(null)}
        onConfirm={async () => {
          if (deletingShift) {
            await deleteShift.mutateAsync(deletingShift.id);
          }
        }}
      />
    </div>
  );
}

function Leave({ branchId }: { branchId: string | null }) {
  const { data, isLoading } = useLeave(branchId);
  const { decideLeave } = useHrActions(branchId);
  return (
    <Card className="flex flex-col divide-y divide-border p-2">
      {isLoading ? (
        <Skeleton className="m-4 h-12" />
      ) : data && data.length > 0 ? (
        data.map((l) => (
          <div key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium text-foreground">
                {l.user?.name} · {l.type.toLowerCase()}
              </p>
              <p className="text-xs text-muted-foreground">
                {fmtDate(l.startDate)} – {fmtDate(l.endDate)}
                {l.reason && ` · ${l.reason}`}
              </p>
            </div>
            {l.status === "PENDING" ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={() => decideLeave.mutate({ id: l.id, status: "APPROVED" }, { onError: (e) => toast.error(errMsg(e)) })}>
                  Approve
                </Button>
                <Button size="sm" variant="outline" onClick={() => decideLeave.mutate({ id: l.id, status: "REJECTED" }, { onError: (e) => toast.error(errMsg(e)) })}>
                  Reject
                </Button>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">{l.status.toLowerCase()}</span>
            )}
          </div>
        ))
      ) : (
        <p className="p-6 text-center text-sm text-muted-foreground">No leave requests.</p>
      )}
    </Card>
  );
}

function RunDetail({ branchId, id }: { branchId: string | null; id: string }) {
  const { data } = usePayrollRun(branchId, id);
  const { finalizeRun, deleteRun } = useHrActions(branchId);
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const { note, clear, toast: runToast } = useNoteToast();
  if (!data) return <Skeleton className="h-24" />;
  const editable = data.status === "DRAFT";
  const adjustingLine = data.lines.find((l) => l.user.id === adjusting);
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-foreground">
          {fmtDate(data.periodStart)} – {fmtDate(data.periodEnd)} · {data.status.toLowerCase()} · tip pool{" "}
          {formatCurrency(data.tipPool)}
          {data.status === "PAID" && data.paidAt
            ? ` · paid ${fmtDate(data.paidAt)}${data.paymentMethod ? ` by ${data.paymentMethod.replace("_", " ").toLowerCase()}` : ""}`
            : ""}
        </p>
        {data.status === "DRAFT" && (
          <div className="flex gap-2">
            <Button size="sm" onClick={() => finalizeRun.mutate(id, { onSuccess: () => runToast.success("Payroll finalized - adjustments are now locked"), onError: (e) => runToast.error(errMsg(e)) })}>
              Finalize
            </Button>
            <Button size="sm" variant="outline" onClick={() => deleteRun.mutate(id, { onError: (e) => runToast.error(errMsg(e)) })}>Discard draft</Button>
          </div>
        )}
        {data.status === "FINALIZED" && (
          <Button size="sm" onClick={() => setPaying(true)}>Mark as paid</Button>
        )}
      </div>
      <StatusNote note={note} onClear={clear} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="py-1">Staff</th><th>Hours</th><th>Base</th><th>Leave −</th><th>Tips</th>
              <th>Allow. +</th><th>Bonus +</th><th>Advance −</th><th>Other −</th>
              <th className="text-right">Net</th><th />
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.id} className="border-t border-border">
                <td className="py-1.5">{l.user.name}</td>
                <td>{l.hoursWorked}</td>
                <td>{formatCurrency(l.basePay)}</td>
                <td>{formatCurrency(l.unpaidLeaveDeduction)}</td>
                <td>{formatCurrency(l.tipShare)}</td>
                <td>{formatCurrency(l.allowances)}</td>
                <td>{formatCurrency(l.bonus)}</td>
                <td>{formatCurrency(l.advanceRecovery)}</td>
                <td>{formatCurrency(l.otherDeductions)}</td>
                <td className="text-right font-medium">{formatCurrency(l.netPay)}</td>
                <td className="whitespace-nowrap text-right">
                  {editable && (
                    <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setAdjusting(l.user.id)}>
                      Adjust
                    </Button>
                  )}
                  <SlipButton branchId={branchId} runId={id} userId={l.user.id} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-right text-sm font-semibold">Total {formatCurrency(data.totalNet)}</p>
      {adjustingLine && (
        <AdjustLineDialog key={adjustingLine.id} branchId={branchId} runId={id} line={adjustingLine} onClose={() => setAdjusting(null)} />
      )}
      {paying && <PayRunDialog branchId={branchId} runId={id} total={data.totalNet} onClose={() => setPaying(false)} />}
    </Card>
  );
}

function Payroll({ branchId }: { branchId: string | null }) {
  const { data: pay } = usePay(branchId);
  const { data: runs } = usePayrollRuns(branchId);
  const { setPay, createRun } = useHrActions(branchId);
  const [period, setPeriod] = useState(() => {
    const now = new Date();
    const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
    return { start: iso(first), end: iso(last) };
  });
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, { payType: "MONTHLY" | "HOURLY"; rate: string }>>({});

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <p className="text-sm font-medium text-foreground">Pay rates</p>
        {Array.isArray(pay) && pay.map((p) => {
          const d = draft[p.userId] ?? { payType: p.payType ?? "MONTHLY", rate: String(p.rate ?? "") };
          return (
            <div key={p.userId} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="w-40 truncate">{p.name}</span>
              <select
                aria-label="Pay type"
                value={d.payType}
                onChange={(e) => setDraft({ ...draft, [p.userId]: { ...d, payType: e.target.value as "MONTHLY" | "HOURLY" } })}
                className="rounded-lg border border-border bg-background px-2 py-1.5"
              >
                <option value="MONTHLY">Monthly</option>
                <option value="HOURLY">Hourly</option>
              </select>
              <Input
                className="w-28"
                inputMode="decimal"
                placeholder="Rate"
                value={d.rate}
                onChange={(e) => setDraft({ ...draft, [p.userId]: { ...d, rate: e.target.value } })}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setPay.mutate(
                    { userId: p.userId, payType: d.payType, rate: Number(d.rate) },
                    { onSuccess: () => toast.success("Saved"), onError: (e) => toast.error(errMsg(e)) },
                  )
                }
              >
                Save
              </Button>
            </div>
          );
        })}
      </Card>
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <Input type="date" className="w-40" value={period.start} onChange={(e) => setPeriod({ ...period, start: e.target.value })} />
        <Input type="date" className="w-40" value={period.end} onChange={(e) => setPeriod({ ...period, end: e.target.value })} />
        <Button
          disabled={createRun.isPending}
          onClick={() =>
            createRun.mutate(
              { periodStart: period.start, periodEnd: period.end },
              {
                onSuccess: (r) => setOpen((r as { id: string }).id),
                onError: (e) => toast.error(errMsg(e)),
              },
            )
          }
        >
          Run payroll
        </Button>
        <p className="w-full text-xs text-muted-foreground">
          Uses clocked hours from Attendance, approved unpaid leave, and splits the period&rsquo;s tips by hours worked.
        </p>
      </Card>
      {Array.isArray(runs) && runs.map((r) => (
        <div key={r.id} className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setOpen(open === r.id ? null : r.id)}
            className="flex items-center justify-between rounded-xl border border-border px-4 py-3 text-left text-sm hover:bg-secondary"
          >
            <span>{fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)} · {r.status.toLowerCase()}</span>
            <span className="font-medium">{formatCurrency(r.totalNet)}</span>
          </button>
          {open === r.id && <RunDetail branchId={branchId} id={r.id} />}
        </div>
      ))}
    </div>
  );
}

function Performance({ branchId }: { branchId: string | null }) {
  const [range, setRange] = useState(() => ({ from: iso(addDays(new Date(), -29)), to: iso(new Date()) }));
  const { data, isLoading } = usePerformance(branchId, range.from, range.to);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <Input type="date" className="w-40" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input type="date" className="w-40" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </div>
      <Card className="overflow-x-auto p-4">
        {isLoading ? (
          <Skeleton className="h-16" />
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr><th className="py-1">Staff</th><th>Orders</th><th>Sales</th><th>Tips</th><th>Hours</th><th className="text-right">Sales / hour</th></tr>
            </thead>
            <tbody>
              {Array.isArray(data) && data.map((r) => (
                <tr key={r.userId} className="border-t border-border">
                  <td className="py-1.5">{r.name}</td>
                  <td>{r.orders}</td>
                  <td>{formatCurrency(r.sales)}</td>
                  <td>{formatCurrency(r.tips)}</td>
                  <td>{r.hoursWorked}</td>
                  <td className="text-right">{r.salesPerHour == null ? "—" : formatCurrency(r.salesPerHour)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function TeamView() {
  const { branchId } = useBranch();
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => {
    const t = params.get("tab");
    return TABS.find((x) => x === t) ?? "schedule";
  });
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-[32px] font-semibold tracking-tight text-foreground">Team</h1>
        <p className="text-sm text-muted-foreground">Schedules, leave, payroll and performance</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "rounded-full border px-3.5 py-1 text-xs capitalize transition-colors",
              tab === t ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-secondary",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {tab === "schedule" && <Schedule branchId={branchId} />}
      {tab === "leave" && <Leave branchId={branchId} />}
      {tab === "payroll" && <Payroll branchId={branchId} />}
      {tab === "performance" && <Performance branchId={branchId} />}
    </div>
  );
}

export default function TeamPage() {
  return (
    <Suspense fallback={null}>
      <TeamView />
    </Suspense>
  );
}
