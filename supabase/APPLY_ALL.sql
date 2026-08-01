-- ============================================================================
-- DG Window CRM - full database setup (apply ONCE, in this exact order)
--
-- HOW TO RUN
--   Supabase Dashboard -> SQL Editor -> New query -> paste this whole file -> Run.
--
-- WHY ONE FILE
--   The four source files must run in dependency order: 0002 references
--   `leads`/`quotes` from the base schema, 0003 adds tenant_id to whatever
--   tables already exist, and 0004 attaches triggers to tables 0003 created.
--   Running them out of order, or stopping midway, leaves a half-built
--   database. The BEGIN/COMMIT below makes the whole thing atomic: any error
--   rolls the entire setup back and your project is untouched.
--
--   Every statement was checked to be transaction-safe (no CONCURRENTLY,
--   VACUUM, or ALTER SYSTEM), so the wrapper is sound.
--
-- SAFETY
--   Run this against a DEDICATED, EMPTY Supabase project only. It is not
--   written to merge into an existing database, and it must never touch the
--   original New Vision Gutters project.
--
-- NO BUSINESS DATA IS SEEDED. Tables are created empty.
-- ============================================================================

BEGIN;


-- ==========================================================================
-- SECTION: BASE SCHEMA - core CRM tables (leads, quotes, jobs, customers, ...)
-- source: supabase/schema.sql
-- ==========================================================================

-- DG Window CRM — Supabase PostgreSQL Schema (sandbox)
-- Run this in a DEDICATED, ISOLATED Supabase project's SQL Editor.
-- Do NOT run against any existing production database.
-- The application also runs fully in local empty-state mode with NO Supabase
-- connection; this schema is optional and ships with no seeded business data.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Enums ────────────────────────────────────────────────────────
CREATE TYPE user_role AS ENUM (
  'owner', 'sales_manager', 'estimator', 'crew_manager', 'field_crew', 'office_staff'
);
CREATE TYPE lead_stage AS ENUM (
  'new_lead', 'contact_attempted', 'contacted', 'qualified',
  'measurement_scheduled', 'measurement_completed', 'proposal_sent',
  'follow_up_needed', 'won', 'lost', 'archived'
);
CREATE TYPE lead_source AS ENUM (
  'website_form', 'google_business', 'organic_search', 'google_ads',
  'local_services_ads', 'meta_ads', 'phone_call', 'referral', 'home_show',
  'door_to_door', 'builder_contractor', 'returning_customer', 'other'
);
CREATE TYPE service_type AS ENUM (
  'window_replacement', 'window_installation', 'new_construction_windows',
  'window_repair', 'glass_replacement', 'impact_windows',
  'energy_efficient_windows', 'custom_windows', 'commercial_windows',
  'sliding_glass_doors'
);
CREATE TYPE measurement_status AS ENUM (
  'scheduled', 'in_progress', 'completed', 'quoted', 'no_show',
  'rescheduled', 'cancelled', 'converted_to_quote'
);
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'viewed', 'accepted', 'declined', 'expired');
CREATE TYPE purchase_order_status AS ENUM (
  'draft', 'submitted', 'confirmed', 'in_production', 'shipped',
  'partially_received', 'received', 'damaged_short', 'ready_for_installation', 'cancelled'
);
CREATE TYPE job_stage AS ENUM (
  'not_scheduled', 'deposit_pending', 'measurement_verified', 'order_pending',
  'ordered', 'in_production', 'materials_received', 'installation_scheduled',
  'crew_assigned', 'in_progress', 'quality_check', 'punch_list', 'completed',
  'invoice_sent', 'paid', 'review_requested', 'closed'
);
CREATE TYPE property_type AS ENUM ('residential', 'commercial', 'multifamily', 'new_construction');
CREATE TYPE urgency_level AS ENUM ('low', 'medium', 'high', 'urgent');

-- ── Profiles (extends auth.users) ────────────────────────────────
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role user_role NOT NULL DEFAULT 'office_staff',
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Company settings (single row) ────────────────────────────────
CREATE TABLE company_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  website TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  service_area TEXT DEFAULT '',
  review_link TEXT DEFAULT '',
  review_message_template TEXT DEFAULT '',
  tax_rate DECIMAL(6,3) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  timezone TEXT DEFAULT 'America/New_York',
  proposal_validity_days INTEGER DEFAULT 30,
  default_deposit_percent DECIMAL(6,3) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Reference / config tables ────────────────────────────────────
CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN DEFAULT TRUE
);

CREATE TABLE service_areas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  region TEXT,
  city TEXT,
  zip_codes TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE lead_sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE
);

CREATE TABLE window_manufacturers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE product_lines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  manufacturer_id UUID REFERENCES window_manufacturers(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Customers & leads ────────────────────────────────────────────
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  city TEXT,
  county TEXT,
  zip_code TEXT,
  property_type property_type DEFAULT 'residential',
  customer_type TEXT,
  notes TEXT,
  review_status TEXT DEFAULT 'none',
  happy_customer BOOLEAN DEFAULT FALSE,
  total_revenue DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  address TEXT,
  city TEXT,
  county TEXT,
  zip_code TEXT,
  service_requested service_type,
  lead_source lead_source,
  urgency urgency_level DEFAULT 'medium',
  property_type property_type DEFAULT 'residential',
  notes TEXT,
  photos TEXT[],
  preferred_appointment_date TIMESTAMPTZ,
  assigned_estimator_id UUID REFERENCES profiles(id),
  status lead_stage DEFAULT 'new_lead',
  estimated_project_value DECIMAL(12,2),
  -- Window qualification
  window_opening_count INTEGER,
  preferred_window_style TEXT,
  preferred_frame_material TEXT,
  impact_interest BOOLEAN,
  energy_efficiency_interest BOOLEAN,
  financing_interest BOOLEAN,
  project_timeframe TEXT,
  occupancy TEXT,
  decision_maker BOOLEAN,
  preferred_contact_method TEXT,
  campaign_name TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  referral_partner TEXT,
  lead_quality TEXT,
  next_follow_up_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE properties (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  city TEXT,
  county TEXT,
  zip_code TEXT,
  property_type property_type,
  year_built INTEGER,
  stories INTEGER,
  exterior_type TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Measurements & window openings ───────────────────────────────
CREATE TABLE measurements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id UUID REFERENCES leads(id),
  customer_id UUID REFERENCES customers(id),
  property_id UUID REFERENCES properties(id),
  property_address TEXT,
  service_type service_type,
  status measurement_status DEFAULT 'scheduled',
  scheduled_date TIMESTAMPTZ,
  scheduled_time TEXT,
  estimator_id UUID REFERENCES profiles(id),
  project_type property_type,
  year_built INTEGER,
  stories INTEGER,
  exterior_type TEXT,
  access_difficulty TEXT,
  lead_safe_pre1978 BOOLEAN,
  permit_required BOOLEAN,
  hoa_approval_required BOOLEAN,
  installation_method TEXT,
  preferred_manufacturer TEXT,
  preferred_product_line TEXT,
  interior_trim_work BOOLEAN,
  exterior_trim_capping BOOLEAN,
  visible_damage BOOLEAN,
  disposal_required BOOLEAN,
  estimator_notes TEXT,
  subtotal DECIMAL(12,2),
  discount DECIMAL(12,2) DEFAULT 0,
  tax DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE window_openings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  measurement_id UUID REFERENCES measurements(id) ON DELETE CASCADE,
  room_location TEXT,
  opening_number TEXT,
  quantity INTEGER DEFAULT 1,
  width DECIMAL(8,2),
  height DECIMAL(8,2),
  unit TEXT DEFAULT 'in',
  window_style TEXT,
  operation_type TEXT,
  frame_material TEXT,
  interior_color TEXT,
  exterior_color TEXT,
  glass_package TEXT,
  grid_pattern TEXT,
  screen_option TEXT,
  tempered BOOLEAN DEFAULT FALSE,
  egress_required BOOLEAN DEFAULT FALSE,
  impact_required BOOLEAN DEFAULT FALSE,
  obscured_glass BOOLEAN DEFAULT FALSE,
  installation_method TEXT,
  trim_capping TEXT,
  existing_condition TEXT,
  photo_urls TEXT[],
  notes TEXT,
  sort_order INTEGER DEFAULT 0
);

-- ── Quotes ───────────────────────────────────────────────────────
CREATE TABLE quotes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  measurement_id UUID REFERENCES measurements(id),
  lead_id UUID REFERENCES leads(id),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  service_type service_type,
  status quote_status DEFAULT 'draft',
  scope_of_work TEXT,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  tax DECIMAL(12,2) DEFAULT 0,
  deposit_amount DECIMAL(12,2),
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  optional_upgrades TEXT[],
  financing_option TEXT,
  production_lead_time TEXT,
  installation_duration TEXT,
  warranty_notes TEXT,
  customer_notes TEXT,
  internal_notes TEXT,
  sent_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id) ON DELETE CASCADE,
  opening_id UUID REFERENCES window_openings(id),
  category TEXT,
  description TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0
);

-- ── Purchase orders (Window Orders) ──────────────────────────────
CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id),
  customer_id UUID REFERENCES customers(id),
  job_id UUID,
  manufacturer TEXT,
  product_line TEXT,
  supplier TEXT,
  po_number TEXT,
  order_date TIMESTAMPTZ,
  confirmed_date TIMESTAMPTZ,
  estimated_ship_date TIMESTAMPTZ,
  estimated_arrival_date TIMESTAMPTZ,
  actual_arrival_date TIMESTAMPTZ,
  status purchase_order_status DEFAULT 'draft',
  supplier_contact TEXT,
  freight_cost DECIMAL(12,2),
  storage_location TEXT,
  tracking_info TEXT,
  internal_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  purchase_order_id UUID REFERENCES purchase_orders(id) ON DELETE CASCADE,
  opening_id UUID REFERENCES window_openings(id),
  opening_ref TEXT,
  quantity INTEGER DEFAULT 1,
  width DECIMAL(8,2),
  height DECIMAL(8,2),
  model_sku TEXT,
  style TEXT,
  frame TEXT,
  color TEXT,
  glass_package TEXT,
  grids TEXT,
  screens TEXT,
  unit_cost DECIMAL(10,2),
  received_quantity INTEGER DEFAULT 0,
  damaged BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- ── Crews ────────────────────────────────────────────────────────
CREATE TABLE crews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  lead_name TEXT,
  phone TEXT,
  email TEXT,
  skills TEXT[],
  availability TEXT,
  status TEXT DEFAULT 'available',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE crew_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  crew_id UUID REFERENCES crews(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id),
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT,
  skills TEXT[],
  availability TEXT DEFAULT 'available'
);

-- ── Jobs ─────────────────────────────────────────────────────────
CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quote_id UUID REFERENCES quotes(id),
  measurement_id UUID REFERENCES measurements(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  crew_id UUID REFERENCES crews(id),
  service_type service_type,
  stage job_stage DEFAULT 'not_scheduled',
  address TEXT,
  city TEXT,
  county TEXT,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  estimated_install_days INTEGER,
  priority TEXT DEFAULT 'medium',
  units_count INTEGER,
  permit_status TEXT,
  inspection_status TEXT,
  material_delivery_status TEXT,
  deposit_status TEXT,
  reorder_status TEXT,
  final_walkthrough_status TEXT,
  pre_install_checklist TEXT[],
  installation_checklist TEXT[],
  quality_control_checklist TEXT[],
  punch_list TEXT[],
  materials TEXT[],
  completion_notes TEXT,
  internal_notes TEXT,
  customer_notes TEXT,
  invoice_status TEXT DEFAULT 'none',
  payment_status TEXT DEFAULT 'none',
  review_request_status TEXT DEFAULT 'not_requested',
  job_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE purchase_orders
  ADD CONSTRAINT fk_po_job FOREIGN KEY (job_id) REFERENCES jobs(id);

-- ── Schedules ────────────────────────────────────────────────────
CREATE TABLE schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  event_type TEXT NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  customer_id UUID REFERENCES customers(id),
  lead_id UUID REFERENCES leads(id),
  measurement_id UUID REFERENCES measurements(id),
  job_id UUID REFERENCES jobs(id),
  purchase_order_id UUID REFERENCES purchase_orders(id),
  crew_id UUID REFERENCES crews(id),
  assigned_to UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Materials / inventory ────────────────────────────────────────
CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit TEXT NOT NULL DEFAULT 'ea',
  reorder_level DECIMAL(10,2) NOT NULL DEFAULT 0,
  supplier TEXT,
  cost DECIMAL(10,2),
  color_options TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE inventory_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  material_id UUID REFERENCES materials(id) ON DELETE CASCADE,
  action TEXT,
  quantity_changed DECIMAL(10,2) NOT NULL,
  job_id UUID REFERENCES jobs(id),
  logged_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Communications & tasks ───────────────────────────────────────
CREATE TABLE communications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  comm_type TEXT NOT NULL,
  subject TEXT,
  body TEXT,
  created_by UUID REFERENCES profiles(id),
  external_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  description TEXT,
  due_date TIMESTAMPTZ,
  assigned_to UUID REFERENCES profiles(id),
  entity_type TEXT,
  entity_id UUID,
  completed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Invoices & payments ──────────────────────────────────────────
CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID REFERENCES jobs(id),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status TEXT DEFAULT 'draft',
  due_date DATE,
  sent_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
  amount DECIMAL(12,2) NOT NULL,
  method TEXT,
  paid_at TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT
);

-- ── Reviews ──────────────────────────────────────────────────────
CREATE TABLE reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) NOT NULL,
  job_id UUID REFERENCES jobs(id),
  status TEXT DEFAULT 'not_requested',
  rating INTEGER,
  platform TEXT DEFAULT 'google',
  request_method TEXT,
  review_link TEXT,
  service_type service_type,
  message TEXT,
  requested_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  happy_customer BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Marketing campaigns ──────────────────────────────────────────
CREATE TABLE marketing_campaigns (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  source TEXT,
  city TEXT,
  county TEXT,
  service_type service_type,
  spend DECIMAL(12,2) DEFAULT 0,
  leads_generated INTEGER DEFAULT 0,
  qualified_leads INTEGER DEFAULT 0,
  measurements_booked INTEGER DEFAULT 0,
  proposals_issued INTEGER DEFAULT 0,
  jobs_won INTEGER DEFAULT 0,
  estimated_revenue DECIMAL(12,2) DEFAULT 0,
  sold_revenue DECIMAL(12,2) DEFAULT 0,
  collected_revenue DECIMAL(12,2) DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Automations ──────────────────────────────────────────────────
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  trigger_event TEXT NOT NULL,
  delay_interval TEXT,
  action_type TEXT NOT NULL,
  action_config JSONB,
  enabled BOOLEAN DEFAULT FALSE, -- disabled by default
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Indexes ──────────────────────────────────────────────────────
CREATE INDEX idx_leads_status ON leads(status);
CREATE INDEX idx_leads_source ON leads(lead_source);
CREATE INDEX idx_leads_customer ON leads(customer_id);
CREATE INDEX idx_measurements_lead ON measurements(lead_id);
CREATE INDEX idx_window_openings_measurement ON window_openings(measurement_id);
CREATE INDEX idx_quotes_customer ON quotes(customer_id);
CREATE INDEX idx_quote_items_quote ON quote_items(quote_id);
CREATE INDEX idx_po_quote ON purchase_orders(quote_id);
CREATE INDEX idx_po_items_po ON purchase_order_items(purchase_order_id);
CREATE INDEX idx_jobs_stage ON jobs(stage);
CREATE INDEX idx_jobs_crew ON jobs(crew_id);
CREATE INDEX idx_jobs_customer ON jobs(customer_id);
CREATE INDEX idx_communications_entity ON communications(entity_type, entity_id);
CREATE INDEX idx_reviews_customer ON reviews(customer_id);

-- ── Row Level Security ───────────────────────────────────────────
-- Enable RLS and allow authenticated users full access. Tighten per-role
-- as needed for a real deployment.
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'company_settings','services','service_areas','lead_sources',
    'window_manufacturers','product_lines','customers','leads','properties',
    'measurements','window_openings','quotes','quote_items','purchase_orders',
    'purchase_order_items','crews','crew_members','jobs','schedules','materials',
    'inventory_logs','communications','tasks','invoices','payments','reviews',
    'marketing_campaigns','automations'
  ]
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format($p$CREATE POLICY "authenticated_all_%1$s" ON %1$I FOR ALL TO authenticated USING (true) WITH CHECK (true);$p$, t);
  END LOOP;
END $$;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- No business data is seeded. Configure company_settings, services, and
-- service_areas from the application Settings screen.


-- ==========================================================================
-- SECTION: FEATURE BUILD - team, lead contacts, catalog, notifications
-- source: supabase/migrations/0002_feature_build.sql
-- ==========================================================================

-- DG Window CRM — feature-build migration (§27).
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


-- ==========================================================================
-- SECTION: MULTI-TENANCY - tenants, memberships, tenant_id backfill, RLS policies
-- source: supabase/migrations/0003_multi_tenant.sql
-- ==========================================================================

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


-- ==========================================================================
-- SECTION: AUTH HARDENING - auth.users triggers, platform-admin guards
-- source: supabase/migrations/0004_auth_hardening.sql
-- ==========================================================================

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


COMMIT;

-- ============================================================================
-- Verify (run separately, AFTER the COMMIT above succeeds):
--
--   select count(*) as tables from information_schema.tables
--    where table_schema = 'public';
--
--   select count(*) as rls_policies from pg_policies
--    where schemaname = 'public';
--
--   select count(*) as tenants from tenants;   -- expect 0 or 1
-- ============================================================================
