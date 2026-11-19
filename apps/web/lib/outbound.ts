// Links the app opens in a new tab (Zomato / Swiggy / review page / WhatsApp).
// Everything here is plain functions so it can be unit-tested without a browser.

/** Only plain web addresses are ever opened; never javascript:, data:, etc. */
export function isSafeWebUrl(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Open a link in a new tab. Returns false (and opens nothing) for an unsafe or
 * empty address, so callers can show an error instead of a silent no-op.
 */
export function openExternal(url: string | null | undefined): boolean {
  if (!isSafeWebUrl(url)) return false;
  if (typeof window === "undefined") return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}

/**
 * wa.me wants the full international number, digits only. Numbers saved
 * without a country code (the usual 10-digit Indian mobile, or one with a
 * leading 0) get +91; anything already carrying a country code is kept.
 */
export function whatsappDigits(phone: string | null | undefined, defaultCountry = "91"): string | null {
  let d = (phone ?? "").replace(/\D/g, "").replace(/^00/, "");
  if (!d) return null;
  if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
  if (d.length === 10) d = defaultCountry + d;
  return d.length >= 11 && d.length <= 15 ? d : null;
}

export function whatsappUrl(phone: string | null | undefined, message: string): string | null {
  const digits = whatsappDigits(phone);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
