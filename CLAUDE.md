# EasyDine

Multi-restaurant QR ordering + billing system, sold to many restaurants. Customer scans a table QR, orders from the menu; cashier accepts, KOT prints in the kitchen, cashier marks paid at the counter, bill prints. Repo: Kaizenora/EASYDINE.

## Stack
- Frontend: Next.js (hosted on Vercel), Tailwind
- Backend: NestJS (hosted on Railway, manual deploys)
- DB: Supabase PostgreSQL, Prisma ORM (migrations in prisma/migrations)
- Realtime: Socket.IO
- Voice: Sarvam STT (saaras:v4, language_code "unknown") via a server-side route only
- Printing: browser print dialog + local print helper (KOT to kitchen, bill to counter)
- Validation: zod for LLM/voice actions

## Commands
- Install: `pnpm install` (repo root; pnpm workspace + turbo monorepo)
- Dev: `pnpm dev` (all apps via turbo) | `pnpm --filter @easydine/backend dev` | `pnpm --filter web dev`
- Test: `pnpm test` (turbo) | `pnpm --filter @easydine/backend test` (jest) | `pnpm --filter web test` (node --test) (known: some backend tests were failing, check before blaming your change)
- Lint: `pnpm lint` (turbo; note backend lint runs `eslint --fix` and edits files) | typecheck: `pnpm typecheck`
- Build: `pnpm build` (turbo) | `pnpm --filter @easydine/backend build` (prisma generate + nest build) | `pnpm --filter web build`
- Prisma: `pnpm --filter @easydine/backend prisma:migrate` (migrate dev, local only) / `pnpm --filter @easydine/backend prisma:deploy` (migrate deploy, live DB: ask first) / `prisma:generate`

## Hard rules
1. **Multi-tenant isolation.** Every query, API, socket event and export is filtered by restaurant/branch. Never return data across restaurants. Backup/export is platform-admin only.
2. **Prisma only.** No raw SQL outside Prisma migrations. Never reset or delete live data. Migrations must be additive; tell me before anything that touches the live DB.
3. **Never store audio.** Voice and mic input becomes text, audio is discarded right after transcription. API keys (Sarvam etc.) live in server env only, never in the browser.
4. **Auth split.** Customers only reach the QR/takeaway links. Staff pages and APIs (cashier, POS, KDS, reports, settings) sit behind staff login. Platform-admin approves signups.
5. **No payment features for now.** Payment is at the counter after the meal: cashier confirms Paid with mode. Do not add online payment.
6. **Keep it simple.** Core flow: account, menu/tables/QR, order, Accept + KOT, Paid, bill, customer history. Removed modules stay removed: attendance, suppliers, campaigns/referrals, loyalty points, Veri*Factu. Do not delete DB tables for them.
7. **Do not touch** the working logo fix, the QR card design, or existing printing flow unless the task says so.

## Product rules
- Languages: English, Hindi, Marathi only. Voice auto-detects language; no language picker for voice.
- Voice ordering: add the closest menu dish directly; if quantity is unclear, ask "Kitne <dish>?" Never assume 1. Customer confirms before cart changes.
- Table labels: T1, T2. Table status: Available / Occupied / Reserved / Cleaning / Out of service.
- Customer identity is the phone number. Customer saved in Customers after payment.
- Cashier can print or reprint any bill at any time.
- Outages of 5-10 min: orders must be idempotent (requestId), no duplicate orders or KOTs.
- Product is generic. Never hardcode a restaurant name (Sanjog is only a reference).
- Nodedr is a flow reference only. Do not copy its code or UI.

## Standards
- TypeScript strict, no `any`.
- Validate all external/LLM input with zod.
- Mobile-first customer UI, readable normal fonts, fast load. Avoid refetching on every tab.
- Small diffs. Run build and tests before saying done. Report what you verified and what you did not.
- `[FILL IN: any extra conventions, e.g. JSDoc, folder layout]`
