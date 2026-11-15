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
  VoiceOrderSession,
  type VoiceAddLine,
  type VoiceMenuItem,
  type VoiceResult,
} from "@/lib/voice-order";

export type { VoiceAddLine };

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
const IDLE_STOP_MS = 120_000; // 2 minutes of quiet before auto-stopping
const MAX_SESSION_MS = 600_000; // 10 minutes max ordering session while guest is browsing

interface Recent {
  key: number;
  name: string;
  qty: number;
  note: string;
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
  onChooseOptions: _onChooseOptions,
  bottomOffset = 16,
}: {
  menu: VoiceMenuItem[];
  onAdd: (lines: VoiceAddLine[]) => void;
  onChooseOptions?: (itemId: string) => void;
  bottomOffset?: number;
}) {
  const { locale, setLocale, t } = useI18n();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [barOpen, setBarOpen] = useState(false);
  const [interim, setInterim] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);
  const [activeQuestion, setActiveQuestion] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const voiceSession = useRef<VoiceOrderSession | null>(null);
  if (!voiceSession.current) {
    voiceSession.current = new VoiceOrderSession(menu, onAdd);
  }
  voiceSession.current.setMenu(menu);
  voiceSession.current.setOnAdd(onAdd);

  const session = useRef({
    active: false,
    rec: null as Recognition | null,
    idle: null as ReturnType<typeof setTimeout> | null,
    restartTimer: null as ReturnType<typeof setTimeout> | null,
    consecutiveNetworkErrors: 0,
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
      if (s.restartTimer) clearTimeout(s.restartTimer);
      try {
        s.rec?.abort();
      } catch {
        // ignore
      }
    };
  }, []);

  const stopListening = (msg?: string) => {
    const s = session.current;
    s.active = false;
    if (s.idle) clearTimeout(s.idle);
    s.idle = null;
    if (s.restartTimer) clearTimeout(s.restartTimer);
    s.restartTimer = null;
    s.consecutiveNetworkErrors = 0;
    try {
      s.rec?.stop();
    } catch {
      // ignore
    }
    setListening(false);
    setInterim("");
    if (msg) setMessage(msg);
  };

  const armIdle = () => {
    const s = session.current;
    if (s.idle) clearTimeout(s.idle);
    s.idle = setTimeout(() => stopListening(live.current.t("voice.idle")), IDLE_STOP_MS);
  };

  // While listening, touching or scrolling the menu refreshes the idle timer so the mic stays on while browsing
  useEffect(() => {
    if (!listening) return;
    const onInteract = () => {
      if (session.current.active) armIdle();
    };
    window.addEventListener("pointerdown", onInteract, { passive: true });
    window.addEventListener("scroll", onInteract, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", onInteract);
      window.removeEventListener("scroll", onInteract);
    };
  }, [listening]);

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
    rec.lang = RECOGNITION_LANG[live.current.locale as Locale];
    rec.interimResults = true;
    rec.continuous = true;
    rec.maxAlternatives = 1;

    // Notify session of new recognition instance so resultIndex sets don't block subsequent items
    voiceSession.current?.onNewRecognitionInstance();

    rec.onresult = (e: SpeechEvent) => {
      armIdle();
      s.consecutiveNetworkErrors = 0;
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = r[0]?.transcript ?? "";
        if (r.isFinal) {
          const out = voiceSession.current?.processTranscript(text, true, i, nowMs());
          if (out) {
            if (out.added.length > 0) {
              setMessage(null);
              const newRecent = out.added.map((a) => ({
                key: ++session.current.key,
                name: a.name,
                qty: a.quantity,
                note: a.note,
              }));
              setRecent((rs) => [...newRecent.reverse(), ...rs].slice(0, 4));
            }
            setActiveQuestion(out.question);
            if (out.notFound.length > 0) {
              setMessage(`“${out.notFound.join(", ")}” ${live.current.t("voice.notOnMenu", { heard: out.notFound.join(", ") })}`);
            }
          }
        } else partial += text;
      }
      setInterim(partial);
    };
    rec.onerror = (e: SpeechErrorEvent) => {
      const code = e?.error;
      const tt = live.current.t;
      if (code === "not-allowed" || code === "service-not-allowed") {
        stopListening(tt("voice.denied"));
        return;
      }
      if (code === "language-not-supported") {
        stopListening(tt("voice.langUnsupported", { language: LOCALE_LABELS[live.current.locale as Locale] }));
        return;
      }
      if (code === "network") {
        s.consecutiveNetworkErrors++;
        // On mobile, network timeouts are common during speech pauses. Only stop if offline/failing continuously.
        if (s.consecutiveNetworkErrors > 6) {
          stopListening(tt("voice.network"));
        }
        return;
      }
      // "no-speech", "audio-capture", "aborted": normal speech pauses or mobile lifecycle events.
      // Keep session active and let onend restart recognition automatically.
    };
    rec.onend = () => {
      if (s.rec === rec) s.rec = null;
      if (s.active) {
        if (s.restartTimer) clearTimeout(s.restartTimer);
        s.restartTimer = setTimeout(() => {
          if (s.active) spawn();
        }, 200);
      }
    };
    try {
      rec.start();
    } catch {
      // Browser hasn't finished releasing previous instance; retry after delay instead of aborting
      if (s.active) {
        if (s.restartTimer) clearTimeout(s.restartTimer);
        s.restartTimer = setTimeout(() => {
          if (s.active) spawn();
        }, 350);
      }
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
    s.consecutiveNetworkErrors = 0;
    voiceSession.current?.reset();
    setActiveQuestion(null);
    setRecent([]);
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
    setActiveQuestion(null);
    setRecent([]);
  };

  const handleAnswerQty = (qty: number) => {
    const out = voiceSession.current?.resolveActiveQuestion(qty);
    if (out) {
      if (out.added.length > 0) {
        const newRecent = out.added.map((a) => ({
          key: ++session.current.key,
          name: a.name,
          qty: a.quantity,
          note: a.note,
        }));
        setRecent((rs) => [...newRecent.reverse(), ...rs].slice(0, 4));
      }
      setActiveQuestion(out.question);
    }
  };

  const handleDismissQuestion = () => {
    const nextQ = voiceSession.current?.dismissActiveQuestion() ?? null;
    setActiveQuestion(nextQ);
  };

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
                {recent.length > 0 && !activeQuestion && !listening && (
                  <p className="text-[11px] text-muted-foreground">{t("voice.inCart")}</p>
                )}
                {activeQuestion && (
                  <div className="rounded-xl border border-primary/30 bg-primary/5 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-bold text-foreground">
                        🎙️ {activeQuestion}
                      </p>
                      <button
                        type="button"
                        onClick={handleDismissQuestion}
                        aria-label={t("voice.noneOfThese")}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => handleAnswerQty(n)}
                          className="h-8 w-9 rounded-lg border border-border bg-card text-xs font-bold text-foreground hover:border-primary hover:bg-primary/10 transition-colors"
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </Floating>
    );
  }
}
