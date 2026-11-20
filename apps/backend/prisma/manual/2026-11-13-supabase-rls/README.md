# Supabase RLS lockdown (prepared, NOT applied)

Status: **prepared for approval.** Nothing here has been run against any
database. There is no staging database (no paid staging), so the SQL is
**untested on a real database**. Read-only facts below were checked live on
2026-11-13 in the Supabase SQL editor (SELECT only).

## What was verified live (read-only)

| Check | Result |
|---|---|
| Backend DB role | `postgres` (10 pooled connections via Supavisor) |
| `postgres` | owner of all 94 `public` tables, `BYPASSRLS = true`, not superuser |
| Data API | enabled; `public` exposed; PostgREST connected as `authenticator` |
| RLS | **off on all 94 tables**, 0 policies |
| `anon` / `authenticated` | **ALL privileges (incl. DELETE, TRUNCATE) on all 94 tables**, USAGE on `public`, EXECUTE on the 6 EasyDine functions, 2 sequence grants |
| Tables | 93 Prisma models + `_prisma_migrations` = exactly the 94 live tables |
| EasyDine code | no Supabase client, no Data API use, all access through the backend |

Risk today: anyone with the project's anon API key can read or change any
EasyDine table (customers, staff, password hashes, orders) over the Supabase
REST API, bypassing every backend tenant check.

## Files

1. `01-verify.sql`: read-only inventory. Run before and after.
2. `02-lockdown.sql`: the change. For the explicit EasyDine table list:
   enable RLS (no policies, not FORCE), revoke all from `anon` /
   `authenticated`, revoke function EXECUTE, and stop default grants on
   future objects. Idempotent, single transaction, 5 s lock timeout.

The backend keeps working because it connects as the table owner with
BYPASSRLS. RLS is **not** a substitute for the backend's tenant checks
(branch scoping, `BranchAccessService`), which stay as they are.

## Before applying (needs your approval)

1. **Backup.** The project shows "No backups" (free plan). Take one and prove
   it restores:
   - `pg_dump "$DIRECT_DATABASE_URL" --format=custom --no-owner --file easydine-YYYYMMDD.dump`
     (use the *direct* connection string from Supabase › Connect; do not paste
     it into chat).
   - Restore test into a throwaway local database:
     `createdb easydine_restore_test && pg_restore --no-owner -d easydine_restore_test easydine-YYYYMMDD.dump`
     then `select count(*) from orders;` matches production.
2. Pick a quiet time (closed hours). The change takes brief locks per table.
3. Run `01-verify.sql` and save the output.

## Apply

Supabase › SQL editor › paste `02-lockdown.sql` › Run. Then run
`01-verify.sql` again. Expected after:

- RLS enabled on 94, disabled on 0; policies 0
- no `anon` / `authenticated` rows in table grants; sequence grants 0
- all function `anon_exec` / `authenticated_exec` = false
- `postgres` still `rolbypassrls = true`

## Test right after (production, closed hours)

- Direct API denied: `curl "https://<project>.supabase.co/rest/v1/orders?select=id&limit=1" -H "apikey: <anon key>" -H "Authorization: Bearer <anon key>"`
  → `401`/`403` or `[]` with permission denied (not rows).
- EasyDine: staff login, POS order (dine-in, takeaway), customer QR order
  (menu, place order, status), Accept & KOT, KDS steps, bill print, KOT print.
- Backend `/api/health` stays `ok`; Railway logs show no permission errors.

## Rollback

Not expected to be needed: EasyDine does not use `anon` / `authenticated`.
If something unexpected depended on direct API access, do **not** disable RLS
or re-grant everything. Find the exact table and caller, then decide a
targeted fix together. Data problems are restored from the verified backup.

Also recommended (dashboard setting, needs approval): Supabase › Data API ›
Settings › turn off "Automatically expose new tables".
