"use client";

// Small, self-contained pieces of the customer QR menu: the loyalty identity
// note and points chip, the Zomato/Swiggy banner, the review button and the
// "points earned" card. Each hides itself when its feature is off or unset.

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ExternalLink, Star, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { isSafeWebUrl, openExternal } from "@/lib/outbound";

export interface PublicLoyaltyConfig {
  enabled: boolean;
  earnPerCurrency?: number | null;
  pointValue?: number | null;
  minOrderAmount?: number;
}
export interface PublicDeliveryRedirect {
  zomatoUrl: string | null;
  swiggyUrl: string | null;
}
export interface PublicPaidSummary {
  orderNumber: string;
  loyaltyEnabled: boolean;
  pointsEarned: number;
  pointsBalance: number | null;
}

/** The phone is the loyalty identity: said plainly, right under the fields. */
export function LoyaltyIdentityNote({ loyalty }: { loyalty?: PublicLoyaltyConfig }) {
  if (!loyalty?.enabled) return null;
  return (
    <p
      data-testid="loyalty-identity-note"
      className="mt-4 rounded-xl border border-amber-700/30 bg-amber-500/10 px-3.5 py-2.5 text-xs font-bold leading-relaxed text-amber-950"
    >
      Your phone number is your loyalty identity. Your points, offers and order history will always be linked
      to this number, so enter it correctly.
    </p>
  );
}

type Balance = { enabled: boolean; known?: boolean; points: number; pointValue?: number };

export function usePointsBalance(qrToken: string, phone: string, enabled: boolean) {
  const valid = phone.replace(/\D/g, "").length >= 10;
  return useQuery({
    queryKey: ["public-loyalty", qrToken, phone],
    queryFn: () => api.get<Balance>(`/public/menu/${qrToken}/loyalty?phone=${encodeURIComponent(phone)}`),
    enabled: enabled && valid,
    staleTime: 15_000,
    retry: 0,
  });
}

/** "⭐ 120 pts" for the guest's phone; hidden when loyalty is off. */
export function PointsChip({
  qrToken,
  phone,
  loyalty,
  tone = "dark",
}: {
  qrToken: string;
  phone: string;
  loyalty?: PublicLoyaltyConfig;
  tone?: "dark" | "light";
}) {
  const { data } = usePointsBalance(qrToken, phone, !!loyalty?.enabled);
  if (!loyalty?.enabled || !data?.enabled) return null;
  const worth = data.pointValue && data.points > 0 ? ` · worth ₹${(data.points * data.pointValue).toFixed(0)}` : "";
  return (
    <span
      data-testid="points-chip"
      className={
        tone === "dark"
          ? "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-0.5 text-xs font-bold text-amber-300"
          : "inline-flex items-center gap-1 rounded-full border border-amber-700/30 bg-amber-500/10 px-3 py-0.5 text-xs font-bold text-amber-900"
      }
    >
      <Star className="h-3 w-3 fill-current" />
      {data.points} pts{worth}
    </span>
  );
}

/**
 * "Also order from us on Zomato / Swiggy". Dismissible for the visit, buttons
 * open the restaurant's pages in a new tab, and a clear confirmation shows
 * that the tap went through.
 */
export function DeliveryRedirectBanner({
  qrToken,
  redirect,
}: {
  qrToken: string;
  redirect?: PublicDeliveryRedirect | null;
}) {
  const key = `qr-redirect-dismissed:${qrToken}`;
  const [dismissed, setDismissed] = useState(true); // hidden until we know
  const [opened, setOpened] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(key) === "1");
    } catch {
      setDismissed(false);
    }
  }, [key]);
  useEffect(() => {
    if (!opened) return;
    const t = setTimeout(() => setOpened(null), 5000);
    return () => clearTimeout(t);
  }, [opened]);

  const links = [
    { name: "Zomato", url: redirect?.zomatoUrl ?? null, cls: "bg-[#E23744] text-white" },
    { name: "Swiggy", url: redirect?.swiggyUrl ?? null, cls: "bg-[#FC8019] text-black" },
  ].filter((l) => isSafeWebUrl(l.url));
  if (!redirect || links.length === 0 || dismissed) return null;

  const names = links.map((l) => l.name).join(" / ");
  return (
    <section
      aria-label="Order on Zomato or Swiggy"
      data-testid="delivery-redirect-banner"
      className="relative mx-4 mt-3 rounded-2xl border border-neutral-800 bg-[#141416] p-3.5 pr-9"
    >
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            sessionStorage.setItem(key, "1");
          } catch {
            /* private mode: just hide it for now */
          }
          setDismissed(true);
        }}
        className="absolute right-2 top-2 rounded-full p-1 text-neutral-500 hover:bg-neutral-800 hover:text-white"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="text-xs font-bold text-white">Also order from us on {names}</p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {links.map((l) => (
          <button
            key={l.name}
            type="button"
            onClick={() => {
              if (openExternal(l.url)) {
                setFailed(false);
                setOpened(l.name);
              } else setFailed(true);
            }}
            className={`inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-xs font-bold shadow-sm active:scale-[0.98] ${l.cls}`}
          >
            {l.name}
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
        ))}
      </div>
      {opened && (
        <p role="status" data-testid="redirect-confirmation" className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          Redirecting to {opened}…
        </p>
      )}
      {failed && (
        <p role="alert" className="mt-2.5 text-xs font-semibold text-red-400">
          Couldn&apos;t open that link. Please try again.
        </p>
      )}
    </section>
  );
}

/** Opens the restaurant's review page in a new tab. Renders nothing without a valid link. */
export function ReviewButton({ url, className = "" }: { url?: string | null; className?: string }) {
  if (!isSafeWebUrl(url)) return null;
  return (
    <button
      type="button"
      data-testid="review-button"
      onClick={() => openExternal(url)}
      className={`inline-flex h-11 items-center justify-center gap-2 rounded-2xl border border-amber-500/50 bg-amber-500/10 px-5 text-sm font-bold text-amber-300 transition-all hover:bg-amber-500/20 active:scale-[0.98] ${className}`}
    >
      <Star className="h-4 w-4 fill-current" />
      Review us
    </button>
  );
}

/** After payment: what this bill earned and the new balance. */
export function PaidPointsCard({ paid }: { paid?: PublicPaidSummary | null }) {
  if (!paid?.loyaltyEnabled || paid.pointsBalance == null) return null;
  return (
    <div
      data-testid="paid-points-card"
      className="mt-2 w-full max-w-xs rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-center"
    >
      {paid.pointsEarned > 0 ? (
        <p className="text-lg font-black text-amber-300">+{paid.pointsEarned} points earned</p>
      ) : (
        <p className="text-sm font-semibold text-neutral-300">No points earned on this bill</p>
      )}
      <p className="mt-1 text-sm font-bold text-white">Your balance: {paid.pointsBalance} points</p>
    </div>
  );
}

/** Polls the guest's own paid order for its points summary after the bill is settled. */
export function usePaidSummary(qrToken: string, orderId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["public-paid", qrToken, orderId],
    queryFn: async () => {
      const res = await api.get<{ paid?: PublicPaidSummary }>(
        `/public/menu/${qrToken}/status?orderId=${encodeURIComponent(orderId as string)}`,
      );
      return res.paid ?? null;
    },
    enabled: enabled && !!orderId,
    staleTime: 0,
    retry: 1,
  });
}
