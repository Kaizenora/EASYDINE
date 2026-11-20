---
version: 1
slug: "app-page-tsx"
primary_target: "app/page.tsx"
related_targets: ["components/marketing/hero.tsx"]
---

## Scope

Public landing page at `/` (app/page.tsx). Mode: Persuade. Always rendered light (`.theme-light`), whatever the OS setting.

Audience: restaurant owners and managers (mostly India, Maharashtra-first) evaluating EasyDine before the one-month pilot. Action: Book a demo (pre-filled email to sgcreates18@gmail.com until a booking form exists). Proof on hand: none beyond the product itself. No testimonials, logos or numbers may be invented. Signed-in staff are redirected to /dashboard.

## Direction contract

THESIS: The table card and the guest's phone are the product. The hero shows the physical QR card next to the phone menu it opens, instead of an abstract dashboard screenshot or a stock photo.

OWN-WORLD: Cream #FBFAF7 page, white surfaces, 1px #E7E5E0 borders, teal #0F766E for action and the full-width pilot band with cream text. Space Grotesk headings, Inter body, Noto Sans Devanagari fallback. Lucide icons at 20px. Indian veg/non-veg square markers, grey first-letter dish placeholders. No gradients, glass or emoji.

STORY: The visitor sees the tagline, understands that "QR ordering and billing for restaurants" means the guest orders from their own phone, follows Scan → Order → Pay, scans the six capabilities, then books a demo from the hero, nav or pilot band.

FIRST VIEWPORT: Desktop: sticky nav (badge + wordmark left; How it works, Features, Sign in, teal Book a demo right). Left column: 40px headline, 20px subline, Book a demo (primary) and See how it works (secondary), one line on no-app + EN/हिंदी/मराठी. Right: a 300px CSS phone showing a sample menu (category chips, four dishes with markers, steppers, a teal cart bar at ₹360) with a cream T4 table card holding a real QR overlapping its lower-left edge, captioned as a sample. Mobile: copy and full-width buttons first, mock below.

FORM: Split hero, as pinned by the brief. seed: none (pinned) — world: "cream hero … one solid-teal pilot CTA band with cream text" plus the user-pinned DESIGN.md palette and type ("Primary teal #0F766E … Page background cream #FBFAF7 … Headings: Space Grotesk"); experience: "left side tagline headline + one plain subline … right side a real product screenshot or a simple CSS-built QR-to-menu mock, no stock art". Table card: user asked for the QR to look "very professional and clean" (components/brand/table-qr-card.tsx).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
