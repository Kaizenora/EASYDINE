// Supported UI languages. English, Hindi and Marathi only (2026-11-12).
// Adding a language: add its code here, drop a matching dictionary file in
// ./dictionaries, and register it in context.tsx. Any key missing from a
// dictionary falls back to English.
export const LOCALES = ["en", "hi", "mr"] as const;
export type Locale = (typeof LOCALES)[number];

export const LOCALE_LABELS: Record<Locale, string> = {
  en: "English",
  hi: "हिन्दी",
  mr: "मराठी",
};

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: string | null | undefined): value is Locale {
  return !!value && (LOCALES as readonly string[]).includes(value);
}

/**
 * The starting language from a saved choice and the browser languages.
 * A saved choice that is no longer offered (e.g. "es" or "fr" from before
 * those languages were removed) means English, not a browser guess.
 */
export function resolveInitialLocale(
  saved: string | null | undefined,
  browserLanguages: readonly string[] = [],
): Locale {
  if (saved) return isLocale(saved) ? saved : DEFAULT_LOCALE;
  for (const lang of browserLanguages) {
    const short = lang.slice(0, 2).toLowerCase();
    if (isLocale(short)) return short;
  }
  return DEFAULT_LOCALE;
}
