import { SAMPLE_PHOTOS } from "@/components/marketing/hero-mock";
import { DEMO_HREF } from "@/components/marketing/links";
import { Reveal } from "@/components/marketing/reveal";

export function PilotBand() {
  return (
    <section className="bg-sage px-4 py-16 sm:px-8 lg:py-20">
      <Reveal>
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-[#111] sm:rounded-[44px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={SAMPLE_PHOTOS.table}
            alt=""
            aria-hidden
            className="absolute inset-0 h-full w-full object-cover opacity-70 transition-transform duration-[1200ms] ease-out hover:scale-[1.03]"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/65 to-black/10" />
          <div className="relative max-w-xl px-7 py-16 sm:px-14 sm:py-24">
            <h2 className="font-heading text-[32px] leading-tight font-light tracking-[-0.02em] text-white sm:text-[44px]">
              Join the one-month pilot
            </h2>
            <p className="mt-4 text-[16px] leading-relaxed font-light text-white/80">
              We are running EasyDine with a small group of restaurants for a month of real service and real
              bills. If you would like to be one of them, book a demo.
            </p>
            <a
              href={DEMO_HREF}
              className="mt-9 inline-flex h-12 items-center justify-center rounded-full bg-lime px-7 text-[16px] font-medium text-lime-foreground transition-all duration-300 hover:-translate-y-0.5 hover:bg-lime-hover"
            >
              Book a demo
            </a>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
