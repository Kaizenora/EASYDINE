import { ArrowDown } from "lucide-react";
import { HeroMock } from "@/components/marketing/hero-mock";
import { DEMO_HREF } from "@/components/marketing/links";

export function Hero() {
  return (
    <section className="px-4 pt-12 pb-16 sm:px-6 lg:pt-20 lg:pb-24">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[1fr_auto] lg:gap-16">
        <div className="max-w-xl">
          <h1 className="text-balance font-heading text-[32px] leading-[1.1] font-bold tracking-[-0.02em] text-foreground sm:text-[40px]">
            Dine smarter, not harder.
          </h1>
          <p className="mt-4 text-pretty text-xl leading-relaxed text-muted-foreground">
            QR ordering and billing for restaurants.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a
              href={DEMO_HREF}
              className="inline-flex h-11 items-center justify-center rounded-lg bg-primary px-6 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-hover"
            >
              Book a demo
            </a>
            <a
              href="#how-it-works"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-border bg-card px-6 text-base font-semibold text-foreground transition-colors hover:bg-muted"
            >
              See how it works
              <ArrowDown className="size-4" aria-hidden />
            </a>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Works in the phone browser, no app to install. In English,{" "}
            <span lang="hi">हिंदी</span> and <span lang="mr">मराठी</span>.
          </p>
        </div>

        <HeroMock />
      </div>
    </section>
  );
}
