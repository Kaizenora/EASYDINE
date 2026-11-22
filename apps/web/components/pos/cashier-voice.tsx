"use client";

// Hands-free cashier commands, always listening once switched on. Lives in
// the dashboard top bar, so it keeps listening while the cashier moves
// between POS, Tables, Orders and the rest. Each pause-separated utterance
// goes to our backend in one request (Sarvam STT with auto language
// detection, then a fast rule match or the LLM) and comes back as a checked
// action. It only listens: no voice reply. Recognised commands show a short
// toast with what was heard; ordinary talk is ignored quietly.
//
// Read/navigation runs at once (open a table, show best sellers). Anything
// that changes money or prints waits for an on-screen tap: "paid" opens the
// table's bill where the cashier picks the mode and presses Paid, and a
// reprint asks first.

import type { SessionUser } from "@easydine/types";
import { Loader2, Mic, MicOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast as sonner } from "sonner";
import { BillTableDialog } from "@/components/tables/bill-table-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { hasPermission } from "@/hooks/use-auth";
import { useBranch } from "@/hooks/use-branch";
import { useContinuousListener, type ListenerError } from "@/hooks/use-continuous-listener";
import { useFloors, type RestaurantTable } from "@/hooks/use-tables";
import { api, ApiError } from "@/lib/api";
import { getActivePrintScope, reprintKot } from "@/lib/local-print";
import { openReceiptPrint } from "@/lib/print";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { audioForm, type CashierCommandResult } from "@/lib/voice-order";

export const BESTSELLERS_HREF = "/pos/bestsellers";
const STORAGE_KEY = "easydine-cashier-voice";
/** Utterances waiting while one is in flight; older ones are dropped. */
const MAX_QUEUE = 2;

type Reprint = { kind: "kot" | "bill"; label: string; orderId: string; orderNumber: string };

const heardToast = (text: string) => sonner(text, { duration: 4_000 });

export function CashierVoice({ user }: { user?: SessionUser }) {
  const router = useRouter();
  const { branchId } = useBranch();
  const allowed = hasPermission(user, "orders.create");
  const [busy, setBusy] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const [billTable, setBillTable] = useState<RestaurantTable | null>(null);
  const [reprint, setReprint] = useState<Reprint | null>(null);
  const queue = useRef<Blob[]>([]);
  const inFlight = useRef(false);
  const lastErrorAt = useRef(0);

  const run = (r: CashierCommandResult, tables: RestaurantTable[]) => {
    if (r.heard) setLastHeard(r.heard);
    // Always-on: ordinary talk around the counter is not an error.
    if (r.action === "unknown") return;
    if (r.action === "bestSellers") {
      heardToast("Sun liya: aaj ke best sellers dikha raha hoon");
      router.push(BESTSELLERS_HREF);
      return;
    }
    const said = `Sun liya: “${r.heard}”`;
    if (!r.table) {
      toast.error(`${said} — kaunsa table? Jaise bolein: “table 2 paid”.`);
      return;
    }
    const label = r.table.label;
    if (r.action === "openTable" || r.action === "markPaid") {
      const table = tables.find((t) => t.id === r.table?.id);
      if (!table) {
        toast.error(`${said} — ${label} is branch me nahi mila.`);
        return;
      }
      heardToast(
        r.action === "openTable"
          ? `Sun liya: ${label} — order khol raha hoon`
          : `Sun liya: ${label} paid — mode chun ke Paid dabayein`,
      );
      setReprint(null);
      setBillTable(table);
      return;
    }
    if (!r.order) {
      toast.error(`${said} — ${label} par koi order nahi mila.`);
      return;
    }
    setBillTable(null);
    setReprint({ kind: r.action === "reprintKOT" ? "kot" : "bill", label, orderId: r.order.id, orderNumber: r.order.orderNumber });
  };

  const floors = useFloors(allowed ? branchId : null);
  const tablesRef = useRef<RestaurantTable[]>([]);
  useEffect(() => {
    tablesRef.current = floors.data?.flatMap((f) => f.tables) ?? [];
  }, [floors.data]);

  const drain = async () => {
    if (inFlight.current || !branchId) return;
    const next = queue.current.shift();
    if (!next) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const r = await api.postForm<CashierCommandResult>(`/voice-order/cashier-audio?branchId=${branchId}`, audioForm(next));
      run(r, tablesRef.current);
    } catch (err) {
      // One error toast per 30 s at most: the mic keeps sending.
      if (Date.now() - lastErrorAt.current > 30_000) {
        lastErrorAt.current = Date.now();
        toast.error(
          err instanceof ApiError && err.status === 429
            ? "Voice: bahut zyada awaaz aa rahi hai, thoda ruk ke bolein."
            : err instanceof ApiError
              ? `Voice: ${err.message}`
              : "Voice command failed",
        );
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
      void drain();
    }
  };

  const onUtterance = (wav: Blob) => {
    queue.current.push(wav);
    while (queue.current.length > MAX_QUEUE) queue.current.shift();
    void drain();
  };

  const onError = (e: ListenerError) => {
    localStorage.removeItem(STORAGE_KEY);
    toast.error(
      e === "denied"
        ? "Microphone blocked. Allow mic access for this site to use voice commands."
        : "Voice commands are not available in this browser.",
    );
  };

  const listener = useContinuousListener({ onUtterance, onError });

  // Stays on across reloads once the cashier switched it on.
  const autoStarted = useRef(false);
  useEffect(() => {
    if (autoStarted.current || !allowed || !branchId) return;
    autoStarted.current = true;
    if (localStorage.getItem(STORAGE_KEY) === "on") void listener.start();
  }, [allowed, branchId, listener]);

  const toggle = () => {
    if (listener.listening) {
      listener.stop();
      queue.current = [];
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, "on");
      void listener.start();
    }
  };

  const confirmReprint = () => {
    if (!reprint || !branchId) return;
    const r = reprint;
    setReprint(null);
    if (r.kind === "bill") {
      openReceiptPrint(r.orderId, branchId, {});
      return;
    }
    void reprintKot(r.orderId, { ...getActivePrintScope(), branchId }).then((e) => {
      if (e.status === "FAILED" || e.status === "UNKNOWN") toast.error(e.message);
    });
  };

  if (!allowed) return null;

  const on = listener.listening;
  return (
    <>
      <button
        type="button"
        onClick={toggle}
        disabled={!branchId}
        aria-pressed={on}
        title={
          on
            ? `Listening for commands${lastHeard ? ` · last heard: “${lastHeard}”` : ""}. Tap to turn off.`
            : "Voice commands: “table 2”, “table 2 paid”, “table 2 KOT reprint”, “best selling dish”"
        }
        className={cn(
          "relative mr-1 inline-flex h-9 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors disabled:opacity-60",
          on
            ? "border-destructive/50 bg-destructive/10 text-destructive"
            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        {on && listener.speaking && (
          <span className="absolute -right-1 -top-1 h-2.5 w-2.5 animate-ping rounded-full bg-destructive" aria-hidden />
        )}
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : on ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        <span className="hidden sm:inline">{on ? "Listening" : "Voice"}</span>
      </button>

      {billTable && (
        <BillTableDialog branchId={branchId} table={billTable} open onOpenChange={(open) => !open && setBillTable(null)} />
      )}

      <Dialog open={!!reprint} onOpenChange={(open) => !open && setReprint(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {reprint?.label} — {reprint?.kind === "kot" ? "KOT" : "bill"} reprint karein?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">Order #{reprint?.orderNumber}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReprint(null)}>
              Cancel
            </Button>
            <Button onClick={confirmReprint}>{reprint?.kind === "kot" ? "Reprint KOT" : "Print bill"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
