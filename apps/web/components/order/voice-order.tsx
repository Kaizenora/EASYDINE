"use client";

// Customer voice ordering on the QR menu page.
//
// Tap the mic, say the order (English, Hindi, Marathi or mixed; the language
// is detected automatically), and a confirm sheet shows what was understood.
// Nothing enters the cart until the guest confirms there: a missing quantity
// is asked ("Kitne Cheese Garlic Naan?"), a loose match is confirmed ("2
// Paneer Tikka, sahi hai?"), and a dish that is not on the menu offers the
// closest dishes to tap. Prices always come from the server's menu.
//
// Audio goes only to our own backend, which transcribes it and discards it.
// Without a mic (or permission) the guest simply orders from the menu, or
// types the order in the box below.

import { Check, Info, Loader2, Mic, Minus, Plus, Send, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useVoiceRecorder, type RecorderError } from "@/hooks/use-voice-recorder";
import { api, ApiError } from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { useI18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import {
  audioForm,
  MAX_VOICE_QTY,
  spokenQuantity,
  type ParsedVoiceOrder,
  type Transcription,
  type VoiceAddLine,
  type VoiceSuggestion,
} from "@/lib/voice-order";

export type { VoiceAddLine };

export interface VoiceMenuItem {
  id: string;
  /** true when the dish has a required option the guest must pick on screen. */
  needsChoice: boolean;
}

interface ReviewLine {
  key: number;
  menuItemId: string;
  name: string;
  unitPrice: number;
  quantity: number | null;
  /** false while a low-confidence match waits for "sahi hai?". */
  confirmed: boolean;
  note: string;
}

interface Unmatched {
  key: number;
  heard: string;
  suggestions: VoiceSuggestion[];
}

type Target = { kind: "order" } | { kind: "qty"; key: number };

// The sheet renders at page level (inside the page's light-theme wrapper):
// a sticky/blurred ancestor would otherwise trap "position: fixed".
function Floating({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.querySelector(".force-light") ?? document.body);
}

let nextKey = 0;

export function VoiceOrder({
  qrToken,
  menu,
  onAdd,
  onChooseOptions,
}: {
  qrToken: string;
  menu: VoiceMenuItem[];
  onAdd: (lines: VoiceAddLine[]) => void;
  onChooseOptions?: (itemId: string) => void;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<Target>({ kind: "order" });
  const [message, setMessage] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [heard, setHeard] = useState("");
  const [lines, setLines] = useState<ReviewLine[]>([]);
  const [unmatched, setUnmatched] = useState<Unmatched[]>([]);
  const reviewOpen = lines.length > 0 || unmatched.length > 0;
  const needsChoice = (id: string) => menu.find((m) => m.id === id)?.needsChoice ?? false;
  const base = `/public/menu/${qrToken}/voice-order`;

  const failMessage = (err: unknown) => {
    if (err instanceof ApiError && err.status === 404) return err.message;
    return t("voice.network");
  };

  const parse = async (transcript: string) => {
    setHeard((h) => (h ? `${h} · ${transcript}` : transcript));
    const res = await api.post<ParsedVoiceOrder>(`${base}/parse`, { transcript });
    if (res.items.length === 0 && res.unmatched.length === 0) {
      setMessage(t("voice.nothingMatched"));
      return;
    }
    setMessage(null);
    setLines((prev) => [
      ...prev,
      ...res.items.map((i) => ({
        key: ++nextKey,
        menuItemId: i.menuItemId,
        name: i.name,
        unitPrice: i.unitPrice,
        quantity: i.needsQuantity ? null : i.quantity,
        confirmed: i.confidence === "high",
        note: i.specialInstructions ?? "",
      })),
    ]);
    setUnmatched((prev) => [...prev, ...res.unmatched.map((u) => ({ key: ++nextKey, ...u }))]);
  };

  const onAudio = async (blob: Blob) => {
    setBusy(true);
    setMessage(null);
    try {
      const stt = await api.postForm<Transcription>(`${base}/stt`, audioForm(blob));
      if (!stt.transcript) {
        setMessage(t("voice.nothingHeard"));
        return;
      }
      if (target.kind === "qty") {
        const qty = spokenQuantity(stt.transcript);
        if (qty === null) setMessage(t("voice.nothingHeard"));
        else setQty(target.key, qty);
        return;
      }
      await parse(stt.transcript);
    } catch (err) {
      setMessage(failMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const onError = (e: RecorderError) =>
    setMessage(e === "denied" ? t("voice.denied") : e === "silence" ? t("voice.nothingHeard") : t("voice.unsupported"));

  const recorder = useVoiceRecorder({ onAudio: (b) => void onAudio(b), onError });

  const listen = (next: Target) => {
    if (recorder.recording) {
      recorder.stop();
      return;
    }
    setTarget(next);
    setMessage(null);
    void recorder.start();
  };

  const submitTyped = async () => {
    const text = typed.trim();
    if (!text || busy) return;
    setBusy(true);
    setMessage(null);
    try {
      await parse(text);
      setTyped("");
    } catch (err) {
      setMessage(failMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const setQty = (key: number, qty: number) =>
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, quantity: Math.min(MAX_VOICE_QTY, Math.max(1, qty)) } : l)));
  const patch = (key: number, p: Partial<ReviewLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const removeLine = (key: number) => setLines((ls) => ls.filter((l) => l.key !== key));

  const pickSuggestion = (u: Unmatched, s: VoiceSuggestion) => {
    setUnmatched((us) => us.filter((x) => x.key !== u.key));
    setLines((ls) => [
      ...ls,
      { key: ++nextKey, menuItemId: s.menuItemId, name: s.name, unitPrice: s.unitPrice, quantity: null, confirmed: true, note: "" },
    ]);
  };

  const close = () => {
    recorder.cancel();
    setLines([]);
    setUnmatched([]);
    setHeard("");
    setMessage(null);
  };

  const simple = lines.filter((l) => !needsChoice(l.menuItemId));
  const withOptions = lines.filter((l) => needsChoice(l.menuItemId));
  const pending = simple.some((l) => l.quantity === null || !l.confirmed) || unmatched.length > 0;
  const addCount = simple.reduce((n, l) => n + (l.quantity ?? 0), 0);

  const confirm = () => {
    if (pending) return;
    onAdd(simple.map((l) => ({ itemId: l.menuItemId, quantity: l.quantity ?? 0, note: l.note.trim() })));
    const first = withOptions[0];
    close();
    // Dishes with required options are picked on the normal options screen.
    if (first) onChooseOptions?.(first.menuItemId);
  };

  const listeningForOrder = recorder.recording && target.kind === "order";

  return (
    <div className="mt-3 rounded-2xl border border-primary/25 bg-accent/60 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => listen({ kind: "order" })}
          disabled={busy || recorder.supported === false}
          aria-label={listeningForOrder ? t("voice.stop") : t("voice.micLabel")}
          aria-pressed={listeningForOrder}
          className={cn(
            "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-md transition-all disabled:opacity-60",
            listeningForOrder ? "bg-destructive text-white" : "bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]",
          )}
        >
          {listeningForOrder && <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" aria-hidden />}
          {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Mic className="relative h-6 w-6" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">
            {listeningForOrder ? t("voice.recording") : busy ? t("voice.working") : t("voice.title")}
          </p>
          <p className="text-[11px] leading-snug text-muted-foreground">{t("voice.hint")}</p>
        </div>
      </div>

      <form
        className="mt-2.5 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void submitTyped();
        }}
      >
        <input
          type="text"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          maxLength={600}
          placeholder={t("voice.typeInstead")}
          aria-label={t("voice.typeInstead")}
          className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !typed.trim()}
          aria-label={t("voice.send")}
          className="flex items-center justify-center rounded-xl bg-primary px-3 text-primary-foreground disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {message && !reviewOpen && (
        <p role="status" className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-card px-3 py-2 text-xs leading-snug text-foreground">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{message}</span>
        </p>
      )}
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{t("voice.privacy")}</p>

      {reviewOpen && renderReview()}
    </div>
  );

  function renderReview() {
    return (
      <Floating>
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" role="dialog" aria-modal aria-label={t("voice.reviewTitle")}>
          <div className="flex max-h-[88dvh] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <p className="flex-1 text-base font-bold text-foreground">{t("voice.reviewTitle")}</p>
              <button type="button" onClick={close} aria-label={t("voice.close")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
              {heard && <p className="text-xs italic text-muted-foreground">{t("voice.heard", { text: heard })}</p>}

              {lines.map((l) => (
                <div key={l.key} className="rounded-2xl border border-border p-3">
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-foreground">{l.name}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        {formatCurrency(l.unitPrice)}
                        {l.quantity !== null && ` × ${l.quantity} = ${formatCurrency(l.unitPrice * l.quantity)}`}
                      </p>
                    </div>
                    <button type="button" onClick={() => removeLine(l.key)} aria-label={t("voice.remove")} className="rounded-lg p-1 text-muted-foreground hover:bg-secondary">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {needsChoice(l.menuItemId) ? (
                    <p className="mt-2 text-xs text-muted-foreground">{t("voice.needsChoice", { name: l.name })}</p>
                  ) : l.quantity === null ? (
                    <div className="mt-2 rounded-xl border border-primary/30 bg-primary/5 p-2.5">
                      <p className="text-sm font-bold text-foreground">{t("voice.howMany", { name: l.name })}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setQty(l.key, n)}
                            className="h-9 w-10 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:border-primary hover:bg-primary/10"
                          >
                            {n}
                          </button>
                        ))}
                        <button
                          type="button"
                          onClick={() => listen({ kind: "qty", key: l.key })}
                          disabled={busy}
                          className={cn(
                            "ml-auto inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-xs font-bold",
                            recorder.recording && target.kind === "qty" && target.key === l.key
                              ? "bg-destructive text-white"
                              : "bg-primary text-primary-foreground",
                          )}
                        >
                          <Mic className="h-3.5 w-3.5" />
                          {t("voice.sayNumber")}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center gap-2">
                      <button type="button" onClick={() => setQty(l.key, (l.quantity ?? 1) - 1)} aria-label="-" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border">
                        <Minus className="h-3.5 w-3.5" />
                      </button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums">{l.quantity}</span>
                      <button type="button" onClick={() => setQty(l.key, (l.quantity ?? 0) + 1)} aria-label="+" className="flex h-8 w-8 items-center justify-center rounded-lg border border-border">
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  {!l.confirmed && !needsChoice(l.menuItemId) && (
                    <div className="mt-2 flex items-center gap-2 rounded-xl bg-amber-500/10 p-2.5">
                      <p className="flex-1 text-sm font-semibold text-foreground">
                        {t("voice.confirmLow", { qty: l.quantity ?? "", name: l.name }).trim()}
                      </p>
                      <button type="button" onClick={() => patch(l.key, { confirmed: true })} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                        <Check className="h-3.5 w-3.5" />
                        {t("voice.yes")}
                      </button>
                    </div>
                  )}

                  {!needsChoice(l.menuItemId) && (
                    <input
                      type="text"
                      value={l.note}
                      onChange={(e) => patch(l.key, { note: e.target.value.slice(0, 120) })}
                      placeholder={t("voice.notePlaceholder")}
                      className="mt-2 w-full rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
                    />
                  )}
                </div>
              ))}

              {unmatched.map((u) => (
                <div key={u.key} className="rounded-2xl border border-dashed border-border p-3">
                  <div className="flex items-start gap-2">
                    <p className="flex-1 text-sm font-semibold text-foreground">{t("voice.pickClosest", { heard: u.heard })}</p>
                    <button
                      type="button"
                      onClick={() => setUnmatched((us) => us.filter((x) => x.key !== u.key))}
                      aria-label={t("voice.noneOfThese")}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-secondary"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {u.suggestions.map((s) => (
                      <button
                        key={s.menuItemId}
                        type="button"
                        onClick={() => pickSuggestion(u, s)}
                        className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary hover:bg-primary/10"
                      >
                        {s.name} · {formatCurrency(s.unitPrice)}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setUnmatched((us) => us.filter((x) => x.key !== u.key))}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-secondary"
                    >
                      {t("voice.noneOfThese")}
                    </button>
                  </div>
                </div>
              ))}

              {message && (
                <p role="status" className="flex items-start gap-1.5 rounded-xl bg-secondary px-3 py-2 text-xs text-foreground">
                  <Info className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>{message}</span>
                </p>
              )}
            </div>

            <div className="space-y-2 border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => listen({ kind: "order" })}
                  disabled={busy || recorder.supported === false}
                  aria-label={listeningForOrder ? t("voice.stop") : t("voice.micLabel")}
                  className={cn(
                    "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl disabled:opacity-50",
                    listeningForOrder ? "bg-destructive text-white" : "bg-secondary text-foreground",
                  )}
                >
                  {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  onClick={confirm}
                  disabled={pending || (simple.length === 0 && withOptions.length === 0)}
                  className="flex h-12 flex-1 items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground disabled:opacity-50"
                >
                  {simple.length > 0 ? t("voice.addToCart", { count: addCount }) : t("voice.chooseOptions")}
                </button>
              </div>
              {pending && <p className="text-center text-[11px] text-muted-foreground">{t("voice.resolveFirst")}</p>}
            </div>
          </div>
        </div>
      </Floating>
    );
  }
}
