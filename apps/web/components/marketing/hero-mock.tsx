"use client";

import { Minus, Plus, ShoppingBag } from "lucide-react";
import { motion } from "motion/react";
import { TableQrCard } from "@/components/brand/table-qr-card";
import { cn } from "@/lib/utils";

// Sample data only: a made-up restaurant and menu, labelled as a sample
// under the mock. Prices add up (240 + 2 x 60 = 360).
const DISHES = [
  { name: "Paneer Tikka", price: 240, veg: true, qty: 1 },
  { name: "Chicken 65", price: 280, veg: false, qty: 0 },
  { name: "Masala Papad", price: 60, veg: true, qty: 2 },
  { name: "Tomato Soup", price: 150, veg: true, qty: 0 },
];

const CATEGORIES = ["Starters", "Mains", "Breads", "Drinks"];

const ease = [0.16, 1, 0.3, 1] as const;

function VegMark({ veg }: { veg: boolean }) {
  return (
    <span
      role="img"
      aria-label={veg ? "Veg" : "Non-veg"}
      className={cn(
        "inline-flex size-3 shrink-0 items-center justify-center rounded-[2px] border",
        veg ? "border-veg" : "border-nonveg",
      )}
    >
      <span className={cn("size-1.5 rounded-full", veg ? "bg-veg" : "bg-nonveg")} />
    </span>
  );
}

function PhoneMenu() {
  return (
    <div className="w-[300px] rounded-[36px] border border-foreground/80 bg-foreground p-2 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
      <div className="relative overflow-hidden rounded-[28px] bg-card">
        {/* header */}
        <div className="border-b border-border px-4 pt-5 pb-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading text-[15px] font-bold tracking-[-0.02em] text-foreground">
              Saffron Thali House
            </p>
            <div className="flex rounded-full border border-border p-0.5 text-[10px] font-medium">
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-primary-foreground">EN</span>
              <span lang="hi" className="px-1.5 py-0.5 text-muted-foreground">हि</span>
              <span lang="mr" className="px-1.5 py-0.5 text-muted-foreground">मर</span>
            </div>
          </div>
          <span className="mt-1.5 inline-flex rounded-full bg-tint px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">
            Table T4
          </span>
          <div className="mt-3 flex gap-1.5 text-[11px] font-medium">
            {CATEGORIES.map((c, i) => (
              <span
                key={c}
                className={cn(
                  "rounded-full px-2.5 py-1",
                  i === 0 ? "bg-foreground text-background" : "border border-border text-muted-foreground",
                )}
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* dishes */}
        <ul className="divide-y divide-border px-4">
          {DISHES.map((d) => (
            <li key={d.name} className="flex items-center gap-3 py-3">
              <span
                aria-hidden
                className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted font-heading text-xl font-bold text-muted-foreground"
              >
                {d.name[0]}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <VegMark veg={d.veg} />
                  <p className="truncate text-[13px] font-semibold text-foreground">{d.name}</p>
                </div>
                <p className="tabular mt-0.5 text-[13px] text-muted-foreground">₹{d.price}</p>
              </div>
              {d.qty > 0 ? (
                <span className="flex h-7 items-center rounded-lg bg-primary text-primary-foreground">
                  <Minus className="mx-1.5 size-3" aria-hidden />
                  <span className="tabular w-3 text-center text-xs font-semibold">{d.qty}</span>
                  <Plus className="mx-1.5 size-3" aria-hidden />
                </span>
              ) : (
                <span className="flex h-7 items-center rounded-lg border border-primary/40 px-3 text-xs font-semibold text-primary">
                  Add
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* cart bar */}
        <motion.div
          initial={{ scale: 0.96 }}
          animate={{ scale: 1 }}
          transition={{ duration: 0.5, delay: 0.7, ease }}
          className="mx-3 mb-3 flex items-center justify-between rounded-xl bg-primary px-3.5 py-2.5 text-primary-foreground"
        >
          <span className="text-[12px]">
            <span className="tabular font-semibold">3 items</span>
            <span className="opacity-80"> · </span>
            <span className="tabular font-semibold">₹360</span>
          </span>
          <span className="flex items-center gap-1.5 text-[12px] font-semibold">
            <ShoppingBag className="size-3.5" aria-hidden />
            View cart
          </span>
        </motion.div>
      </div>
    </div>
  );
}

function TableCard() {
  const props = { url: "https://easydinein.vercel.app", table: "T4", restaurantName: "Saffron Thali House" };
  return (
    <>
      <TableQrCard {...props} width={168} className="sm:hidden" />
      <TableQrCard {...props} width={184} className="hidden sm:block" />
    </>
  );
}

export function HeroMock() {
  return (
    <figure className="relative mx-auto w-fit">
      <div aria-hidden className="relative flex flex-col items-start sm:block sm:pl-[164px]">
        <motion.div
          initial={{ y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, delay: 0.2, ease }}
        >
          <PhoneMenu />
        </motion.div>
        <motion.div
          initial={{ y: 12 }}
          animate={{ y: 0 }}
          transition={{ duration: 0.6, ease }}
          className="relative z-10 -mt-6 ml-4 sm:absolute sm:-bottom-6 sm:left-0 sm:mt-0 sm:ml-0"
        >
          <TableCard />
        </motion.div>
      </div>
      <figcaption className="mt-8 text-center text-xs text-muted-foreground">
        Sample restaurant and menu. The QR opens easydinein.vercel.app.
      </figcaption>
    </figure>
  );
}
