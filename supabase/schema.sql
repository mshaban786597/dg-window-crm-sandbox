-- Window CRM — Supabase PostgreSQL Schema (sandbox)
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
