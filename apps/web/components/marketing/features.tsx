import { ChefHat, Gift, Languages, Printer, QrCode, Store } from "lucide-react";

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

export function Features() {
  return (
    <section id="features" className="scroll-mt-16 px-4 py-16 sm:px-6 lg:py-24">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-heading text-2xl font-bold tracking-[-0.02em] text-foreground sm:text-[32px]">
          What EasyDine does
        </h2>
        <p className="mt-3 max-w-2xl text-base text-muted-foreground">
          One system from the table to the kitchen to the bill.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-xl border border-border bg-card p-6">
              <div className="flex items-center gap-3">
                <f.icon className="size-5 shrink-0 text-primary" aria-hidden />
                <h3 className="font-heading text-xl font-semibold tracking-[-0.02em] text-foreground">{f.title}</h3>
              </div>
              <p className="mt-3 text-base leading-relaxed text-muted-foreground">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
