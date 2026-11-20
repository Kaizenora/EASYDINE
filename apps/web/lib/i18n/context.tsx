"use client";

// Lightweight client-side i18n (2026-09-27) — no routing/middleware
// involved, since this dashboard is a client-rendered SPA-style app and
// the QR ordering page is the one page a guest actually reads in their
// own language. A locale is just a piece of client state, persisted to
// localStorage so it survives a refresh, with a small dictionary lookup.
//
// Extending this: add a namespaced key (e.g. "menu.addItem") to every file
// in ./dictionaries, then call t("menu.addItem") wherever the English
// literal used to be. See nav-items.ts / sidebar-nav.tsx and
// app/order/[qrToken]/page.tsx for the two places this is wired up so far.

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LOCALE, isLocale, resolveInitialLocale, type Locale } from "./locales";
import en from "./dictionaries/en.json";
import hi from "./dictionaries/hi.json";
import mr from "./dictionaries/mr.json";

const DICTIONARIES: Record<Locale, Record<string, string>> = { en, hi, mr };
const STORAGE_KEY = "easydine-locale";

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({
  children,
  fixedLocale,
}: {
  children: React.ReactNode;
  /**
   * Pins the starting language and never reads or writes the saved choice or
   * the browser language — for a shared public screen (the kiosk), where one
   * customer's language pick must not leak into the staff UI or stick for the
   * next customer.
   */
  fixedLocale?: Locale;
}) {
  // Starts at the fixed default on both server and first client render
  // (so hydration matches), then swaps to the saved/browser locale right
  // after mount — the same pattern the QR page already uses for
  // sessionStorage reads.
  const [locale, setLocaleState] = useState<Locale>(fixedLocale ?? DEFAULT_LOCALE);

  useEffect(() => {
    if (fixedLocale) return;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(STORAGE_KEY);
    } catch {
      // storage blocked: fall through to the browser language
    }
    const next = resolveInitialLocale(
      saved,
      typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]),
    );
    // A removed language (es/fr) was saved: replace it with English for good.
    if (saved && !isLocale(saved)) {
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(next);
  }, [fixedLocale]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (!fixedLocale) {
        try {
          localStorage.setItem(STORAGE_KEY, next);
        } catch {
          // storage blocked: the choice lasts for this page only
        }
      }
      setLocaleState(next);
    },
    [fixedLocale],
  );

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      const template = DICTIONARIES[locale]?.[key] ?? DICTIONARIES[DEFAULT_LOCALE][key] ?? key;
      if (!vars) return template;
      return Object.entries(vars).reduce(
        (out, [name, value]) => out.replaceAll(`{${name}}`, String(value)),
        template,
      );
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}

export { LOCALES, LOCALE_LABELS } from "./locales";
export type { Locale } from "./locales";
