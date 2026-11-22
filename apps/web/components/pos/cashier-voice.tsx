"use client";

// Hands-free cashier commands: "table 2", "table 2 paid", "table 2 KOT
// reprint", "table 2 bill reprint", "aaj ka best seller". Same pipeline as
// guest voice ordering (our backend -> Sarvam STT with auto language
// detection -> LLM -> zod-checked action). It only listens: no voice reply.
// Feedback is a short toast showing what was heard and what runs.
//
// Read/navigation runs at once (open a table, show best sellers). Anything
// that changes money or prints waits for an on-screen tap: "paid" opens the
// table's bill where the cashier picks the mode and presses Paid, and a
// reprint asks first.

import { Loader2, Mic } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast as sonner } from "sonner";
import { BillTableDialog } from "@/components/tables/bill-table-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useVoiceRecorder, type RecorderError } from "@/hooks/use-voice-recorder";
import type { RestaurantTable } from "@/hooks/use-tables";
import { api, ApiError } from "@/lib/api";
import { getActivePrintScope, reprintKot } from "@/lib/local-print";
import { openReceiptPrint } from "@/lib/print";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { audioForm, type CashierCommandResult, type Transcription } from "@/lib/voice-order";

export const BESTSELLERS_HREF = "/pos/bestsellers";

type Reprint = { kind: "kot" | "bill"; label: string; orderId: string; orderNumber: string };

const heardToast = (text: string) => sonner(text, { duration: 4_000 });

export function CashierVoice({ branchId, tables }: { branchId: string | null; tables: RestaurantTable[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [billTable, setBillTable] = useState<RestaurantTable | null>(null);
  const [reprint, setReprint] = useState<Reprint | null>(null);

  const run = (r: CashierCommandResult) => {
    const said = `Sun liya: “${r.heard}”`;
    if (r.action === "bestSellers") {
      heardToast("Sun liya: aaj ke best sellers dikha raha hoon");
      router.push(BESTSELLERS_HREF);
      return;
    }
    if (r.action === "unknown") {
      toast.error(`${said} — command samajh nahi aaya. Jaise bolein: “table 2 paid”.`);
      return;
    }
    if (!r.table) {
      toast.error(`${said} — table nahi mila.`);
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
      setBillTable(table);
      return;
    }
    if (!r.order) {
      toast.error(`${said} — ${label} par koi order nahi mila.`);
      return;
    }
    setReprint({ kind: r.action === "reprintKOT" ? "kot" : "bill", label, orderId: r.order.id, orderNumber: r.order.orderNumber });
  };

  const onAudio = async (blob: Blob) => {
    if (!branchId) return;
    setBusy(true);
    try {
      const stt = await api.postForm<Transcription>(`/voice-order/stt?branchId=${branchId}`, audioForm(blob));
      if (!stt.transcript) {
        toast.error("Kuch sunai nahi diya. Phir se bolein.");
        return;
      }
      run(await api.post<CashierCommandResult>(`/voice-order/cashier?branchId=${branchId}`, { transcript: stt.transcript }));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Voice command failed");
    } finally {
      setBusy(false);
    }
  };

  const onError = (e: RecorderError) =>
    toast.error(
      e === "denied"
        ? "Microphone blocked. Allow mic access for this site to use voice commands."
        : e === "silence"
          ? "Kuch sunai nahi diya. Phir se bolein."
          : "Voice commands are not available in this browser.",
    );

  const recorder = useVoiceRecorder({ onAudio: (b) => void onAudio(b), onError });

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

  if (recorder.supported === false) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
        disabled={busy || !branchId}
        aria-pressed={recorder.recording}
        title="Voice command: “table 2”, “table 2 paid”, “table 2 KOT reprint”, “best selling dish”"
        className={cn(
          "relative inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-60",
          recorder.recording
            ? "border-destructive bg-destructive text-white"
            : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
        {recorder.recording ? "Listening… tap to stop" : busy ? "Working…" : "Voice"}
      </button>

      {billTable && (
        <BillTableDialog
          branchId={branchId}
          table={billTable}
          open
          onOpenChange={(open) => !open && setBillTable(null)}
        />
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
