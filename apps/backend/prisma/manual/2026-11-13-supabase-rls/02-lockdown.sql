-- EasyDine: close direct Supabase Data API access to EasyDine tables.
-- NOT a Prisma migration: apply manually, only after approval, backup and
-- the checks in README.md. Safe to run twice (idempotent).
--
-- Verified live (2026-11-13, read-only): the backend connects as `postgres`
-- (owner of every table, BYPASSRLS = true), so it is not affected. EasyDine
-- has no code that uses the Supabase anon/authenticated roles (no supabase-js,
-- no Data API calls). Those roles currently hold ALL privileges on all 94
-- tables with RLS off, which this closes.
--
-- What it does, for the explicit EasyDine table list below only:
--   1. ENABLE ROW LEVEL SECURITY (no policies = deny for non-bypass roles).
--      Not FORCE: the owner (postgres = backend) keeps working.
--   2. REVOKE ALL privileges from anon and authenticated.
--   3. Revoke EXECUTE on EasyDine's public functions from anon,
--      authenticated and PUBLIC (triggers still fire as before).
--   4. Stop future tables/sequences/functions created by postgres (Prisma
--      migrations) from being granted to anon/authenticated by default.
-- It never disables RLS, never creates a permissive policy, never touches
-- service_role, other schemas or Supabase-managed objects.

BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $$
DECLARE
  easydine_tables text[] := ARRAY[
    '_prisma_migrations',
    'attendance',
    'audit_logs',
    'backup_config',
    'backups',
    'bank_transactions',
    'branches',
    'budgets',
    'campaigns',
    'cash_closings',
    'combo_components',
    'coupons',
    'customer_addresses',
    'customers',
    'delivery_zones',
    'departments',
    'device_tokens',
    'document_files',
    'documents',
    'download_stats',
    'equipment',
    'expenses',
    'floors',
    'gateway_payments',
    'gateway_refunds',
    'gateway_webhook_events',
    'gift_card_redemptions',
    'gift_cards',
    'goods_receipt_items',
    'goods_receipts',
    'ingredients',
    'integration_api_keys',
    'integration_connections',
    'integration_logs',
    'kitchen_stations',
    'kot_items',
    'kots',
    'leave_requests',
    'menu_categories',
    'menu_item_modifier_groups',
    'menu_items',
    'modifier_groups',
    'modifiers',
    'notifications',
    'order_item_modifiers',
    'order_item_stock_returns',
    'order_items',
    'orders',
    'payment_gateway_catalog',
    'payment_gateway_connections',
    'payments',
    'payroll_lines',
    'payroll_runs',
    'permissions',
    'points_ledger',
    'print_jobs',
    'promotions',
    'purchase_order_items',
    'purchase_orders',
    'purchase_request_items',
    'purchase_requests',
    'recipe_ingredients',
    'referrals',
    'refunds',
    'report_schedules',
    'reservations',
    'restaurants',
    'role_permissions',
    'roles',
    'service_logs',
    'shifts',
    'staff_api_keys',
    'staff_pay',
    'stock_batches',
    'stock_movements',
    'stock_transfers',
    'supplier_invoices',
    'supplier_payments',
    'supplier_quotation_items',
    'supplier_quotations',
    'suppliers',
    'sync_changes',
    'sync_state',
    'table_requests',
    'tables',
    'user_branches',
    'user_permission_overrides',
    'users',
    'verifactu_records',
    'verifactu_settings',
    'waitlist_entries',
    'waste_logs',
    'webhook_deliveries',
    'webhook_endpoints'
  ];
  t text;
  missing text[] := '{}';
BEGIN
  FOREACH t IN ARRAY easydine_tables LOOP
    IF to_regclass(format('public.%I', t)) IS NULL THEN
      missing := missing || t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
  END LOOP;
  IF array_length(missing, 1) > 0 THEN
    RAISE NOTICE 'Skipped (not present): %', missing;
  END IF;
END $$;

-- Sequences behind EasyDine tables (Prisma autoincrement / ids).
DO $$
DECLARE s record;
BEGIN
  FOR s IN
    SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'S' AND pg_get_userbyid(c.relowner) = 'postgres'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE public.%I FROM anon, authenticated', s.relname);
  END LOOP;
END $$;

-- EasyDine's own functions (sync + Verifactu triggers). Triggers keep firing:
-- trigger functions run regardless of EXECUTE for the calling role.
DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('sync_install_triggers','sync_is_synced_table','sync_log_change','sync_seed',
                        'verifactu_records_guard','verifactu_records_no_truncate')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, authenticated, PUBLIC', f.sig);
  END LOOP;
END $$;

-- Future objects created by postgres (Prisma migrations) in public.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, PUBLIC;

COMMIT;
