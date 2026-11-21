import { ChefHat, Gift, Languages, Printer, QrCode, Store } from "lucide-react";
import { PhoneMenu } from "@/components/marketing/hero-mock";
import { Reveal } from "@/components/marketing/reveal";

const FEATURES = [
  {
    icon: QrCode,
    title: "QR ordering",
    body: "Every table gets its own QR card. Guests order from their own phone and each order arrives with its table number.",
  },
  {
    icon: ChefHat,
    title: "Live kitchen display",
    body: "New orders appear on the kitchen screen as soon as they are placed, oldest first, with guest preferences highlighted.",
  },
  {
    icon: Printer,
    title: "Billing and KOT print",
    body: "Print KOTs and GST bills on 80mm thermal or A4 printers. Reprint any bill when a guest asks for it.",
  },
  {
    icon: Gift,
    title: "Loyalty points",
    body: "Repeat guests earn points on their bills. You decide how many points a rupee earns and what they are worth.",
  },
  {
    icon: Languages,
    title: "Three languages",
    body: "The guest menu works in English, Hindi and Marathi. Guests switch language with one tap.",
  },
  {
    icon: Store,
    title: "More than one outlet",
    body: "Run several branches from one login, each with its own menu, tables and reports.",
  },
];

function Feature({ f, delay }: { f: (typeof FEATURES)[number]; delay: number }) {
  return (
    <li>
      <Reveal delay={delay}>
        <div className="group rounded-[24px] px-6 py-6 text-center transition-all duration-300 hover:-translate-y-1 hover:bg-[#C9E3BC]/70">
          <f.icon className="mx-auto size-9 text-foreground" strokeWidth={1.25} aria-hidden />
          <h3 className="mt-4 font-heading text-[20px] font-normal tracking-[-0.01em] text-foreground">{f.title}</h3>
          <p className="mx-auto mt-2 max-w-[34ch] text-[15px] leading-relaxed font-light text-foreground/75">{f.body}</p>
        </div>
      </Reveal>
    </li>
  );
}

export function Features() {
  const left = FEATURES.slice(0, 3);
  const right = FEATURES.slice(3);
  return (
    <section id="features" className="scroll-mt-28 bg-sage px-5 py-24 sm:px-8 lg:py-32">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="text-center font-heading text-[34px] leading-tight font-light tracking-[-0.02em] text-foreground sm:text-[44px]">
            What EasyDine does
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-center text-[16px] font-light text-foreground/70">
            One system from the table to the kitchen to the bill.
          </p>
        </Reveal>

        <div className="mt-16 grid items-center gap-6 lg:grid-cols-[1fr_auto_1fr] lg:gap-10">
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {left.map((f, i) => (
              <Feature key={f.title} f={f} delay={i * 100} />
            ))}
          </ul>
          <Reveal className="order-first mx-auto lg:order-none" delay={150}>
            <PhoneMenu className="transition-transform duration-500 hover:-translate-y-2 hover:rotate-[-1deg]" />
            <p className="mt-5 text-center text-xs text-foreground/55">Sample restaurant and menu.</p>
          </Reveal>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
            {right.map((f, i) => (
              <Feature key={f.title} f={f} delay={i * 100 + 50} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
