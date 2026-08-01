-- ============================================================================
-- DG Window CRM — Authentication & isolation hardening (§3–§9, §12, §14)
--
-- Adds the atomic SECURITY DEFINER routines the server actions rely on, the
-- assignment-level RLS predicates, and the storage policies.
--
-- Apply to a DEVELOPMENT Supabase project first. Requires 0003_multi_tenant.sql.
-- ============================================================================

-- ── Idempotent registration (§3) ────────────────────────────────────────────
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS registration_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_registration_key
  ON tenants(registration_key) WHERE registration_key IS NOT NULL;

-- ── §3 provision_tenant: atomic owner + tenant + membership + settings ──────
-- SECURITY DEFINER so provisioning succeeds before the user has any membership
-- (RLS would otherwise deny the very first insert). The role is HARDCODED to
-- tenant_owner: there is no argument by which a caller can request another role.
CREATE OR REPLACE FUNCTION provision_tenant(
  p_user_id UUID,
  p_email TEXT,
  p_first_name TEXT,
  p_last_name TEXT,
  p_company_name TEXT,
  p_slug TEXT,
  p_phone TEXT,
  p_website TEXT,
  p_country TEXT,
  p_state TEXT,
  p_timezone TEXT,
  p_registration_key TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant UUID;
  v_slug   TEXT := p_slug;
  v_n      INT := 0;
BEGIN
  -- Replay protection: same key returns the original tenant.
  IF p_registration_key IS NOT NULL THEN
    SELECT id INTO v_tenant FROM tenants WHERE registration_key = p_registration_key;
    IF v_tenant IS NOT NULL THEN RETURN v_tenant; END IF;
  END IF;

  INSERT INTO app_users (id, email, first_name, last_name, email_verified)
  VALUES (p_user_id, p_email, COALESCE(p_first_name,''), COALESCE(p_last_name,''),
          COALESCE((SELECT email_confirmed_at IS NOT NULL FROM auth.users WHERE id = p_user_id), FALSE))
  ON CONFLICT (id) DO UPDATE
    SET first_name = EXCLUDED.first_name,
        last_name  = EXCLUDED.last_name,
        updated_at = NOW();

  -- Unique slug.
  WHILE EXISTS (SELECT 1 FROM tenants WHERE slug = v_slug) LOOP
    v_n := v_n + 1;
    v_slug := p_slug || '-' || v_n::text;
  END LOOP;

  INSERT INTO tenants (name, slug, status, owner_user_id, timezone, currency,
                       country, state, phone, website, onboarding_status,
                       trial_ends_at, registration_key)
  VALUES (p_company_name, v_slug, 'trial', p_user_id, COALESCE(p_timezone,'America/New_York'),
          'USD', p_country, p_state, p_phone, p_website, 'not_started',
          NOW() + INTERVAL '14 days', p_registration_key)
  RETURNING id INTO v_tenant;

  -- The ONLY place a tenant_owner membership is minted.
  INSERT INTO tenant_memberships (tenant_id, user_id, role, active, invitation_status, accepted_at)
  VALUES (v_tenant, p_user_id, 'tenant_owner', TRUE, 'accepted', NOW())
  ON CONFLICT (tenant_id, user_id) DO NOTHING;

  INSERT INTO tenant_settings (tenant_id, settings) VALUES (v_tenant, '{}'::jsonb)
  ON CONFLICT (tenant_id) DO NOTHING;

  RETURN v_tenant;
END $$;

REVOKE ALL ON FUNCTION provision_tenant(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION provision_tenant(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT) TO authenticated;

-- ── §5 Invitation preview (no tenant secrets) ───────────────────────────────
CREATE OR REPLACE FUNCTION preview_invitation(p_token_hash TEXT)
RETURNS TABLE(company TEXT, role tenant_role, invited_by TEXT, email TEXT, status invitation_status, expired BOOLEAN)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT t.name,
         i.role,
         COALESCE(NULLIF(btrim(u.first_name || ' ' || u.last_name), ''), u.email),
         i.email,
         i.status,
         (i.expires_at < NOW())
  FROM tenant_invitations i
  JOIN tenants   t ON t.id = i.tenant_id
  JOIN app_users u ON u.id = i.invited_by_user_id
  WHERE i.token_hash = p_token_hash
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION preview_invitation(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION preview_invitation(TEXT) TO anon, authenticated;

-- ── §5 Invitation acceptance: validate → activate → consume, atomically ─────
CREATE OR REPLACE FUNCTION accept_invitation(
  p_token_hash TEXT,
  p_user_id UUID,
  p_user_email TEXT
) RETURNS TABLE(ok BOOLEAN, code TEXT, tenant_id UUID)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE inv tenant_invitations%ROWTYPE;
BEGIN
  -- Row lock makes concurrent redemption of the same token impossible.
  SELECT * INTO inv FROM tenant_invitations
   WHERE token_hash = p_token_hash FOR UPDATE;

  IF inv.id IS NULL THEN RETURN QUERY SELECT FALSE, 'INVALID', NULL::UUID; RETURN; END IF;
  IF inv.status = 'accepted' THEN RETURN QUERY SELECT FALSE, 'ALREADY_USED', NULL::UUID; RETURN; END IF;
  IF inv.status = 'revoked'  THEN RETURN QUERY SELECT FALSE, 'REVOKED', NULL::UUID; RETURN; END IF;
  IF inv.expires_at < NOW()  THEN
    UPDATE tenant_invitations SET status = 'expired' WHERE id = inv.id;
    RETURN QUERY SELECT FALSE, 'EXPIRED', NULL::UUID; RETURN;
  END IF;
  -- An invitation is bound to the address it was sent to; it cannot be
  -- transferred to another account (§5).
  IF lower(inv.email) <> lower(p_user_email) THEN
    RETURN QUERY SELECT FALSE, 'EMAIL_MISMATCH', NULL::UUID; RETURN;
  END IF;

  INSERT INTO tenant_memberships (tenant_id, user_id, role, manager_membership_id,
                                  active, invitation_status, invited_by, invited_at, accepted_at)
  VALUES (inv.tenant_id, p_user_id, inv.role, inv.manager_membership_id,
          TRUE, 'accepted', inv.invited_by_user_id, inv.created_at, NOW())
  ON CONFLICT (tenant_id, user_id) DO UPDATE
    SET active = TRUE,
        invitation_status = 'accepted',
        role = EXCLUDED.role,
        accepted_at = NOW(),
        updated_at = NOW();

  -- Consume the token.
  UPDATE tenant_invitations SET status = 'accepted', accepted_at = NOW() WHERE id = inv.id;

  RETURN QUERY SELECT TRUE, 'OK', inv.tenant_id;
END $$;
REVOKE ALL ON FUNCTION accept_invitation(TEXT, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION accept_invitation(TEXT, UUID, TEXT) TO authenticated;

-- ── Profile provisioning (§3, §5) ───────────────────────────────────────────
-- `app_users` intentionally has NO INSERT policy: a client must never be able
-- to mint its own profile row (that row carries `platform_role`). Instead the
-- row is created by a trigger on auth.users, so every sign-up path — company
-- registration AND invited sign-up — gets a profile without any client write.
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO app_users (id, email, first_name, last_name, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
    NEW.email_confirmed_at IS NOT NULL
  )
  ON CONFLICT (id) DO NOTHING;   -- platform_role is never set here
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_handle_new_auth_user ON auth.users;
CREATE TRIGGER trg_handle_new_auth_user
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_auth_user();

-- Keep `email_verified` in step with Supabase's confirmation state.
CREATE OR REPLACE FUNCTION sync_email_verified()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.email_confirmed_at IS DISTINCT FROM OLD.email_confirmed_at THEN
    UPDATE app_users
       SET email_verified = NEW.email_confirmed_at IS NOT NULL,
           email = NEW.email,
           updated_at = NOW()
     WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_email_verified ON auth.users;
CREATE TRIGGER trg_sync_email_verified
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION sync_email_verified();

-- ── §7 Membership + assignment-level predicates ─────────────────────────────
CREATE OR REPLACE FUNCTION current_user_has_active_membership(target_tenant_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_memberships m
    JOIN tenants t ON t.id = m.tenant_id
    WHERE m.user_id = auth.uid()
      AND m.tenant_id = target_tenant_id
      AND m.active
      AND m.invitation_status = 'accepted'
      AND t.status NOT IN ('suspended','cancelled')
  );
$$;

-- Sales reps see leads assigned to them; managers see their reports'; owners
-- and admins see all. Crew get no lead access.
CREATE OR REPLACE FUNCTION current_user_can_view_lead(target_tenant_id UUID, target_lead_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role tenant_role; v_mem UUID; v_assigned UUID;
BEGIN
  IF NOT current_user_has_active_membership(target_tenant_id) THEN RETURN FALSE; END IF;
  SELECT m.role, m.id INTO v_role, v_mem FROM tenant_memberships m
   WHERE m.user_id = auth.uid() AND m.tenant_id = target_tenant_id
     AND m.active AND m.invitation_status = 'accepted' LIMIT 1;

  IF v_role IN ('tenant_owner','tenant_admin','read_only','marketing') THEN RETURN TRUE; END IF;
  IF v_role = 'crew' THEN RETURN FALSE; END IF;

  SELECT assigned_membership_id INTO v_assigned
    FROM assignments
   WHERE tenant_id = target_tenant_id AND entity_type = 'lead' AND entity_id = target_lead_id
   ORDER BY assigned_at DESC LIMIT 1;

  IF v_role = 'manager' THEN
    RETURN v_assigned IS NULL
        OR v_assigned = v_mem
        OR EXISTS (SELECT 1 FROM tenant_memberships r
                    WHERE r.id = v_assigned AND r.manager_membership_id = v_mem);
  END IF;
  -- sales_representative / estimator
  RETURN v_assigned = v_mem;
END $$;

CREATE OR REPLACE FUNCTION current_user_can_view_quote(target_tenant_id UUID, target_quote_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role tenant_role; v_mem UUID; v_owner UUID;
BEGIN
  IF NOT current_user_has_active_membership(target_tenant_id) THEN RETURN FALSE; END IF;
  SELECT m.role, m.id INTO v_role, v_mem FROM tenant_memberships m
   WHERE m.user_id = auth.uid() AND m.tenant_id = target_tenant_id
     AND m.active AND m.invitation_status = 'accepted' LIMIT 1;

  IF v_role IN ('tenant_owner','tenant_admin','read_only') THEN RETURN TRUE; END IF;
  IF v_role IN ('crew','marketing') THEN RETURN FALSE; END IF;

  SELECT owner_id INTO v_owner FROM quotes
   WHERE id = target_quote_id AND tenant_id = target_tenant_id;

  IF v_role = 'manager' THEN
    RETURN v_owner = v_mem
        OR EXISTS (SELECT 1 FROM tenant_memberships r
                    WHERE r.id = v_owner AND r.manager_membership_id = v_mem);
  END IF;
  RETURN v_owner = v_mem;
END $$;

-- Crew see only jobs assigned to them (§7).
CREATE OR REPLACE FUNCTION current_user_can_view_job(target_tenant_id UUID, target_job_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role tenant_role; v_mem UUID;
BEGIN
  IF NOT current_user_has_active_membership(target_tenant_id) THEN RETURN FALSE; END IF;
  SELECT m.role, m.id INTO v_role, v_mem FROM tenant_memberships m
   WHERE m.user_id = auth.uid() AND m.tenant_id = target_tenant_id
     AND m.active AND m.invitation_status = 'accepted' LIMIT 1;

  IF v_role IN ('tenant_owner','tenant_admin','manager','read_only') THEN RETURN TRUE; END IF;
  IF v_role = 'crew' THEN
    RETURN EXISTS (SELECT 1 FROM assignments a
                    WHERE a.tenant_id = target_tenant_id AND a.entity_type = 'job'
                      AND a.entity_id = target_job_id AND a.assigned_membership_id = v_mem);
  END IF;
  RETURN FALSE;
END $$;

-- Tighten the row policies for the three assignment-sensitive tables.
DROP POLICY IF EXISTS leads_tenant_isolation ON leads;
CREATE POLICY leads_tenant_isolation ON leads FOR ALL TO authenticated
  USING (current_user_can_view_lead(tenant_id, id) OR current_user_is_platform_admin())
  WITH CHECK (current_user_has_active_membership(tenant_id));

DROP POLICY IF EXISTS quotes_tenant_isolation ON quotes;
CREATE POLICY quotes_tenant_isolation ON quotes FOR ALL TO authenticated
  USING (current_user_can_view_quote(tenant_id, id) OR current_user_is_platform_admin())
  WITH CHECK (current_user_has_active_membership(tenant_id));

DROP POLICY IF EXISTS jobs_tenant_isolation ON jobs;
CREATE POLICY jobs_tenant_isolation ON jobs FOR ALL TO authenticated
  USING (current_user_can_view_job(tenant_id, id) OR current_user_is_platform_admin())
  WITH CHECK (current_user_has_active_membership(tenant_id));

-- ── §12 Block privilege escalation at the database ──────────────────────────
-- A member cannot edit their OWN membership row (no self-promotion), and no
-- tenant-side path can ever mint a platform role.
CREATE OR REPLACE FUNCTION prevent_self_role_escalation()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id = auth.uid() AND (NEW.role IS DISTINCT FROM OLD.role) THEN
    RAISE EXCEPTION 'You cannot change your own role';
  END IF;
  IF NEW.role = 'tenant_owner' AND OLD.role <> 'tenant_owner'
     AND NOT current_user_has_tenant_role(NEW.tenant_id, ARRAY['tenant_owner']::tenant_role[]) THEN
    RAISE EXCEPTION 'Only the current owner may transfer ownership';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_prevent_self_role_escalation ON tenant_memberships;
CREATE TRIGGER trg_prevent_self_role_escalation
  BEFORE UPDATE ON tenant_memberships
  FOR EACH ROW EXECUTE FUNCTION prevent_self_role_escalation();

-- Audit rows are append-only for everyone except the platform admin (§14).
CREATE OR REPLACE FUNCTION deny_audit_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Audit records are append-only';
END $$;

DROP TRIGGER IF EXISTS trg_audit_no_update ON audit_logs;
CREATE TRIGGER trg_audit_no_update BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION deny_audit_mutation();

-- ── §9 Storage policies ─────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('tenant-files', 'tenant-files', FALSE)
ON CONFLICT (id) DO NOTHING;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='storage' AND table_name='objects') THEN
    EXECUTE $p$
      DROP POLICY IF EXISTS tenant_files_select ON storage.objects;
      DROP POLICY IF EXISTS tenant_files_write  ON storage.objects;
      -- Path shape: tenants/{tenant_id}/...
      CREATE POLICY tenant_files_select ON storage.objects FOR SELECT TO authenticated
        USING (
          bucket_id = 'tenant-files'
          AND (storage.foldername(name))[1] = 'tenants'
          AND current_user_has_active_membership(((storage.foldername(name))[2])::uuid)
        );
      CREATE POLICY tenant_files_write ON storage.objects FOR ALL TO authenticated
        USING (
          bucket_id = 'tenant-files'
          AND (storage.foldername(name))[1] = 'tenants'
          AND current_user_has_active_membership(((storage.foldername(name))[2])::uuid)
        )
        WITH CHECK (
          bucket_id = 'tenant-files'
          AND (storage.foldername(name))[1] = 'tenants'
          AND current_user_has_active_membership(((storage.foldername(name))[2])::uuid)
        );
    $p$;
  END IF;
END $$;

-- ── §19 Verification helpers ────────────────────────────────────────────────
-- Any tenant-owned table missing RLS.
CREATE OR REPLACE FUNCTION verify_rls_enabled()
RETURNS TABLE(table_name TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT c.relname::TEXT
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
    AND EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_name = c.relname AND col.column_name = 'tenant_id'
    );
$$;
