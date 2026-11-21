import { HeroMediaCard } from "@/components/marketing/hero-mock";
import { DEMO_HREF } from "@/components/marketing/links";
import { enterDelay } from "@/components/marketing/reveal";

export function Hero() {
  return (
    <section className="relative overflow-hidden px-5 pt-36 pb-20 sm:px-8 lg:pt-44 lg:pb-32">
      {/* Pastel blobs: light green melting into yellow. */}
      <div aria-hidden className="absolute inset-0 -z-0">
        <div className="ed-blob top-[6%] left-[18%] size-[340px] bg-[#B7DD7A] sm:size-[420px]" />
        <div
          className="ed-blob top-[26%] left-[28%] size-[300px] bg-[#F6DE5C] sm:size-[380px]"
          style={{ animationDelay: "-6s" }}
        />
        <div
          className="ed-blob right-[6%] bottom-[0%] size-[260px] bg-[#E3F2B8] opacity-60"
          style={{ animationDelay: "-11s" }}
        />
      </div>

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 lg:grid-cols-[1fr_auto] lg:gap-20">
        <div className="max-w-2xl">
          <h1
            className="ed-enter text-balance font-heading text-[44px] leading-[1.18] font-light tracking-[-0.025em] text-foreground sm:text-[60px] lg:text-[68px]"
            style={enterDelay(0)}
          >
            Dine <span className="ed-chip">smarter</span>, not <span className="ed-chip">harder</span>.
          </h1>
          <p
            className="ed-enter mt-6 max-w-md text-pretty text-[17px] leading-relaxed font-light text-foreground/75"
            style={enterDelay(120)}
          >
            QR ordering and billing for restaurants.
          </p>
          <div className="ed-enter mt-9 flex flex-col gap-3 sm:flex-row" style={enterDelay(240)}>
            <a
              href={DEMO_HREF}
              className="inline-flex h-13 items-center justify-center rounded-full bg-lime px-7 text-[16px] text-lime-foreground shadow-[0_10px_25px_-12px_rgba(150,190,20,0.8)] transition-all duration-300 hover:-translate-y-0.5 hover:bg-lime-hover hover:shadow-[0_16px_30px_-12px_rgba(150,190,20,0.9)]"
            >
              Book a demo
            </a>
            <a
              href="#how-it-works"
              className="inline-flex h-13 items-center justify-center rounded-full border border-foreground/80 px-7 text-[16px] text-foreground transition-all duration-300 hover:-translate-y-0.5 hover:bg-foreground hover:text-background"
            >
              See how it works
            </a>
          </div>
          <p className="ed-enter mt-7 text-sm font-light text-muted-foreground" style={enterDelay(360)}>
            Works in the phone browser, no app to install. In English, <span lang="hi">हिंदी</span> and{" "}
            <span lang="mr">मराठी</span>.
          </p>
        </div>

        <div className="ed-enter mx-auto lg:mx-0" style={enterDelay(300)}>
          <HeroMediaCard />
        </div>
      </div>
    </section>
  );
}
