-- READ-ONLY. Run before and after 02-lockdown.sql (Supabase SQL editor).
-- Prints no secrets.

-- 1. Who connects (backend = postgres via Supavisor; Data API = authenticator).
select usename as db_role, application_name, count(*) as connections
from pg_stat_activity
where datname = current_database() and usename is not null
group by 1, 2 order by 3 desc;

-- 2. Roles that matter. Backend role must keep BYPASSRLS = true.
select rolname, rolbypassrls, rolsuper
from pg_roles
where rolname in ('postgres', 'anon', 'authenticated', 'service_role', 'authenticator');

-- 3. RLS status of public tables.     Before: 0 enabled / 94 without.  After: 94 / 0.
select count(*) filter (where rowsecurity) as rls_enabled,
       count(*) filter (where not rowsecurity) as rls_disabled
from pg_tables where schemaname = 'public';

-- 4. Table privileges of the Data API roles.  Before: 94 tables each.  After: 0 rows.
select grantee, count(distinct table_name) as tables, string_agg(distinct privilege_type, ',') as privileges
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
group by grantee;

-- 5. Policies.  Expected 0 before and after (no permissive policy is added).
select count(*) as policies from pg_policies where schemaname = 'public';

-- 6. Function EXECUTE for Data API roles.  After: all false.
select p.proname,
       has_function_privilege('anon', p.oid, 'EXECUTE') as anon_exec,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_exec
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' order by 1;

-- 7. Sequences still granted to Data API roles.  After: 0.
select count(*) as sequence_grants
from information_schema.role_usage_grants
where object_schema = 'public' and grantee in ('anon', 'authenticated');

-- 8. New tables would be granted to Data API roles by default?  After: no rows for anon/authenticated.
select pg_get_userbyid(d.defaclrole) as owner, d.defaclobjtype, d.defaclacl
from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
where n.nspname = 'public';
