# EasyDine Design System

Teal, clean, minimal: "simple and clear". This one system is used by every restaurant on EasyDine. Tenants bring their own name and logo; they do not bring colours or fonts.

Source of truth for tokens: `app/globals.css` (`:root` custom properties exposed as Tailwind theme tokens). This file replaces the older `/DESIGN_SYSTEM.md` at the repo root (violet/wine/red palettes) for `apps/web`.

## Palette

| Token | Hex | Use |
|---|---|---|
| `primary` | `#0F766E` | Primary buttons, links, active states, focus ring |
| `primary-hover` | `#115E59` | Hover / pressed on primary |
| `tint` (`accent`) | `#F0FDFA` | Selected rows, chips, highlights |
| `background` | `#FBFAF7` | Page background (cream) |
| `card` | `#FFFFFF` | Surfaces, cards, sheets |
| `border` | `#E7E5E0` | All 1px borders |
| `foreground` (ink) | `#1C1917` | Headings and body text |
| `muted-foreground` | `#57534E` | Secondary text |
| `success` / veg | `#15803D` | Success, veg marker, Available |
| `warning` | `#B45309` | Warnings, Cleaning |
| `destructive` / non-veg | `#B91C1C` | Danger, non-veg marker, Bill requested |
| `amber` | `#D97706` | Ratings and loyalty only |

Table status: Available `#15803D`, Occupied `#0F766E`, Cleaning `#B45309`, Bill requested `#B91C1C`. One hue per meaning, everywhere.

Colour strategy: Restrained. Cream and white carry the page; teal does real jobs (action, selection, state). On the landing page teal may own a whole band (the pilot CTA).

## Typography

- Headings: **Space Grotesk** 600/700, letter-spacing -0.02em.
- Body / UI: **Inter** 400/500/600.
- Hindi / Marathi: **Noto Sans Devanagari** is in every font stack as the fallback, same weights. Devanagari lines need extra line height (≥1.5 for body) and room to wrap: never fix widths on translated labels.
- Prices, order numbers, bill amounts, timers: `tabular-nums`.
- Scale (px): 12 / 14 / 16 / 20 / 24 / 32. Landing headline max 40px.

## Spacing and shape

- 4px base grid. Steps: 4 / 8 / 12 / 16 / 24 / 32 / 48.
- Radius: 8px inputs and buttons, 12px cards, 999px chips.
- Borders: 1px `#E7E5E0`.
- Shadow: at most one, `0 1px 2px rgba(0,0,0,0.06)`. No layered or coloured shadows.

## Components

- **Buttons**: primary = solid teal, white text. Secondary = white, 1px border, ink text. Danger = outline only (red border + red text). Height 44px on mobile, 36px on desktop.
- **Icons**: Lucide only, 20px default. Never emoji.
- **Veg / non-veg**: standard Indian square marker, 12px: square outline with a filled dot, green (veg) or red (non-veg).
- **Status chips**: tinted background + coloured text in the same hue, 999px radius. One hue per meaning.
- **Mobile add-ons and filters**: bottom sheets. **Confirmations**: toasts.
- **Dish photo placeholder**: plain grey box with the dish's first letter. Never a generated illustration.
- **Forms**: single column, labels above inputs.

## Print

Bills and KOTs: pure black on white, no colour. Formats: 80mm thermal and A4. Bill header = restaurant logo; footer = small "Powered by EasyDine". KOT = large item + qty, table number, preferences, no prices.

## Anti-AI checklist (reject any output that has these)

- No linear gradients anywhere, especially purple/blue.
- No emoji in the UI, no glass/blur panels, no floating decorative shapes.
- No cards nested inside cards, no rainbow of chip colours.
- No vague marketing copy ("Unlock", "Elevate", "Supercharge"). Write plain words.
- Real dish photos only. No stock art, no 3D renders.
