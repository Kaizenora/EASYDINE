"use client";

// Customer voice ordering for the QR menu page. Free browser Web Speech API
// only. The app never records or keeps audio: it receives text from the
// browser's speech engine (which may send audio to its vendor, e.g. Google or
// Apple, as the privacy line says), parses it against this restaurant's
// loaded menu, and shows a review sheet. Nothing reaches the cart until the
// guest taps "Add to cart"; the order is still placed only through the
// page's existing Confirm Order modal.

import { Check, Info, Mic, MicOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { LOCALE_LABELS, LOCALES, useI18n, type Locale } from "@/lib/i18n/context";
import {
  createFinalTranscriptGate,
  parseVoiceOrder,
  RECOGNITION_LANG,
  type VoiceMenuItem,
  type VoiceResult,
} from "@/lib/voice-order";

export interface VoiceAddLine {
  itemId: string;
  quantity: number;
  note: string;
}

interface Row {
  key: number;
  res: VoiceResult;
  itemId: string | null;
  name: string;
  unitPrice: number;
  qty: number | null;
  note: string;
  selected: boolean;
  dismissed: boolean;
}

type Phase = "idle" | "listening" | "review";

// Minimal Web Speech API types (not in TypeScript's DOM lib everywhere).
interface SpeechAlt { transcript: string }
interface SpeechRes { isFinal: boolean; 0: SpeechAlt }
interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechRes> }
interface SpeechErrorEvent { error?: string }
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: SpeechErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Sheets render at page level: a sticky/blurred ancestor would otherwise trap
// "position: fixed" inside it. They go into the page's light-theme wrapper.
function Sheet({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  const host = document.querySelector(".force-light") ?? document.body;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center">{children}</div>,
    host,
  );
}

function money(n: number) {
  return `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

export function VoiceOrder({
  menu,
  onAdd,
  onChooseOptions,
}: {
  menu: VoiceMenuItem[];
  onAdd: (lines: VoiceAddLine[]) => void;
  onChooseOptions: (itemId: string) => void;
}) {
  const { locale, setLocale, t } = useI18n();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);

  useEffect(() => {
    // Detected after mount so the server render and first paint match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!getRecognitionCtor());
    return () => recRef.current?.abort?.();
  }, []);

  const byId = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);

  const start = () => {
    setMessage(null);
    const Ctor = getRecognitionCtor();
    if (!Ctor) {
      setSupported(false);
      setMessage(t("voice.unsupported"));
      return;
    }
    let rec: Recognition;
    try {
      rec = new Ctor();
    } catch {
      setSupported(false);
      setMessage(t("voice.unsupported"));
      return;
    }
    recRef.current = rec;
    const gate = createFinalTranscriptGate();
    const finals: string[] = [];
    let failed = false;
    rec.lang = RECOGNITION_LANG[locale as Locale];
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e: SpeechEvent) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) {
          if (gate.accept(i, text, true)) finals.push(text.trim());
        } else live += text;
      }
      setInterim(live);
    };
    rec.onerror = (e: SpeechErrorEvent) => {
      failed = true;
      const code = e?.error;
      if (code === "not-allowed" || code === "service-not-allowed") setMessage(t("voice.denied"));
      else if (code === "language-not-supported") setMessage(t("voice.langUnsupported", { language: LOCALE_LABELS[locale as Locale] }));
      else if (code === "network") setMessage(t("voice.network"));
      else if (code === "no-speech") setMessage(t("voice.noSpeech"));
      else if (code !== "aborted") setMessage(t("voice.unsupported"));
    };
    rec.onend = () => {
      recRef.current = null;
      setInterim("");
      const text = finals.join(", ");
      if (!text) {
        setPhase("idle");
        if (!failed) setMessage(t("voice.noSpeech"));
        return;
      }
      const parsed = parseVoiceOrder(text, menu);
      setHeard(text);
      setRows(
        parsed.map((res, key) => {
          const one = res.kind === "add" || res.kind === "quantity";
          return {
            key,
            res,
            itemId: one ? res.itemId : null,
            name: one ? res.name : "",
            unitPrice: one ? res.unitPrice : 0,
            qty: res.kind === "add" ? res.quantity : res.kind === "choose" ? res.quantity : null,
            note: res.kind === "add" || res.kind === "quantity" || res.kind === "choose" ? res.note : "",
            selected: res.kind === "add",
            dismissed: false,
          };
        }),
      );
      setPhase("review");
    };
    setInterim("");
    setPhase("listening");
    try {
      rec.start();
    } catch {
      setPhase("idle");
      setMessage(t("voice.unsupported"));
    }
  };

  const stop = () => recRef.current?.stop?.();

  const close = () => {
    // Only text was ever held; drop it.
    setRows([]);
    setHeard("");
    setPhase("idle");
  };

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const ready = rows.filter((r) => r.selected && !r.dismissed && r.itemId && r.qty && r.qty > 0);

  const addToCart = () => {
    if (!ready.length) return;
    onAdd(ready.map((r) => ({ itemId: r.itemId!, quantity: r.qty!, note: r.note.trim() })));
    setMessage(t("voice.added"));
    close();
  };

  const langLabel: Record<Locale, string> = { en: "EN", hi: "हिं", mr: "मरा" };

  return (
    <div className="mt-3 rounded-2xl border border-primary/25 bg-accent/60 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={start}
          aria-label={t("voice.micLabel")}
          className={cn(
            "flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-md transition-all",
            supported === false ? "bg-secondary text-muted-foreground" : "bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]",
          )}
        >
          {supported === false ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">{t("voice.title")}</p>
          <p className="text-[11px] leading-snug text-muted-foreground">{t("voice.hint")}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{t("voice.language")}</span>
        <div role="radiogroup" aria-label={t("voice.language")} className="flex gap-1">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={locale === l}
              title={LOCALE_LABELS[l]}
              onClick={() => setLocale(l)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-bold transition-all",
                locale === l ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground hover:border-primary/40",
              )}
            >
              {langLabel[l]}
            </button>
          ))}
        </div>
      </div>
      {(supported === false || message) && (
        <p role="status" className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-card px-3 py-2 text-[11px] leading-snug text-foreground">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{message ?? t("voice.unsupported")}</span>
        </p>
      )}
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{t("voice.privacy")}</p>

      {phase === "listening" && (
        <Sheet>
          <div role="dialog" aria-modal="true" aria-label={t("voice.listening")} className="w-full max-w-md rounded-t-3xl bg-card p-6 text-center shadow-2xl sm:rounded-3xl">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-primary text-primary-foreground animate-pulse">
              <Mic className="h-9 w-9" />
            </div>
            <p className="mt-4 text-base font-bold text-foreground">{t("voice.listening")}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {LOCALE_LABELS[locale as Locale]} · {RECOGNITION_LANG[locale as Locale]}
            </p>
            <p className="mt-3 min-h-[3rem] rounded-xl bg-secondary px-3 py-2 text-sm text-foreground">{interim || "…"}</p>
            <button
              type="button"
              onClick={stop}
              className="mt-4 h-11 w-full rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-[var(--primary-hover)]"
            >
              {t("voice.stop")}
            </button>
          </div>
        </Sheet>
      )}

      {phase === "review" && (
        <Sheet>
          <div role="dialog" aria-modal="true" aria-label={t("voice.review")} className="flex max-h-[88vh] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h3 className="text-base font-bold text-foreground">{t("voice.review")}</h3>
              <button type="button" onClick={close} aria-label={t("voice.cancel")} className="rounded-full p-1 text-muted-foreground hover:bg-secondary">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
              <p className="text-[11px] text-muted-foreground">
                {t("voice.heard")}: <span className="font-semibold text-foreground">“{heard}”</span>
              </p>
              {rows.length === 0 && <p className="text-sm text-foreground">{t("voice.nothing")}</p>}
              {rows.map((r) => (
                <ReviewRow key={r.key} row={r} byId={byId} t={t} update={update} onChooseOptions={(id) => { close(); onChooseOptions(id); }} />
              ))}
            </div>
            <div className="flex gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => { close(); start(); }}
                className="h-11 flex-1 rounded-xl border border-border bg-card text-sm font-bold text-foreground hover:bg-secondary"
              >
                {t("voice.tryAgain")}
              </button>
              <button
                type="button"
                disabled={!ready.length}
                onClick={addToCart}
                className="h-11 flex-[1.4] rounded-xl bg-primary text-sm font-bold text-primary-foreground hover:bg-[var(--primary-hover)] disabled:opacity-40"
              >
                {t("voice.addToCart", { count: ready.reduce((n, r) => n + (r.qty ?? 0), 0) })}
              </button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function QtyPicker({ onPick }: { onPick: (n: number) => void }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <button key={n} type="button" onClick={() => onPick(n)} className="h-9 w-10 rounded-lg border border-border bg-card text-sm font-bold text-foreground hover:border-primary">
          {n}
        </button>
      ))}
    </div>
  );
}

function ReviewRow({
  row,
  byId,
  t,
  update,
  onChooseOptions,
}: {
  row: Row;
  byId: Map<string, VoiceMenuItem>;
  t: (k: string, v?: Record<string, string | number>) => string;
  update: (key: number, patch: Partial<Row>) => void;
  onChooseOptions: (itemId: string) => void;
}) {
  const { res } = row;
  if (row.dismissed) return null;

  if (res.kind === "skipped") {
    return <p className="text-[11px] italic text-muted-foreground">{t("voice.skipped", { heard: res.heard })}</p>;
  }

  if (res.kind === "unavailable") {
    const name = res.name ?? "";
    const msg =
      res.reason === "not_on_menu" ? t("voice.notOnMenu", { heard: res.heard })
      : res.reason === "sold_out" ? t("voice.soldOut", { name })
      : res.reason === "needs_choice" ? t("voice.needsChoice", { name })
      : res.reason === "variant" ? t("voice.variant", { name })
      : t("voice.modifier", { name });
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2.5 text-xs text-foreground">
        <p className="flex items-start gap-1.5"><Info className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />{msg}</p>
        {res.itemId && res.reason !== "sold_out" && byId.has(res.itemId) && (
          <button type="button" onClick={() => onChooseOptions(res.itemId!)} className="mt-2 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
            {t("voice.chooseOptions")}
          </button>
        )}
      </div>
    );
  }

  // A dish still to be chosen from a short pick list.
  if (res.kind === "choose" && !row.itemId) {
    return (
      <div className="rounded-xl border border-border bg-background px-3 py-2.5">
        <p className="text-xs font-bold text-foreground">{t("voice.didYouMean")}</p>
        <p className="text-[11px] text-muted-foreground">“{res.heard}”</p>
        <div className="mt-2 flex flex-col gap-1.5">
          {res.options.map((o) => (
            <button
              key={o.itemId}
              type="button"
              onClick={() => update(row.key, { itemId: o.itemId, name: o.name, unitPrice: o.unitPrice, selected: row.qty !== null })}
              className="flex items-center justify-between rounded-lg border border-border bg-card px-3 py-2 text-left text-sm font-semibold text-foreground hover:border-primary"
            >
              <span>{o.name}</span>
              <span className="text-xs text-muted-foreground">{money(o.unitPrice)}</span>
            </button>
          ))}
          <button type="button" onClick={() => update(row.key, { dismissed: true })} className="rounded-lg px-3 py-1.5 text-left text-xs font-semibold text-muted-foreground hover:bg-secondary">
            {t("voice.noneOfThese")}
          </button>
        </div>
      </div>
    );
  }

  // A dish is known; quantity may still be missing.
  if (row.qty === null) {
    return (
      <div className="rounded-xl border border-border bg-background px-3 py-2.5">
        <p className="text-xs font-bold text-foreground">{t("voice.howMany", { name: row.name })}</p>
        <QtyPicker onPick={(n) => update(row.key, { qty: n, selected: true })} />
        <button type="button" onClick={() => update(row.key, { dismissed: true })} className="mt-1.5 text-[11px] font-semibold text-muted-foreground">
          {t("voice.noneOfThese")}
        </button>
      </div>
    );
  }

  return (
    <div className={cn("rounded-xl border px-3 py-2.5", row.selected ? "border-primary/40 bg-accent/50" : "border-border bg-background opacity-70")}>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          role="checkbox"
          aria-checked={row.selected}
          onClick={() => update(row.key, { selected: !row.selected })}
          className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2", row.selected ? "border-primary bg-primary text-primary-foreground" : "border-border")}
        >
          {row.selected && <Check className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-foreground">{row.name}</p>
          <p className="text-[11px] text-muted-foreground">{money(row.unitPrice)} × {row.qty} = {money(row.unitPrice * row.qty)}</p>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-1.5">
          <button type="button" aria-label="−" onClick={() => update(row.key, { qty: Math.max(1, row.qty! - 1) })} className="px-1.5 py-1 text-base font-bold text-foreground">−</button>
          <span className="w-4 text-center text-sm font-bold text-foreground">{row.qty}</span>
          <button type="button" aria-label="+" onClick={() => update(row.key, { qty: Math.min(20, row.qty! + 1) })} className="px-1.5 py-1 text-base font-bold text-foreground">+</button>
        </div>
      </div>
      <label className="mt-2 block">
        <span className="sr-only">{t("voice.note")}</span>
        <input
          value={row.note}
          maxLength={120}
          placeholder={t("voice.note")}
          onChange={(e) => update(row.key, { note: e.target.value })}
          className="h-9 w-full rounded-lg border border-border bg-card px-3 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
        />
      </label>
    </div>
  );
}
