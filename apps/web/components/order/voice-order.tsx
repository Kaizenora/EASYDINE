"use client";

// Customer voice ordering for the QR menu page (free browser Web Speech API).
//
// Hands-free: tap the mic once, then browse the menu and say dishes as you
// go. The mic stays on (it restarts itself after pauses) until the guest taps
// Stop or it has been quiet for a while. Each dish that clearly matches this
// restaurant's menu goes straight into the normal cart; anything unclear
// waits in the bottom bar as a quick pick. The cart stays editable and the
// order is still placed only through the page's Confirm Order modal.
//
// The app never records or keeps audio; it receives text from the browser's
// speech engine, which may send audio to its vendor (e.g. Google or Apple).

import { Check, Info, Mic, MicOff, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { LOCALE_LABELS, LOCALES, useI18n, type Locale } from "@/lib/i18n/context";
import {
  createUtteranceTracker,
  IS_DEV,
  parseVoiceOrder,
  RECOGNITION_LANG,
  transliterate,
  type VoiceMenuItem,
  type VoiceResult,
} from "@/lib/voice-order";

export interface VoiceAddLine {
  itemId: string;
  quantity: number;
  note: string;
}

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
  grammars?: unknown;
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

const nowMs = () => Date.now();
const IDLE_STOP_MS = 20_000; // quiet this long -> stop listening
const MAX_SESSION_MS = 180_000; // never keep the mic on longer than this

interface Pending {
  key: number;
  res: Exclude<VoiceResult, { kind: "add" } | { kind: "skipped" }>;
  itemId: string | null;
  name: string;
  qty: number | null;
  note: string;
}
interface Recent {
  key: number;
  name: string;
  qty: number;
  note: string;
}

function money(n: number) {
  return `₹${Number.isInteger(n) ? n : n.toFixed(2)}`;
}

// The bar renders at page level (inside the page's light-theme wrapper):
// a sticky/blurred ancestor would otherwise trap "position: fixed".
function Floating({ children }: { children: ReactNode }) {
  if (typeof document === "undefined") return null;
  return createPortal(children, document.querySelector(".force-light") ?? document.body);
}

export function VoiceOrder({
  menu,
  onAdd,
  onChooseOptions,
  bottomOffset = 16,
}: {
  menu: VoiceMenuItem[];
  onAdd: (lines: VoiceAddLine[]) => void;
  onChooseOptions: (itemId: string) => void;
  bottomOffset?: number;
}) {
  const { locale, setLocale, t } = useI18n();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const [interim, setInterim] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const pendingQtyRef = useRef<{ qty: number; at: number } | null>(null);

  const session = useRef({
    active: false,
    rec: null as Recognition | null,
    tracker: createUtteranceTracker(),
    idle: null as ReturnType<typeof setTimeout> | null,
    startedAt: 0,
    key: 0,
  });
  // Latest values for the long-lived recognition callbacks.
  const live = useRef({ menu, onAdd, locale, t });
  useEffect(() => {
    live.current = { menu, onAdd, locale, t };
  }, [menu, onAdd, locale, t]);

  useEffect(() => {
    // Detected after mount so the server render and first paint match.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(!!getRecognitionCtor());
    const s = session.current;
    return () => {
      s.active = false;
      if (s.idle) clearTimeout(s.idle);
      s.rec?.abort();
    };
  }, []);

  const byId = useMemo(() => new Map(menu.map((m) => [m.id, m])), [menu]);

  const stopListening = (msg?: string) => {
    const s = session.current;
    s.active = false;
    pendingQtyRef.current = null;
    if (s.idle) clearTimeout(s.idle);
    s.idle = null;
    s.rec?.stop();
    setListening(false);
    setInterim("");
    if (msg) setMessage(msg);
  };

  const armIdle = () => {
    const s = session.current;
    if (s.idle) clearTimeout(s.idle);
    s.idle = setTimeout(() => stopListening(live.current.t("voice.idle")), IDLE_STOP_MS);
  };

  const handleText = (text: string) => {
    const s = session.current;
    const { menu: m, onAdd: add } = live.current;
    const currentPendingQty =
      pendingQtyRef.current && nowMs() - pendingQtyRef.current.at < 6000
        ? pendingQtyRef.current.qty
        : 1;
    const results = parseVoiceOrder(text, m, currentPendingQty);
    const adds: VoiceAddLine[] = [];
    const added: Recent[] = [];
    const asks: Pending[] = [];
    for (const r of results) {
      if (r.kind === "skipped") {
        const pQty = (r as { pendingQty?: number }).pendingQty;
        if (pQty && pQty >= 1) {
          pendingQtyRef.current = { qty: pQty, at: nowMs() };
        }
        continue;
      }
      if (r.kind === "add") {
        adds.push({ itemId: r.itemId, quantity: r.quantity, note: r.note });
        added.push({ key: ++s.key, name: r.name, qty: r.quantity, note: r.note });
      } else {
        const one = r.kind === "quantity";
        asks.push({
          key: ++s.key,
          res: r,
          itemId: one ? r.itemId : null,
          name: one ? r.name : r.kind === "unavailable" ? (r.name ?? "") : "",
          qty: r.kind === "choose" ? (r.quantity ?? 1) : null,
          note: r.kind === "choose" || r.kind === "quantity" ? r.note : "",
        });
      }
    }
    if (adds.length) {
      pendingQtyRef.current = null;
      add(adds);
    }
    if (added.length) setRecent((rs) => [...added.reverse(), ...rs].slice(0, 4));
    if (asks.length) setPending((ps) => [...ps, ...asks]);
  };

  const spawn = () => {
    const s = session.current;
    const Ctor = getRecognitionCtor();
    if (!Ctor || !s.active) return;
    if (nowMs() - s.startedAt > MAX_SESSION_MS) {
      stopListening(live.current.t("voice.idle"));
      return;
    }
    let rec: Recognition;
    try {
      rec = new Ctor();
    } catch {
      stopListening(live.current.t("voice.unsupported"));
      setSupported(false);
      return;
    }
    s.rec = rec;
    s.tracker.reset();
    rec.lang = RECOGNITION_LANG[live.current.locale as Locale];
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    // Prioritize recognizing this restaurant's specific menu dishes in the browser speech engine
    try {
      const SpeechGrammarList =
        (window as unknown as { SpeechGrammarList?: new () => any; webkitSpeechGrammarList?: new () => any }).SpeechGrammarList ||
        (window as unknown as { SpeechGrammarList?: new () => any; webkitSpeechGrammarList?: new () => any }).webkitSpeechGrammarList;
      if (SpeechGrammarList && live.current.menu.length > 0) {
        const grammarList = new SpeechGrammarList();
        const dishNames = new Set<string>();
        for (const it of live.current.menu) {
          if (!it.name) continue;
          const clean = it.name.replace(/[<>;=*+?^$|[\](){}!/\\,."']/g, " ").replace(/\s+/g, " ").trim();
          if (clean) dishNames.add(clean);
          if (IS_DEV.test(it.name)) {
            const tr = transliterate(it.name).replace(/[<>;=*+?^$|[\](){}!/\\,."']/g, " ").replace(/\s+/g, " ").trim();
            if (tr) dishNames.add(tr);
          }
        }
        if (dishNames.size > 0) {
          const grammar = `#JSGF V1.0 UTF-8; grammar menuDishes; public <dish> = ${Array.from(dishNames).join(" | ")} ;`;
          grammarList.addFromString(grammar, 1);
          rec.grammars = grammarList;
        }
      }
    } catch {
      // SpeechGrammarList is an optional hint; proceed safely if not supported
    }
    rec.onresult = (e: SpeechEvent) => {
      armIdle();
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) {
          const fresh = s.tracker.accept(i, text, true, nowMs());
          if (fresh) handleText(fresh);
        } else partial += text;
      }
      setInterim(partial);
    };
    rec.onerror = (e: SpeechErrorEvent) => {
      const code = e?.error;
      const tt = live.current.t;
      if (code === "not-allowed" || code === "service-not-allowed") stopListening(tt("voice.denied"));
      else if (code === "language-not-supported") stopListening(tt("voice.langUnsupported", { language: LOCALE_LABELS[live.current.locale as Locale] }));
      else if (code === "network") stopListening(tt("voice.network"));
      // "no-speech" and "aborted": keep the session; onend restarts it.
    };
    rec.onend = () => {
      if (s.rec === rec) s.rec = null;
      if (s.active) setTimeout(spawn, 120); // keep holding the mic
    };
    try {
      rec.start();
    } catch {
      stopListening(live.current.t("voice.unsupported"));
    }
  };

  const start = () => {
    setMessage(null);
    if (!getRecognitionCtor()) {
      setSupported(false);
      setMessage(t("voice.unsupported"));
      return;
    }
    const s = session.current;
    s.active = true;
    s.startedAt = nowMs();
    s.tracker = createUtteranceTracker();
    pendingQtyRef.current = null;
    setRecent([]);
    setPending([]);
    setInterim("");
    setListening(true);
    setBarOpen(true);
    armIdle();
    spawn();
  };

  // Changing the language while listening restarts recognition in it.
  useEffect(() => {
    const s = session.current;
    if (s.active) s.rec?.abort();
  }, [locale]);

  const closeBar = () => {
    stopListening();
    setBarOpen(false);
    setPending([]);
    setRecent([]);
  };

  const resolve = (p: Pending, itemId: string, name: string, qty: number) => {
    onAdd([{ itemId, quantity: qty, note: p.note.trim() }]);
    setRecent((rs) => [{ key: ++session.current.key, name, qty, note: p.note.trim() }, ...rs].slice(0, 4));
    setPending((ps) => ps.filter((x) => x.key !== p.key));
  };
  const dismiss = (key: number) => setPending((ps) => ps.filter((x) => x.key !== key));

  const langLabel: Record<Locale, string> = { en: "EN", hi: "हिं", mr: "मरा" };
  const langPicker = (
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
  );

  // While listening the bottom bar has the controls; keep the header slim so
  // the guest can browse the menu.
  if (listening) {
    return (
      <div className="mt-3 flex items-center gap-2.5 rounded-2xl border border-primary/25 bg-accent/60 px-3 py-2">
        <button
          type="button"
          onClick={() => stopListening()}
          aria-label={t("voice.stop")}
          aria-pressed
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive text-white"
        >
          <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" aria-hidden />
          <Mic className="relative h-4 w-4" />
        </button>
        <p className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">{t("voice.listeningBrowse")}</p>
        {langPicker}
        {barOpen && renderBar()}
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl border border-primary/25 bg-accent/60 p-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={listening ? () => stopListening() : start}
          aria-label={listening ? t("voice.stop") : t("voice.micLabel")}
          aria-pressed={listening}
          className={cn(
            "relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full shadow-md transition-all",
            supported === false ? "bg-secondary text-muted-foreground" : listening ? "bg-destructive text-white" : "bg-primary text-primary-foreground hover:bg-[var(--primary-hover)]",
          )}
        >
          {listening && <span className="absolute inset-0 animate-ping rounded-full bg-destructive/40" aria-hidden />}
          {supported === false ? <MicOff className="h-6 w-6" /> : <Mic className="relative h-6 w-6" />}
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">{listening ? t("voice.listeningBrowse") : t("voice.title")}</p>
          <p className="text-[11px] leading-snug text-muted-foreground">{t("voice.hint")}</p>
        </div>
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <span className="text-[11px] font-semibold text-muted-foreground">{t("voice.language")}</span>
        {langPicker}
      </div>
      {(supported === false || message) && (
        <p role="status" className="mt-2.5 flex items-start gap-1.5 rounded-xl bg-card px-3 py-2 text-[11px] leading-snug text-foreground">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-primary" />
          <span>{message ?? t("voice.unsupported")}</span>
        </p>
      )}
      <p className="mt-2 text-[10px] leading-snug text-muted-foreground">{t("voice.privacy")}</p>

      {barOpen && renderBar()}
    </div>
  );

  function renderBar() {
    return (
        <Floating>
          <div className="pointer-events-none fixed inset-x-0 z-[55] flex justify-center px-3" style={{ bottom: bottomOffset }}>
            <div role="region" aria-live="polite" aria-label={t("voice.title")} className="pointer-events-auto w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl">
              <div className="flex items-center gap-2.5 px-3.5 pt-3">
                <span className={cn("relative flex h-3 w-3", listening ? "" : "opacity-40")} aria-hidden>
                  {listening && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60" />}
                  <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
                </span>
                <p className="min-w-0 flex-1 truncate text-xs font-bold text-foreground">
                  {listening ? t("voice.listeningBrowse") : t("voice.stopped")}
                  <span className="ml-1.5 font-semibold text-muted-foreground">· {LOCALE_LABELS[locale as Locale]}</span>
                </p>
                {listening ? (
                  <button type="button" onClick={() => stopListening()} className="rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-white">
                    {t("voice.stop")}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={start} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                      <Mic className="mr-1 inline h-3.5 w-3.5" />
                      {t("voice.resume")}
                    </button>
                    <button type="button" onClick={closeBar} aria-label={t("voice.close")} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary">
                      <X className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
              <div className="max-h-[42vh] space-y-2 overflow-y-auto px-3.5 pb-3 pt-2">
                {listening && (
                  <p className="min-h-[1.25rem] text-xs italic text-muted-foreground">{interim || "…"}</p>
                )}
                {recent.map((r) => (
                  <p key={r.key} className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <Check className="h-3.5 w-3.5 shrink-0 text-success" />
                    <span className="truncate">
                      {t("voice.addedItem", { qty: r.qty, name: r.name })}
                      {r.note ? <span className="font-normal text-muted-foreground"> · “{r.note}”</span> : null}
                    </span>
                  </p>
                ))}
                {recent.length > 0 && !pending.length && !listening && (
                  <p className="text-[11px] text-muted-foreground">{t("voice.inCart")}</p>
                )}
                {pending.map((p) => (
                  <PendingRow key={p.key} p={p} byId={byId} t={t} onResolve={resolve} onDismiss={dismiss} onChooseOptions={onChooseOptions} />
                ))}
              </div>
            </div>
          </div>
        </Floating>
    );
  }
}

function PendingRow({
  p,
  byId,
  t,
  onResolve,
  onDismiss,
  onChooseOptions,
}: {
  p: Pending;
  byId: Map<string, VoiceMenuItem>;
  t: (k: string, v?: Record<string, string | number>) => string;
  onResolve: (p: Pending, itemId: string, name: string, qty: number) => void;
  onDismiss: (key: number) => void;
  onChooseOptions: (itemId: string) => void;
}) {
  const { res } = p;
  const close = (
    <button type="button" onClick={() => onDismiss(p.key)} aria-label={t("voice.noneOfThese")} className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-secondary">
      <X className="h-3.5 w-3.5" />
    </button>
  );

  if (res.kind === "unavailable") {
    const name = res.name ?? "";
    const msg =
      res.reason === "not_on_menu" ? t("voice.notOnMenu", { heard: res.heard })
      : res.reason === "sold_out" ? t("voice.soldOut", { name })
      : res.reason === "needs_choice" ? t("voice.needsChoice", { name })
      : res.reason === "variant" ? t("voice.variant", { name })
      : t("voice.modifier", { name });
    return (
      <div className="rounded-xl border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground">
        <div className="flex items-start gap-1.5">
          <Info className="mt-px h-3.5 w-3.5 shrink-0 text-warning" />
          <span className="flex-1">{msg}</span>
          {close}
        </div>
        {res.itemId && res.reason !== "sold_out" && byId.has(res.itemId) && (
          <button type="button" onClick={() => { onDismiss(p.key); onChooseOptions(res.itemId!); }} className="mt-1.5 rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">
            {t("voice.chooseOptions")}
          </button>
        )}
      </div>
    );
  }

  if (res.kind === "choose") {
    return (
      <div className="rounded-xl border border-border bg-background px-3 py-2">
        <div className="flex items-center gap-1.5">
          <p className="text-xs font-bold text-foreground">
            {t("voice.didYouMean")} <span className="font-normal text-muted-foreground">“{res.heard}”</span>
          </p>
          {close}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {res.options.map((o) => (
            <button
              key={o.itemId}
              type="button"
              onClick={() => onResolve(p, o.itemId, o.name, p.qty ?? 1)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground hover:border-primary"
            >
              {(p.qty ?? 1) > 1 ? `${p.qty}× ` : ""}
              {o.name} <span className="text-muted-foreground">{money(o.unitPrice)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // quantity (vague or impossible amount)
  return (
    <div className="rounded-xl border border-border bg-background px-3 py-2">
      <div className="flex items-center gap-1.5">
        <p className="text-xs font-bold text-foreground">{t("voice.howMany", { name: p.name })}</p>
        {close}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" onClick={() => onResolve(p, p.itemId!, p.name, n)} className="h-8 w-9 rounded-lg border border-border bg-card text-xs font-bold text-foreground hover:border-primary">
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
