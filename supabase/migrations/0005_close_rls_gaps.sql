-- Window CRM — close the row-level-security gaps that defeated tenant isolation.
--
-- WHAT WENT WRONG
-- ---------------
-- `schema.sql` is the ORIGINAL single-tenant schema. It grants every logged-in
-- user full access to every business table:
--
--     CREATE POLICY authenticated_all_leads ON leads
--       FOR ALL TO authenticated USING (true);
--
-- 0003/0004 later added correct tenant-scoped policies alongside those, but
-- never removed them. Postgres combines PERMISSIVE policies with OR, so a
-- policy of `USING (true)` grants everything and the tenant policy can never
-- deny anything. Isolation was therefore off on 43 tables while *looking*
-- correct — RLS was enabled, tenant policies existed, and `pg_policies` listed
-- them. A live two-tenant test is what exposed it: company B could read,
-- update, delete and insert into company A's leads.
--
-- Two distinct fixes below.
--
-- SAFETY: transactional. Any failure rolls the whole migration back.

BEGIN;

-- ── 1. Remove every blanket "any authenticated user" policy ────────────────
-- Matched by name AND by predicate, so a renamed copy cannot slip through.
DO $$
DECLARE r RECORD; n INT := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND policyname LIKE 'authenticated_all_%'
      AND coalesce(qual, 'true') = 'true'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', r.policyname, r.tablename);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'dropped % blanket policies', n;
END $$;

-- ── 2. Tenant-scope the per-company configuration tables ───────────────────
-- 0003's business_tables array missed these six. They are per-company data —
-- the services a company sells, where it works, its lead sources and settings
-- — not global reference data. Left unscoped and writable, one company could
-- read and overwrite another's configuration.
DO $$
DECLARE
  cfg_tables TEXT[] := ARRAY[
    'company_settings','lead_sources','product_lines',
    'service_areas','services','window_manufacturers'
  ];
  t TEXT;
BEGIN
  FOREACH t IN ARRAY cfg_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables
                WHERE table_schema = 'public' AND table_name = t) THEN

      EXECUTE format(
        'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id UUID
           REFERENCES tenants(id) ON DELETE CASCADE;', t);

      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I;', t || '_tenant_isolation', t);
      EXECUTE format($p$
        CREATE POLICY %I ON public.%I FOR ALL TO authenticated
          USING (
            current_user_has_active_membership(tenant_id)
            OR current_user_is_platform_admin()
          )
          WITH CHECK (current_user_has_active_membership(tenant_id));
      $p$, t || '_tenant_isolation', t);

      EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(tenant_id);',
                     'idx_' || t || '_tenant', t);
    END IF;
  END LOOP;
END $$;

-- ── 3. Fail the migration if any gap remains ───────────────────────────────
-- A tenant-owned table with RLS enabled but no restricting policy is either
-- wide open or completely unreachable. Neither is acceptable, so this aborts
-- rather than leaving a silent hole.
DO $$
DECLARE bad TEXT;
BEGIN
  SELECT string_agg(c.relname, ', ')
    INTO bad
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public'
     AND c.relkind = 'r'
     AND EXISTS (SELECT 1 FROM information_schema.columns col
                  WHERE col.table_schema = 'public'
                    AND col.table_name = c.relname
                    AND col.column_name = 'tenant_id')
     AND NOT EXISTS (SELECT 1 FROM pg_policies p
                      WHERE p.schemaname = 'public'
                        AND p.tablename = c.relname
                        AND coalesce(p.qual, 'true') <> 'true');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'tenant-owned tables still lack a restricting policy: %', bad;
  END IF;
END $$;

DO $$
DECLARE bad TEXT;
BEGIN
  SELECT string_agg(tablename || '.' || policyname, ', ')
    INTO bad
    FROM pg_policies
   WHERE schemaname = 'public'
     AND cmd = 'ALL'
     AND coalesce(qual, 'true') = 'true';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION 'blanket ALL policies still present: %', bad;
  END IF;
END $$;

COMMIT;
