import { IndianRupee, QrCode, UtensilsCrossed } from "lucide-react";

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
    <section id="how-it-works" className="scroll-mt-16 border-t border-border bg-card px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-heading text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-[32px]">
          How it works
        </h2>
        <ol className="mt-10 grid gap-10 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tint text-primary">
                  <step.icon className="size-5" aria-hidden />
                </span>
                {i < STEPS.length - 1 && (
                  <span aria-hidden className="hidden h-px flex-1 bg-border md:block" />
                )}
              </div>
              <h3 className="mt-4 font-heading text-xl font-semibold tracking-[-0.02em] text-foreground">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </h3>
              <p className="mt-2 max-w-[34ch] text-base leading-relaxed text-muted-foreground">{step.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
