"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EasyDineWordmark } from "@/components/brand/easydine-logo";
import { DEMO_HREF } from "@/components/marketing/links";
import { cn } from "@/lib/utils";

const linkClass =
  "hidden h-9 items-center rounded-full px-3 text-sm text-foreground/80 transition-colors duration-200 hover:bg-black/[0.04] hover:text-foreground md:inline-flex";

/**
 * Floating frosted pill. Fixed at the top; it turns a little more opaque and
 * lifts once the page has scrolled. Pages that use it reserve ~96px of top
 * space (the pill does not take part in layout).
 */
export function MarketingNav({ home = true }: { home?: boolean }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Section anchors resolve on the home page; elsewhere they point back to it.
  const anchor = (id: string) => (home ? `#${id}` : `/#${id}`);

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center px-3 pt-4 sm:pt-6">
      <div
        className={cn(
          "pointer-events-auto flex h-14 w-full max-w-[680px] items-center justify-between gap-3 rounded-full border pr-2 pl-5 backdrop-blur-xl transition-all duration-300 ease-out sm:h-[60px] sm:pl-7",
          scrolled
            ? "border-black/[0.06] bg-white/75 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.18)]"
            : "border-white/60 bg-white/45 shadow-[0_4px_20px_-12px_rgba(0,0,0,0.10)]",
        )}
      >
        <Link href="/" aria-label="EasyDine home" className="shrink-0 rounded-lg transition-opacity hover:opacity-80">
          <EasyDineWordmark height={24} />
        </Link>

        <nav aria-label="Main" className="flex items-center gap-0.5 sm:gap-1">
          <a href={anchor("how-it-works")} className={linkClass}>
            How it works
          </a>
          <a href={anchor("features")} className={linkClass}>
            Features
          </a>
          <Link
            href="/login"
            className="inline-flex h-9 items-center rounded-full px-3 text-sm text-foreground/80 transition-colors duration-200 hover:bg-black/[0.04] hover:text-foreground"
          >
            Sign in
          </Link>
          <a
            href={DEMO_HREF}
            className="ml-1 inline-flex h-10 items-center rounded-full border border-foreground px-4 text-sm font-medium text-foreground transition-all duration-200 hover:-translate-y-px hover:bg-foreground hover:text-background sm:px-5"
          >
            Book a demo
          </a>
        </nav>
      </div>
    </header>
  );
}
