import { DEMO_HREF } from "@/components/marketing/links";

export function PilotBand() {
  return (
    <section className="bg-primary px-4 py-16 sm:px-6 lg:py-20">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="max-w-2xl">
          <h2 className="font-heading text-2xl font-bold tracking-[-0.02em] text-[#FBFAF7] sm:text-[32px]">
            Join the one-month pilot
          </h2>
          <p className="mt-3 text-base leading-relaxed text-[#FBFAF7]">
            We are running EasyDine with a small group of restaurants for a month of real service and real
            bills. If you would like to be one of them, book a demo.
          </p>
        </div>
        <a
          href={DEMO_HREF}
          className="inline-flex h-11 shrink-0 items-center justify-center self-start rounded-lg bg-[#FBFAF7] px-6 text-base font-semibold text-primary transition-colors hover:bg-white md:self-center"
        >
          Book a demo
        </a>
      </div>
    </section>
  );
}
