"use client";

import {
  BarChart3,
  CalendarClock,
  ChefHat,
  ClipboardList,
  Landmark,
  LayoutDashboard,
  LayoutGrid,
  Settings,
  ShoppingCart,
  Users,
  UsersRound,
  UtensilsCrossed,
} from "lucide-react";
import Image from "next/image";
import { useRef, useState, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

// Product tour: the 12 sidebar modules, each shown as a static screenshot of
// the real app in its dark theme, filled with made-up sample data ("Sample
// Restaurant", "(sample)" names). No live API calls, no protected routes.

const MODULES = [
  { key: "dashboard", title: "Dashboard", icon: LayoutDashboard, body: "Today's revenue, orders, occupied tables and kitchen queue at a glance, with 14-day revenue and food-waste trends." },
  { key: "pos", title: "Point of Sale", icon: ShoppingCart, body: "Ring up dine-in, takeaway and delivery orders, add a cooking preference per dish and send it to the kitchen." },
  { key: "orders", title: "Orders", icon: ClipboardList, body: "Accept incoming QR orders, follow kitchen progress and collect cash, UPI or card payment for each order." },
  { key: "tables", title: "Tables", icon: LayoutGrid, body: "A live floor view of every table: ordering, preparing, served or bill requested, plus the waitlist." },
  { key: "reservations", title: "Reservations", icon: CalendarClock, body: "Upcoming bookings with guest count, table and special requests; confirm or cancel each one in a tap." },
  { key: "menu", title: "Menu", icon: UtensilsCrossed, body: "Categories, dishes, prices and tax in one list, with bulk price changes and CSV import." },
  { key: "kds", title: "Kitchen Display", icon: ChefHat, body: "Tickets move from Ordered to Preparing to Ready, with a timer on each ticket and one-tap reprint." },
  { key: "customers", title: "Customers", icon: UsersRound, body: "Guest profiles with loyalty points and wallet balance, searchable by name, phone or email." },
  { key: "team", title: "Team", icon: Users, body: "Weekly staff shifts, with leave requests, payroll and performance in their own tabs." },
  { key: "accounting", title: "Accounting", icon: Landmark, body: "Daily expenses, cash close, profit and loss, balance sheet, budgets and GST in one place." },
  { key: "reports", title: "Reports", icon: BarChart3, body: "Daily and item-wise sales, payment methods, GST and kitchen times; print or export to Excel, PDF or CSV." },
  { key: "settings", title: "Settings", icon: Settings, body: "Restaurant and branch details, tax, printers, staff, roles, backups and integrations." },
] as const;

export function ProductTour() {
  const [active, setActive] = useState(0);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const m = MODULES[active];

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? (active + 1) % MODULES.length
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? (active - 1 + MODULES.length) % MODULES.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? MODULES.length - 1
              : null;
    if (next === null) return;
    e.preventDefault();
    setActive(next);
    tabs.current[next]?.focus();
  }

  return (
    <section id="product-tour" className="border-t border-border/70 bg-card/60">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight">Product tour</h2>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          All 12 modules from the EasyDine sidebar, shown in the app&apos;s dark mode with sample data.
        </p>

        <div className="mt-8 grid gap-6 lg:grid-cols-[240px_1fr]">
          <div
            role="tablist"
            aria-label="EasyDine modules"
            onKeyDown={onKey}
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:px-0"
          >
            {MODULES.map((mod, i) => {
              const selected = i === active;
              return (
                <button
                  key={mod.key}
                  ref={(el) => {
                    tabs.current[i] = el;
                  }}
                  id={`tour-tab-${mod.key}`}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls="tour-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => setActive(i)}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm font-medium transition-colors lg:w-full",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-foreground hover:border-primary/40 hover:bg-accent",
                  )}
                >
                  <mod.icon className="h-4 w-4 shrink-0" aria-hidden />
                  {mod.title}
                </button>
              );
            })}
          </div>

          <div id="tour-panel" role="tabpanel" aria-labelledby={`tour-tab-${m.key}`} className="min-w-0">
            <div className="overflow-hidden rounded-2xl border border-[#2a2925] bg-[#161614] p-1.5 shadow-xl">
              <div className="flex items-center gap-1.5 px-2 pb-1.5 pt-0.5" aria-hidden>
                <span className="h-2.5 w-2.5 rounded-full bg-[#3a3833]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3a3833]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#3a3833]" />
                <span className="ml-auto rounded-full bg-[#2a2925] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#c9c3b6]">
                  Sample data
                </span>
              </div>
              <div className="relative aspect-[16/10] overflow-hidden rounded-xl">
                <Image
                  key={m.key}
                  src={`/screenshots/tour/${m.key}.webp`}
                  alt={`EasyDine ${m.title} screen in dark mode, showing sample data`}
                  fill
                  sizes="(min-width: 1152px) 860px, (min-width: 1024px) 75vw, 100vw"
                  className="object-cover object-left-top"
                />
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                <m.icon className="h-5 w-5" aria-hidden />
              </span>
              <div>
                <h3 className="text-lg font-semibold">
                  {m.title} <span className="text-sm font-normal text-muted-foreground">· {active + 1} of {MODULES.length}</span>
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
              </div>
            </div>
          </div>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">
          Screens show made-up sample data only (&ldquo;Sample Restaurant&rdquo;); no real restaurant or guest details.
        </p>
      </div>
    </section>
  );
}
