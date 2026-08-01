-- Window CRM — feature-build migration (§27).
-- NOTE: the running sandbox app persists via Zustand/localStorage (storage key
-- dg-window-crm-sandbox-v1) with a versioned v3 migration; this SQL is the
-- Supabase-ready equivalent for the NEW entities. Run only against a dedicated,
-- isolated Supabase project — never the original gutter database. No business
-- data is seeded.

CREATE TYPE team_role AS ENUM ('administrator', 'manager', 'sales_representative', 'marketing');

-- ── §7 Team members (user profiles) ──────────────────────────────
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  role team_role NOT NULL DEFAULT 'sales_representative',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  manager_id UUID REFERENCES team_members(id),
  notification_preferences JSONB NOT NULL DEFAULT '{"email_assignment":true,"email_confirmation":true}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT team_member_not_self_manager CHECK (manager_id IS NULL OR manager_id <> id)
);
CREATE INDEX idx_team_members_manager ON team_members(manager_id);
CREATE INDEX idx_team_members_role ON team_members(role) WHERE active;

-- ── §3 Repeatable lead contacts ──────────────────────────────────
CREATE TABLE lead_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lead_contacts_lead ON lead_contacts(lead_id);
CREATE UNIQUE INDEX idx_lead_one_primary ON lead_contacts(lead_id) WHERE is_primary;

-- New lead columns (§5): state, PA verified, cents values, appointment, custom svc.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS custom_service_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS property_value_cents BIGINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS building_value_cents BIGINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS estimated_value_cents BIGINT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS pa_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appointment_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS primary_contact_id UUID REFERENCES lead_contacts(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS needs_assignment BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS formatted_address TEXT;

-- ── §8/§28 Notifications + §10 confirmations + §28 activity ───────
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind TEXT NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES team_members(id),
  recipient_role TEXT,
  to_email TEXT,
  subject TEXT,
  body_html TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  dedupe_key TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

CREATE TABLE appointment_confirmations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  notification_id UUID REFERENCES notifications(id) ON DELETE CASCADE,
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  recipient_user_id UUID REFERENCES team_members(id),
  recipient_role TEXT,
  token_hash TEXT NOT NULL, -- only the hash is stored (§10)
  status TEXT NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX idx_confirmation_token ON appointment_confirmations(token_hash);

CREATE TABLE lead_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor TEXT,
  description TEXT,
  related_id UUID,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_lead_activities_lead ON lead_activities(lead_id);

-- ── §18–§22 Inventory catalog hierarchy ──────────────────────────
CREATE TABLE catalog_series (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE catalog_window_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  series_id UUID NOT NULL REFERENCES catalog_series(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE catalog_universal_ranges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  window_type_id UUID NOT NULL REFERENCES catalog_window_types(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  min_in NUMERIC(8,2) NOT NULL,
  max_in NUMERIC(8,2) NOT NULL,
  base_cost_cents BIGINT,
  base_price_cents BIGINT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT range_min_le_max CHECK (min_in <= max_in)
);

CREATE TABLE catalog_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  series_id UUID REFERENCES catalog_series(id),
  window_type_id UUID REFERENCES catalog_window_types(id),
  universal_range_id UUID REFERENCES catalog_universal_ranges(id),
  base_cost_cents BIGINT NOT NULL DEFAULT 0,
  base_price_cents BIGINT NOT NULL DEFAULT 0,
  supplier TEXT,
  sku TEXT,
  inventory_mode TEXT NOT NULL DEFAULT 'unlimited', -- 'tracked' | 'unlimited'
  quantity NUMERIC(12,2),
  reorder_level NUMERIC(12,2),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE catalog_attributes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  item_id UUID NOT NULL REFERENCES catalog_items(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'select' | 'number'
  required BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0,
  unit_label TEXT,
  cost_per_unit_cents BIGINT,
  charge_per_unit_cents BIGINT,
  min NUMERIC(12,2),
  max NUMERIC(12,2),
  step NUMERIC(12,2),
  default_value NUMERIC(12,2)
);

CREATE TABLE catalog_attribute_options (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  attribute_id UUID NOT NULL REFERENCES catalog_attributes(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  cost_adj_cents BIGINT DEFAULT 0,
  upcharge_cents BIGINT DEFAULT 0,
  is_default BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  sort_order INTEGER DEFAULT 0
);

-- ── §25 Quote item snapshots ─────────────────────────────────────
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES team_members(id);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS subtotal_cents BIGINT DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS total_cents BIGINT DEFAULT 0;

CREATE TABLE quote_item_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  catalog_item_id UUID,          -- reference only; snapshots below are authoritative
  series_snapshot TEXT,
  window_type_snapshot TEXT,
  universal_range_snapshot TEXT,
  item_name_snapshot TEXT,
  base_price_cents_snapshot BIGINT NOT NULL,
  base_cost_cents_snapshot BIGINT NOT NULL,
  selections JSONB NOT NULL DEFAULT '[]',
  configured_unit_price_cents BIGINT NOT NULL,
  configured_unit_cost_cents BIGINT NOT NULL,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  line_total_cents BIGINT NOT NULL,
  line_cost_cents BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_quote_item_snapshots_quote ON quote_item_snapshots(quote_id);
CREATE INDEX idx_quotes_owner ON quotes(owner_id);
CREATE INDEX idx_quotes_lead ON quotes(lead_id);

-- ── Row-level security (§27) ─────────────────────────────────────
-- Authenticated access; tighten per-role at deploy time. Quote visibility
-- (§14) should be enforced with a policy joining team_members(manager_id) or
-- a secure server route — mirror getVisibleQuoteOwnerIds().
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'team_members','lead_contacts','notifications','appointment_confirmations',
    'lead_activities','catalog_series','catalog_window_types','catalog_universal_ranges',
    'catalog_items','catalog_attributes','catalog_attribute_options','quote_item_snapshots'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY "authenticated_all_%1$s" ON %1$I FOR ALL TO authenticated USING (true) WITH CHECK (true);$p$, t);
  END LOOP;
END $$;
