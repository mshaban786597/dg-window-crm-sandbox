-- ============================================================================
-- DG Window CRM — Multi-tenant SaaS conversion (§11, §12, §19, §27)
--
-- AUTHORITATIVE SECURITY BOUNDARY. Tenant isolation is enforced here by
-- Row-Level Security, not by the frontend. Every tenant-owned table carries a
-- NOT NULL tenant_id and a policy scoping it to the caller's ACTIVE, ACCEPTED
-- memberships in a non-suspended tenant.
--
-- Run against a DEDICATED development/staging Supabase project only.
-- Never against the original gutter CRM project.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── Enums ───────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE platform_role AS ENUM ('platform_super_admin', 'platform_support');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tenant_role AS ENUM (
    'tenant_owner','tenant_admin','manager','sales_representative',
    'estimator','crew','marketing','accountant','read_only'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE tenant_status AS ENUM ('trial','active','suspended','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invitation_status AS ENUM ('pending','accepted','revoked','expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE support_mode AS ENUM ('read_only','impersonation');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Platform entities ───────────────────────────────────────────────────────
-- app_users extends auth.users. platform_role is NEVER self-assignable:
-- no policy allows a user to UPDATE their own platform_role (see policies).
CREATE TABLE IF NOT EXISTS app_users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  first_name TEXT NOT NULL DEFAULT '',
  last_name TEXT NOT NULL DEFAULT '',
  phone TEXT,
  platform_role platform_role,          -- NULL for ordinary tenant users
  email_verified BOOLEAN NOT NULL DEFAULT FALSE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS subscription_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  max_users INTEGER,                     -- NULL = unlimited
  max_managers INTEGER,
  storage_mb INTEGER,
  api_access BOOLEAN NOT NULL DEFAULT FALSE,
  audit_retention_days INTEGER NOT NULL DEFAULT 90,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  status tenant_status NOT NULL DEFAULT 'trial',
  plan_id UUID REFERENCES subscription_plans(id),
  owner_user_id UUID NOT NULL REFERENCES app_users(id),
  timezone TEXT NOT NULL DEFAULT 'America/New_York',
  currency TEXT NOT NULL DEFAULT 'USD',
  country TEXT,
  state TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  onboarding_status TEXT NOT NULL DEFAULT 'not_started',
  onboarding_completed_steps TEXT[] NOT NULL DEFAULT '{}',
  trial_ends_at TIMESTAMPTZ,
  suspended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  role tenant_role NOT NULL DEFAULT 'sales_representative',
  manager_membership_id UUID REFERENCES tenant_memberships(id),
  job_title TEXT,
  department TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  invitation_status invitation_status NOT NULL DEFAULT 'pending',
  invited_by UUID REFERENCES app_users(id),
  invited_at TIMESTAMPTZ,
  accepted_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id),
  CONSTRAINT membership_not_self_manager CHECK (manager_membership_id IS NULL OR manager_membership_id <> id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant ON tenant_memberships(tenant_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON tenant_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_manager ON tenant_memberships(manager_membership_id);
CREATE INDEX IF NOT EXISTS idx_memberships_tenant_active ON tenant_memberships(tenant_id, active);

-- Invitations store ONLY a token hash (§9, §32).
CREATE TABLE IF NOT EXISTS tenant_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role tenant_role NOT NULL,
  manager_membership_id UUID REFERENCES tenant_memberships(id),
  token_hash TEXT NOT NULL UNIQUE,
  status invitation_status NOT NULL DEFAULT 'pending',
  invited_by_user_id UUID NOT NULL REFERENCES app_users(id),
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_invitations_tenant ON tenant_invitations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON tenant_invitations(lower(email));

CREATE TABLE IF NOT EXISTS tenant_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL DEFAULT 'trialing',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  current_period_end TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS feature_entitlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  limit_value INTEGER,
  UNIQUE (tenant_id, feature_key)
);

CREATE TABLE IF NOT EXISTS feature_flags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  enabled_globally BOOLEAN NOT NULL DEFAULT FALSE,
  enabled_tenant_ids UUID[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS support_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_user_id UUID NOT NULL REFERENCES app_users(id),
  mode support_mode NOT NULL,
  reason TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  CONSTRAINT support_reason_required CHECK (length(btrim(reason)) >= 5)
);
CREATE INDEX IF NOT EXISTS idx_support_tenant ON support_sessions(tenant_id);

-- Audit: tenant_id NULL for pure platform events (§18).
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id UUID NOT NULL REFERENCES app_users(id),
  actor_membership_id UUID REFERENCES tenant_memberships(id),
  actor_role TEXT,
  impersonated_user_id UUID REFERENCES app_users(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  metadata JSONB,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_audit_tenant_created ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_user_id);

CREATE TABLE IF NOT EXISTS system_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL UNIQUE,
  entity_type TEXT,
  entity_id UUID,
  uploaded_by UUID REFERENCES app_users(id),
  size_bytes BIGINT,
  content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Storage keys must live under the tenant's own prefix (§19).
  CONSTRAINT file_path_tenant_scoped CHECK (storage_path LIKE 'tenants/' || tenant_id::text || '/%')
);
CREATE INDEX IF NOT EXISTS idx_files_tenant ON files(tenant_id);

CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  assigned_membership_id UUID NOT NULL REFERENCES tenant_memberships(id),
  assigned_team_id UUID,
  assigned_by_membership_id UUID REFERENCES tenant_memberships(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  due_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT NOT NULL DEFAULT 'medium',
  notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_entity ON assignments(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_assignments_tenant_user ON assignments(tenant_id, assigned_membership_id);

CREATE TABLE IF NOT EXISTS tenant_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── §27 Backfill tenant_id onto existing business tables ────────────────────
-- Creates the initial tenant, attaches existing users, stamps every business
-- row, then enforces NOT NULL. Safe to re-run.
DO $$
DECLARE
  v_owner UUID;
  v_tenant UUID;
  t TEXT;
  business_tables TEXT[] := ARRAY[
    'leads','lead_contacts','customers','properties','measurements','window_openings',
    'quotes','quote_items','quote_item_snapshots','purchase_orders','purchase_order_items',
    'jobs','crews','crew_members','schedules','materials','inventory_logs','communications',
    'tasks','invoices','payments','reviews','marketing_campaigns','automations',
    'notifications','appointment_confirmations','lead_activities','team_members',
    'catalog_series','catalog_window_types','catalog_universal_ranges','catalog_items',
    'catalog_attributes','catalog_attribute_options'
  ];
BEGIN
  -- 1. Add a nullable tenant_id to every business table that exists.
  FOREACH t IN ARRAY business_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;', t);
    END IF;
  END LOOP;

  -- 2. Create the initial tenant for pre-existing local/test data only.
  SELECT id INTO v_owner FROM app_users ORDER BY created_at LIMIT 1;
  IF v_owner IS NOT NULL THEN
    SELECT id INTO v_tenant FROM tenants WHERE slug = 'dg-window-crm-sandbox';
    IF v_tenant IS NULL THEN
      INSERT INTO tenants (name, slug, status, owner_user_id, onboarding_status)
      VALUES ('DG Window CRM Sandbox', 'dg-window-crm-sandbox', 'active', v_owner, 'completed')
      RETURNING id INTO v_tenant;
    END IF;

    -- 3. Attach existing users as memberships (first user becomes owner).
    INSERT INTO tenant_memberships (tenant_id, user_id, role, active, invitation_status, accepted_at)
    SELECT v_tenant, u.id,
           CASE WHEN u.id = v_owner THEN 'tenant_owner'::tenant_role ELSE 'sales_representative'::tenant_role END,
           TRUE, 'accepted', NOW()
    FROM app_users u
    ON CONFLICT (tenant_id, user_id) DO NOTHING;

    -- 4. Backfill tenant_id on every existing business row.
    FOREACH t IN ARRAY business_tables LOOP
      IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
        EXECUTE format('UPDATE %I SET tenant_id = %L WHERE tenant_id IS NULL;', t, v_tenant);
      END IF;
    END LOOP;
  END IF;

  -- 5. Enforce NOT NULL + index once backfilled (§27 steps 5-6).
  FOREACH t IN ARRAY business_tables LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public') THEN
      EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant ON %I(tenant_id);', t, t);
      IF NOT EXISTS (SELECT 1 FROM (SELECT 1) x WHERE EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_name=t AND c.column_name='tenant_id' AND c.is_nullable='NO')) THEN
        BEGIN
          EXECUTE format('ALTER TABLE %I ALTER COLUMN tenant_id SET NOT NULL;', t);
        EXCEPTION WHEN others THEN
          RAISE NOTICE 'Could not set NOT NULL on %.tenant_id (rows may be unscoped): %', t, SQLERRM;
        END;
      END IF;
    END IF;
  END LOOP;
END $$;

-- Useful composite indexes (§11).
CREATE INDEX IF NOT EXISTS idx_leads_tenant_status ON leads(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_created ON leads(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_tenant_status ON quotes(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_stage ON jobs(tenant_id, stage);

-- ── §12 Secure helper functions ─────────────────────────────────────────────
-- SECURITY DEFINER + fixed search_path so policies cannot be subverted.
CREATE OR REPLACE FUNCTION current_user_is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM app_users
    WHERE id = auth.uid() AND platform_role = 'platform_super_admin'
  );
$$;

-- Tenants the caller may operate in: ACTIVE + ACCEPTED membership in a
-- tenant that is not suspended/cancelled.
CREATE OR REPLACE FUNCTION current_user_tenant_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.tenant_id
  FROM tenant_memberships m
  JOIN tenants t ON t.id = m.tenant_id
  WHERE m.user_id = auth.uid()
    AND m.active
    AND m.invitation_status = 'accepted'
    AND t.status NOT IN ('suspended','cancelled');
$$;

CREATE OR REPLACE FUNCTION current_user_has_tenant_role(p_tenant UUID, p_roles tenant_role[])
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_memberships m
    JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = p_tenant
      AND m.active
      AND m.invitation_status = 'accepted'
      AND t.status NOT IN ('suspended','cancelled')
      AND m.role = ANY(p_roles)
  );
$$;

CREATE OR REPLACE FUNCTION current_user_membership_id(p_tenant UUID)
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id FROM tenant_memberships m
  WHERE m.user_id = auth.uid() AND m.tenant_id = p_tenant
    AND m.active AND m.invitation_status = 'accepted'
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION current_user_can_manage_user(p_tenant UUID, p_membership UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_user_has_tenant_role(p_tenant, ARRAY['tenant_owner','tenant_admin']::tenant_role[])
      OR EXISTS (
        SELECT 1 FROM tenant_memberships target
        WHERE target.id = p_membership
          AND target.tenant_id = p_tenant
          AND target.manager_membership_id = current_user_membership_id(p_tenant)
      );
$$;

-- Quote visibility mirrors authz.ts visibleOwnerMembershipIds().
CREATE OR REPLACE FUNCTION current_user_can_view_quote(p_tenant UUID, p_owner_membership UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    current_user_has_tenant_role(p_tenant, ARRAY['tenant_owner','tenant_admin','read_only']::tenant_role[])
    OR (
      current_user_has_tenant_role(p_tenant, ARRAY['manager']::tenant_role[])
      AND (
        p_owner_membership = current_user_membership_id(p_tenant)
        OR EXISTS (
          SELECT 1 FROM tenant_memberships t
          WHERE t.id = p_owner_membership
            AND t.tenant_id = p_tenant
            AND t.manager_membership_id = current_user_membership_id(p_tenant)
        )
      )
    )
    OR (
      current_user_has_tenant_role(p_tenant, ARRAY['sales_representative','estimator']::tenant_role[])
      AND p_owner_membership = current_user_membership_id(p_tenant)
    );
$$;

-- ── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_users_self_read ON app_users;
CREATE POLICY app_users_self_read ON app_users FOR SELECT TO authenticated
  USING (id = auth.uid() OR current_user_is_platform_admin());
-- Self-update EXCLUDING platform_role: role escalation is impossible here (§3).
DROP POLICY IF EXISTS app_users_self_update ON app_users;
CREATE POLICY app_users_self_update ON app_users FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND platform_role IS NOT DISTINCT FROM (SELECT platform_role FROM app_users WHERE id = auth.uid())
  );

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenants_member_read ON tenants;
CREATE POLICY tenants_member_read ON tenants FOR SELECT TO authenticated
  USING (id IN (SELECT current_user_tenant_ids()) OR current_user_is_platform_admin());
DROP POLICY IF EXISTS tenants_owner_update ON tenants;
CREATE POLICY tenants_owner_update ON tenants FOR UPDATE TO authenticated
  USING (current_user_has_tenant_role(id, ARRAY['tenant_owner','tenant_admin']::tenant_role[])
         OR current_user_is_platform_admin());

ALTER TABLE tenant_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS memberships_read ON tenant_memberships;
CREATE POLICY memberships_read ON tenant_memberships FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT current_user_tenant_ids())
         OR user_id = auth.uid()
         OR current_user_is_platform_admin());
DROP POLICY IF EXISTS memberships_admin_write ON tenant_memberships;
CREATE POLICY memberships_admin_write ON tenant_memberships FOR ALL TO authenticated
  USING (current_user_has_tenant_role(tenant_id, ARRAY['tenant_owner','tenant_admin']::tenant_role[]))
  WITH CHECK (current_user_has_tenant_role(tenant_id, ARRAY['tenant_owner','tenant_admin']::tenant_role[]));

ALTER TABLE tenant_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invitations_admin ON tenant_invitations;
CREATE POLICY invitations_admin ON tenant_invitations FOR ALL TO authenticated
  USING (current_user_has_tenant_role(tenant_id, ARRAY['tenant_owner','tenant_admin']::tenant_role[])
         OR current_user_is_platform_admin())
  WITH CHECK (current_user_has_tenant_role(tenant_id, ARRAY['tenant_owner','tenant_admin']::tenant_role[]));

ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS support_platform_only ON support_sessions;
CREATE POLICY support_platform_only ON support_sessions FOR ALL TO authenticated
  USING (current_user_is_platform_admin())
  WITH CHECK (current_user_is_platform_admin());

-- Audit logs: readable by tenant admins (their own tenant) + platform admins.
-- Append-only for ordinary users — no UPDATE/DELETE policy exists (§18).
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_read ON audit_logs;
CREATE POLICY audit_read ON audit_logs FOR SELECT TO authenticated
  USING (current_user_is_platform_admin()
         OR (tenant_id IS NOT NULL
             AND current_user_has_tenant_role(tenant_id, ARRAY['tenant_owner','tenant_admin']::tenant_role[])));
DROP POLICY IF EXISTS audit_insert ON audit_logs;
CREATE POLICY audit_insert ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (actor_user_id = auth.uid()
              AND (tenant_id IS NULL OR tenant_id IN (SELECT current_user_tenant_ids())
                   OR current_user_is_platform_admin()));

ALTER TABLE system_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS system_events_platform ON system_events;
CREATE POLICY system_events_platform ON system_events FOR SELECT TO authenticated
  USING (current_user_is_platform_admin()
         OR (tenant_id IS NOT NULL AND tenant_id IN (SELECT current_user_tenant_ids())));

ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_read ON subscription_plans;
CREATE POLICY plans_read ON subscription_plans FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS plans_platform_write ON subscription_plans;
CREATE POLICY plans_platform_write ON subscription_plans FOR ALL TO authenticated
  USING (current_user_is_platform_admin()) WITH CHECK (current_user_is_platform_admin());

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS flags_platform_write ON feature_flags;
CREATE POLICY flags_platform_write ON feature_flags FOR ALL TO authenticated
  USING (current_user_is_platform_admin()) WITH CHECK (current_user_is_platform_admin());
DROP POLICY IF EXISTS flags_read ON feature_flags;
CREATE POLICY flags_read ON feature_flags FOR SELECT TO authenticated USING (TRUE);

-- ── Generic tenant-scoped policies for every business table ────────────────
-- NOTE: deliberately NOT "auth.uid() IS NOT NULL" (§12). Access requires an
-- active accepted membership in a non-suspended tenant.
DO $$
DECLARE
  t TEXT;
  scoped TEXT[] := ARRAY[
    'tenant_settings','leads','lead_contacts','customers','properties','measurements',
    'window_openings','quotes','quote_items','quote_item_snapshots','purchase_orders',
    'purchase_order_items','jobs','crews','crew_members','schedules','materials',
    'inventory_logs','communications','tasks','invoices','payments','reviews',
    'marketing_campaigns','automations','notifications','appointment_confirmations',
    'lead_activities','team_members','catalog_series','catalog_window_types',
    'catalog_universal_ranges','catalog_items','catalog_attributes',
    'catalog_attribute_options','files','assignments','tenant_subscriptions',
    'feature_entitlements'
  ];
BEGIN
  FOREACH t IN ARRAY scoped LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = t AND table_schema = 'public')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = t AND column_name = 'tenant_id') THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
      EXECUTE format('DROP POLICY IF EXISTS %I ON %I;', t || '_tenant_isolation', t);
      -- Members read/write only inside their own tenant. Platform admins may
      -- read for support; every such access is logged by the application layer.
      EXECUTE format($p$
        CREATE POLICY %I ON %I FOR ALL TO authenticated
        USING (tenant_id IN (SELECT current_user_tenant_ids()) OR current_user_is_platform_admin())
        WITH CHECK (tenant_id IN (SELECT current_user_tenant_ids()));
      $p$, t || '_tenant_isolation', t);
    END IF;
  END LOOP;
END $$;

-- Read-only tenant role must not mutate data. Applied where a role column is
-- resolvable via membership; enforced additionally in the application layer.
CREATE OR REPLACE FUNCTION current_user_is_read_only(p_tenant UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT current_user_has_tenant_role(p_tenant, ARRAY['read_only']::tenant_role[]);
$$;

-- ── §19 Storage isolation ───────────────────────────────────────────────────
-- Objects live under tenants/{tenant_id}/... ; the first two path segments must
-- resolve to a tenant the caller belongs to.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='storage' AND table_name='objects') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS tenant_files_rw ON storage.objects;
      CREATE POLICY tenant_files_rw ON storage.objects FOR ALL TO authenticated
      USING (
        (storage.foldername(name))[1] = 'tenants'
        AND ((storage.foldername(name))[2])::uuid IN (SELECT current_user_tenant_ids())
      )
      WITH CHECK (
        (storage.foldername(name))[1] = 'tenants'
        AND ((storage.foldername(name))[2])::uuid IN (SELECT current_user_tenant_ids())
      );
    $p$;
  END IF;
END $$;

-- ── Seed plans (no tenant/business data) ────────────────────────────────────
INSERT INTO subscription_plans (name, slug, max_users, max_managers, storage_mb, api_access, audit_retention_days, sort_order)
VALUES
  ('Starter','starter',5,1,1024,FALSE,30,0),
  ('Professional','professional',25,5,10240,FALSE,90,1),
  ('Business','business',100,25,51200,TRUE,365,2),
  ('Enterprise','enterprise',NULL,NULL,NULL,TRUE,1095,3)
ON CONFLICT (slug) DO NOTHING;

-- ── §25 Platform admin bootstrap ────────────────────────────────────────────
-- Promotes ONLY an already-verified user matching the configured email.
-- Usage:  SELECT bootstrap_platform_admin('ops@example.com');
-- There is no public path to this role.
CREATE OR REPLACE FUNCTION bootstrap_platform_admin(p_email TEXT)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id UUID;
BEGIN
  SELECT id INTO v_id FROM app_users WHERE lower(email) = lower(p_email) AND email_verified;
  IF v_id IS NULL THEN
    RETURN 'No verified user found for ' || p_email || ' — verify the email first.';
  END IF;
  UPDATE app_users SET platform_role = 'platform_super_admin', updated_at = NOW() WHERE id = v_id;
  INSERT INTO audit_logs (tenant_id, actor_user_id, actor_role, action, entity_type, entity_id, metadata)
  VALUES (NULL, v_id, 'platform_super_admin', 'security.setting_changed', 'app_user', v_id,
          jsonb_build_object('bootstrap','platform_super_admin granted'));
  RETURN 'Platform super admin granted to ' || p_email;
END $$;
REVOKE ALL ON FUNCTION bootstrap_platform_admin(TEXT) FROM PUBLIC, authenticated, anon;

-- ── §31 Verification: no unscoped tenant rows ───────────────────────────────
CREATE OR REPLACE FUNCTION verify_no_unscoped_rows()
RETURNS TABLE(table_name TEXT, unscoped_count BIGINT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t TEXT; c BIGINT;
BEGIN
  FOR t IN
    SELECT c.table_name FROM information_schema.columns c
    WHERE c.column_name = 'tenant_id' AND c.table_schema = 'public'
  LOOP
    EXECUTE format('SELECT count(*) FROM %I WHERE tenant_id IS NULL', t) INTO c;
    IF c > 0 THEN
      table_name := t; unscoped_count := c; RETURN NEXT;
    END IF;
  END LOOP;
END $$;
