import { ArrowDownRight, Minus, Plus, ShoppingBag } from "lucide-react";
import { TableQrCard } from "@/components/brand/table-qr-card";
import { cn } from "@/lib/utils";

// Sample data only: a made-up restaurant and menu, labelled as a sample
// where it is shown. Prices add up (240 + 2 x 60 = 360). Photos are the same
// food photos the guest menu uses as fallbacks.
const PHOTO = {
  starters: "https://images.unsplash.com/photo-1567188040759-fb8a883dc6d8?w=500&auto=format&fit=crop&q=80",
  main: "https://images.unsplash.com/photo-1546833999-b9f581a1996d?w=500&auto=format&fit=crop&q=80",
  rice: "https://images.unsplash.com/photo-1563379091339-03b21ab4a4f8?w=500&auto=format&fit=crop&q=80",
  breads: "https://images.unsplash.com/photo-1626074353765-517a681e40be?w=500&auto=format&fit=crop&q=80",
  drinks: "https://images.unsplash.com/photo-1513558161293-cdaf765ed2fd?w=500&auto=format&fit=crop&q=80",
  dessert: "https://images.unsplash.com/photo-1551024709-8f23befc6f87?w=500&auto=format&fit=crop&q=80",
  table: "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=1200&auto=format&fit=crop&q=80",
};
export const SAMPLE_PHOTOS = PHOTO;

const DISHES = [
  { name: "Paneer Tikka", price: 240, veg: true, qty: 1, img: PHOTO.starters },
  { name: "Tandoori Chicken", price: 320, veg: false, qty: 0, img: PHOTO.breads },
  { name: "Fresh Lime Soda", price: 60, veg: true, qty: 2, img: PHOTO.drinks },
];

const CATEGORIES = ["Starters", "Mains", "Breads", "Drinks"];

function VegMark({ veg }: { veg: boolean }) {
  return (
    <span
      role="img"
      aria-label={veg ? "Veg" : "Non-veg"}
      className={cn(
        "inline-flex size-2.5 shrink-0 items-center justify-center rounded-[2px] border bg-white",
        veg ? "border-veg" : "border-nonveg",
      )}
    >
      <span className={cn("size-1 rounded-full", veg ? "bg-veg" : "bg-nonveg")} />
    </span>
  );
}

/** Phone frame around a sample of the guest menu, in the guest menu's style. */
export function PhoneMenu({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "w-[260px] rounded-[40px] bg-[#111] p-2 shadow-[0_30px_60px_-25px_rgba(0,0,0,0.45)] ring-1 ring-black/40",
        className,
      )}
    >
      <div className="relative overflow-hidden rounded-[32px] bg-[#FAF9F4]">
        <div className="absolute top-2 left-1/2 h-5 w-20 -translate-x-1/2 rounded-full bg-[#111]" />
        <div className="px-3.5 pt-9 pb-2">
          <div className="flex items-center justify-between">
            <p className="font-heading text-[13px] font-semibold text-[#1A1A1A]">Saffron Thali House</p>
            <span className="rounded-full border border-[#1A1A1A] px-2 py-0.5 text-[9px]" lang="hi">
              हिंदी
            </span>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={PHOTO.table} alt="" className="mt-2.5 h-24 w-full rounded-xl object-cover" />
          <div className="mt-2.5 flex gap-1 text-[9px]">
            {CATEGORIES.map((c, i) => (
              <span
                key={c}
                className={cn("rounded-full px-2 py-1", i === 0 ? "bg-[#1A1A1A] text-white" : "text-[#1A1A1A]")}
              >
                {c}
              </span>
            ))}
          </div>
          <div className="mt-1 h-0.5 rounded-full bg-black/5">
            <div className="h-full w-2/3 rounded-full bg-black/40" />
          </div>
        </div>

        <ul className="flex flex-col gap-1.5 px-3.5 pb-14">
          {DISHES.map((d) => (
            <li key={d.name} className="flex h-[64px] overflow-hidden rounded-lg bg-[#111] text-white">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.img} alt="" className="h-full w-[64px] shrink-0 object-cover" />
              <div className="flex min-w-0 flex-1 flex-col justify-between px-2.5 py-1.5">
                <div className="flex items-center gap-1">
                  <VegMark veg={d.veg} />
                  <p className="truncate text-[10px]">{d.name}</p>
                </div>
                <div className="flex items-center justify-between">
                  <span className="tabular text-[10px]">₹{d.price}</span>
                  {d.qty > 0 ? (
                    <span className="flex h-5 items-center rounded-full bg-[#D7F551] text-[#1A1A1A]">
                      <Minus className="mx-1 size-2.5" />
                      <span className="tabular text-[9px] font-semibold">{d.qty}</span>
                      <Plus className="mx-1 size-2.5" />
                    </span>
                  ) : (
                    <span className="flex h-5 items-center rounded-full bg-white px-2 text-[9px] font-semibold text-[#1A1A1A]">
                      Add
                    </span>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>

        <div className="absolute inset-x-3 bottom-3 flex items-center justify-between rounded-full bg-[#111] py-1.5 pr-1.5 pl-3.5 text-white">
          <span className="tabular text-[10px]">3 items · ₹360</span>
          <span className="flex items-center gap-1 rounded-full bg-[#D7F551] px-2.5 py-1 text-[9px] font-semibold text-[#1A1A1A]">
            <ShoppingBag className="size-2.5" />
            View cart
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * A small screen for the showcase strip: one dish, the guest menu's black
 * card style. `tone` sets the screen's own background colour.
 */
export function PhoneScreen({
  restaurant,
  dish,
  price,
  img,
  tone,
}: {
  restaurant: string;
  dish: string;
  price: number;
  img: string;
  tone: string;
}) {
  return (
    <div aria-hidden className="w-[210px] shrink-0 rounded-[34px] bg-[#111] p-1.5 shadow-[0_25px_50px_-25px_rgba(0,0,0,0.5)] sm:w-[230px]">
      <div className="relative h-[400px] overflow-hidden rounded-[28px] sm:h-[440px]" style={{ background: tone }}>
        <div className="absolute top-2 left-1/2 h-4 w-16 -translate-x-1/2 rounded-full bg-[#111]" />
        <p className="px-4 pt-9 font-heading text-[14px] font-medium text-white">{restaurant}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={img} alt="" className="mx-3 mt-3 h-[58%] w-[calc(100%-1.5rem)] rounded-2xl object-cover" />
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between rounded-2xl bg-black/80 p-3 text-white">
          <span className="text-[12px] leading-tight">{dish}</span>
          <span className="tabular text-[12px]">₹{price}</span>
        </div>
      </div>
    </div>
  );
}

/** Hero media card: the printed table QR card, with a link to the steps. */
export function HeroMediaCard() {
  const props = { url: "https://easydinein.vercel.app", table: "T4", restaurantName: "Saffron Thali House" };
  return (
    <figure className="group relative w-fit rounded-[28px] border border-white/70 bg-white/70 p-3 shadow-[0_30px_60px_-30px_rgba(0,0,0,0.30)] backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_40px_70px_-30px_rgba(0,0,0,0.35)]">
      <div className="overflow-hidden rounded-[20px] bg-[#FAF9F4] p-5">
        <div aria-hidden>
          <TableQrCard {...props} width={176} />
        </div>
      </div>
      <figcaption>
        <a
          href="#how-it-works"
          className="mt-3 flex items-center justify-center gap-1.5 rounded-full py-2 text-[15px] text-foreground transition-colors hover:bg-black/[0.04]"
        >
          See how it works
          <ArrowDownRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:translate-y-0.5" aria-hidden />
        </a>
        <p className="pb-1 text-center text-[11px] text-muted-foreground">Sample table card. The QR opens easydinein.vercel.app.</p>
      </figcaption>
    </figure>
  );
}
