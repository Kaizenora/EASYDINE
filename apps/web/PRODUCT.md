# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

1. **Restaurant customers** on their own phones, at the table. Mixed ages, many using QR ordering for the first time. They scan the table QR (no app install), browse the menu, order, track it, and pay. Their language may be English, Hindi or Marathi.
2. **Cashiers** on a PC at the counter during rush hours. Speed matters most: see table status at a glance, accept orders, print KOTs, print and reprint bills.
3. **Kitchen staff** reading a live order display from a distance, at a glance, with busy hands.
4. **Restaurant owners** who set up and run the restaurant: menu, tables and QR cards, staff logins, loyalty rules, languages, backup/export.

## Product Purpose

EasyDine is a multi-tenant QR table-ordering and billing SaaS for restaurants. Tagline: "Dine smarter, not harder."

A customer scans the table QR, sees the menu with photos, adds items and preferences, places the order, tracks live status, views the bill and pays. The cashier runs a PC dashboard with table statuses, KOT print and bill print/reprint. The kitchen gets a live order display. The owner manages everything in an admin panel.

Success for the pilot: one month of real daily billing at real restaurants with no lost orders, no wrong bills, and staff who trust the screen.

## Positioning

Ordering and billing in one system, built for Indian restaurants: the customer orders from their own phone with no app, in English, Hindi or Marathi, and the same order flows straight to the kitchen display, KOT printer and GST bill.

## Operating Context

- **Hosted multi-tenant SaaS**: one backend (Railway) and one web frontend (Vercel, easydinein.vercel.app) serve 9-10+ restaurants. The repo's older offline-first / self-hosted framing is legacy and must not be pitched.
- Each restaurant sees only its own name and logo. The EasyDine design system stays the same for every tenant.
- Customer screens run in a phone browser opened from a printed table QR card.
- Cashier screens run on a counter PC with thermal (80mm) and A4 printers; KOTs and bills go through the browser print dialog or the paired Print Helper.
- Kitchen display runs on a screen in the kitchen.
- Stage: pre-launch. A one-month real-billing pilot is planned; real money depends on the UI daily.

## Capabilities and Constraints

- Existing Next.js app (`apps/web`) with Tailwind v4, Lucide icons, shadcn/base-ui components. Routes and backend API contracts must be preserved during the UI overhaul.
- Existing surfaces: marketing landing (`app/page.tsx`), customer QR ordering (`app/order/[qrToken]`), POS / orders / tables / KDS / menu / reports / settings under `app/(dashboard)`, kiosk, customer display.
- The dashboard also contains non-pilot modules (inventory, accounting, payroll/attendance, reservations, delivery, marketing, many settings pages). They stay working and inherit the shared theme tokens; only the pilot surfaces get a full redesign.
- Languages: English, Hindi, Marathi. Marathi is essential. Hindi and Marathi locales are being added to `lib/i18n` screen by screen; screens currently hard-coded in English (including the customer QR page) move their text into the dictionaries as they are redone. Spanish and French dictionaries exist and are kept.
- All money (prices, tax, GST, loyalty) is computed server-side; the UI only displays it.
- Speech-to-text for order preferences writes into the text field only. Audio is never stored.
- Open: the customer QR page has no online-pay step or loyalty-points display today. Whether these can be shown without backend changes is decided when that screen is redone.

## Brand Commitments

- Name: EasyDine. Tagline: "Dine smarter, not harder."
- Logo: teal "easydine" wordmark plus a solid teal circle badge with cream letters.
- Personality: teal, clean, minimal, "simple and clear". It must feel solid and trustworthy.
- Hard rule: it must not look AI-generated. No generic gradients, no purple/blue defaults, no emoji as icons, no glassmorphism, no decorative blobs, no stock 3D illustrations.
- Contact: sgcreates18@gmail.com, Instagram @easydine._

## Evidence on Hand

- Product screenshots: `public/screenshots/` (dashboard, KDS, POS, tables; light theme, from the previous visual system).
- Logo files: `public/logo.png`, `public/brand-lockup.png`, `public/icons/`.
- Real dish photos are uploaded per restaurant; there is no shared photo library.
- No testimonials, customer logos, case studies, pricing or usage numbers exist. Do not invent any.

## Product Principles

1. **Trust over flash.** Real money moves through every screen. Numbers, totals and statuses must be unmistakable.
2. **Fast under pressure.** Cashier and kitchen screens are judged at rush hour: fewer clicks, glanceable state.
3. **No one gets lost.** A first-time customer of any age, in any of the three languages, can order without help.
4. **The restaurant's name, EasyDine's system.** Tenants bring their identity; the product stays one consistent, recognisable system.
5. **Plain words.** Say what a thing does. No marketing filler.

## Accessibility & Inclusion

- Mixed-age customers on phones: large touch targets and readable text sizes.
- Every screen must work in English, Hindi and Marathi with no truncated or broken text; Devanagari needs room to wrap.
- Kitchen display must be readable at a distance.
