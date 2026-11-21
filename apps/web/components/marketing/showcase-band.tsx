import { PhoneScreen, SAMPLE_PHOTOS as P } from "@/components/marketing/hero-mock";

// Sample screens only (made-up restaurants), labelled as samples below.
const SCREENS = [
  { restaurant: "Saffron Thali House", dish: "Tikka Platter", price: 240, img: P.starters, tone: "#0E3B36" },
  { restaurant: "Konkan Kitchen", dish: "Veg Biryani", price: 220, img: P.rice, tone: "#111111" },
  { restaurant: "Corner Chai Café", dish: "Virgin Mojito", price: 140, img: P.drinks, tone: "#5A2E1A" },
  { restaurant: "Dakshin Dosa Co.", dish: "Tandoori Chicken", price: 320, img: P.breads, tone: "#24361F" },
  { restaurant: "Sip & Snack", dish: "Fresh Lime Soda", price: 90, img: P.dessert, tone: "#3A1E3A" },
  { restaurant: "Punjabi Tadka", dish: "Veg Thali", price: 260, img: P.main, tone: "#1E2A44" },
];

/** Golden band with a slow, endless strip of sample menu screens. */
export function ShowcaseBand() {
  return (
    <section aria-label="Sample guest menus" className="overflow-hidden bg-gold py-20 lg:py-24">
      <div className="ed-marquee" style={{ ["--marquee-duration" as string]: "50s" }}>
        <div className="ed-marquee-track gap-6 pr-6">
          {[...SCREENS, ...SCREENS].map((s, i) => (
            <div key={i} className="transition-transform duration-300 hover:-translate-y-2">
              <PhoneScreen {...s} />
            </div>
          ))}
        </div>
      </div>
      <p className="mt-10 px-5 text-center text-sm text-foreground/70">
        Sample menus. Every restaurant gets the same clean guest menu with its own name and logo.
      </p>
    </section>
  );
}
