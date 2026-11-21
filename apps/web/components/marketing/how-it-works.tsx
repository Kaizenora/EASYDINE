import { IndianRupee, QrCode, UtensilsCrossed } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

const STEPS = [
  {
    icon: QrCode,
    title: "Scan",
    body: "The guest scans the QR on their table with the phone camera. The menu opens in the browser, no app to install.",
  },
  {
    icon: UtensilsCrossed,
    title: "Order",
    body: "They pick dishes from a menu with photos, add preferences and send it. The order reaches the kitchen screen and the cashier with its table number.",
  },
  {
    icon: IndianRupee,
    title: "Pay",
    body: "They see the itemised bill with GST on their phone and pay at the counter. The cashier prints or reprints the bill in one click.",
  },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-28 px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center font-heading text-[34px] leading-tight font-light tracking-[-0.02em] text-foreground sm:text-[44px]">
            How it <span className="ed-chip">works</span>
          </h2>
        </Reveal>
        <ol className="mt-16 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <li key={step.title}>
              <Reveal delay={i * 120} className="h-full">
                <div className="group h-full rounded-[28px] border border-border/70 bg-white/60 p-8 transition-all duration-300 hover:-translate-y-1 hover:bg-white hover:shadow-[0_24px_50px_-30px_rgba(0,0,0,0.25)]">
                  <div className="flex items-center justify-between">
                    <span className="flex size-12 items-center justify-center rounded-full bg-[#F3FAD6] text-foreground transition-colors duration-300 group-hover:bg-lime">
                      <step.icon className="size-5" strokeWidth={1.5} aria-hidden />
                    </span>
                    <span aria-hidden className="font-heading text-[40px] leading-none font-light text-foreground/15">
                      0{i + 1}
                    </span>
                  </div>
                  <h3 className="mt-8 font-heading text-[22px] font-normal tracking-[-0.01em] text-foreground">
                    <span className="sr-only">Step {i + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed font-light text-muted-foreground">{step.body}</p>
                </div>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
