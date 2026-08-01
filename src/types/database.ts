/**
 * Domain entity types for Window CRM.
 *
 * Union types (stages, statuses, taxonomies) are owned by `@/lib/domain`
 * and re-exported here so the rest of the app can keep importing them from
 * `@/types/database`.
 */
export type {
  UserRole,
  LeadStage,
  LeadSource,
  ServiceType,
  JobStage,
  MeasurementStatus,
  ReviewRequestStatus,
  CrewStatus,
  QuoteStatus,
  PropertyType,
  UrgencyLevel,
  PurchaseOrderStatus,
  CalendarEventType,
  WindowStyle,
  FrameMaterial,
  LeadQuality,
} from "@/lib/domain";

import type {
  UserRole,
  LeadStage,
  LeadSource,
  ServiceType,
  JobStage,
  MeasurementStatus,
  ReviewRequestStatus,
  CrewStatus,
  QuoteStatus,
  PropertyType,
  UrgencyLevel,
  PurchaseOrderStatus,
  CalendarEventType,
  LeadQuality,
} from "@/lib/domain";

// Legacy alias — the measurement record kept the `EstimateStatus` name in
// a few call sites. Point it at the measurement status union.
export type EstimateStatus = MeasurementStatus;

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Lead {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  // Legacy single-contact fields — retained for back-compat/display. The
  // authoritative contact data now lives in `contacts` (§3). On migration the
  // old full_name/phone/email become the primary LeadContact.
  full_name: string;
  phone: string;
  email?: string;

  // Repeatable contacts (§3). At least one; exactly one is primary.
  contacts: LeadContact[];
  primary_contact_id?: string;

  address: string;
  city: string;
  county: string; // legacy; superseded by `state`
  state?: string; // §5 — renamed from County / Region
  zip_code: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  formatted_address?: string;

  service_requested: ServiceType; // one of LEAD_SERVICE_OPTIONS
  custom_service_name?: string; // §6 — set when service_requested === "custom"
  lead_source: LeadSource;
  urgency: UrgencyLevel;
  property_type: PropertyType;
  notes?: string;
  photos?: string[];

  // Currency-safe values stored as integer cents (§5).
  property_value_cents?: number;
  building_value_cents?: number;
  estimated_value_cents?: number;
  pa_verified?: boolean; // §5 — Public Adjuster / property-appraiser verified

  // Appointment date & time — full ISO timestamp (§5, renamed field).
  appointment_at?: string;
  preferred_appointment_date?: string; // legacy alias

  created_at: string;
  updated_at?: string;
  assigned_estimator_id?: string; // assigned sales representative (team member id)
  assigned_estimator_name?: string;
  needs_assignment?: boolean; // §12 — flagged when website lead has no manager
  status: LeadStage;
  estimated_project_value?: number; // legacy dollar value; prefer estimated_value_cents
  customer_id?: string;

  // Window project qualification (all optional — keep first entry fast)
  project_type?: PropertyType;
  window_opening_count?: number;
  preferred_window_style?: string;
  preferred_frame_material?: string;
  impact_interest?: boolean;
  energy_efficiency_interest?: boolean;
  financing_interest?: boolean;
  project_timeframe?: string;
  occupancy?: string; // occupied | vacant
  decision_maker?: boolean; // homeowner / decision-maker
  preferred_contact_method?: string;
  campaign_name?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referral_partner?: string;
  lead_quality?: LeadQuality;
  next_follow_up_date?: string;
}

export interface Customer {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  full_name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  county: string;
  zip_code: string;
  property_type: PropertyType;
  customer_type?: string;
  lead_id?: string;
  notes?: string;
  review_status: "none" | "requested" | "received" | "pending";
  happy_customer: boolean;
  created_at: string;
  updated_at?: string;
  total_revenue?: number;
}

/**
 * A single window opening measured at a property. Child of a Measurement.
 */
export interface WindowOpening {
  id: string;
  room_location: string;
  opening_number: string;
  quantity: number;
  width?: number;
  height?: number;
  unit: string; // in | cm
  window_style?: string;
  operation_type?: string;
  frame_material?: string;
  interior_color?: string;
  exterior_color?: string;
  glass_package?: string;
  grid_pattern?: string;
  screen_option?: string;
  tempered: boolean;
  egress_required: boolean;
  impact_required: boolean;
  obscured_glass: boolean;
  installation_method?: string;
  trim_capping?: string;
  existing_condition?: string;
  photo_urls?: string[];
  notes?: string;
}

/**
 * Project-level measurement record (route stays /estimates internally).
 */
export interface Estimate {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  lead_id?: string;
  customer_id?: string;
  customer_name: string;
  property_address: string;
  service_type: ServiceType;
  status: MeasurementStatus;
  scheduled_date?: string; // measurement appointment date
  scheduled_time?: string; // measurement appointment time
  city?: string;
  county?: string;
  estimator_id?: string;
  estimator_name?: string; // assigned estimator

  // Project-level measurement details
  project_type?: PropertyType;
  year_built?: number;
  stories?: number;
  exterior_type?: string; // siding / exterior type
  access_difficulty?: string;
  lead_safe_pre1978?: boolean; // lead-safe / pre-1978 flag
  permit_required?: boolean;
  hoa_approval_required?: boolean;
  installation_method?: string;
  preferred_manufacturer?: string;
  preferred_product_line?: string;
  interior_trim_work?: boolean;
  exterior_trim_capping?: boolean;
  visible_damage?: boolean; // visible rot or water damage
  disposal_required?: boolean;
  estimator_notes?: string;

  openings: WindowOpening[];

  subtotal?: number;
  discount?: number;
  tax?: number;
  total?: number;
  created_at: string;
  updated_at?: string;
}

export interface QuoteLineItem {
  id: string;
  description: string;
  category?: string;
  opening_id?: string; // linked window opening
  quantity: number;
  unit_price: number;
  total: number;
}

export interface Quote {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  estimate_id?: string;
  lead_id?: string; // §15 — every new quote is associated with a lead
  owner_id?: string; // assigned sales rep (team member) — drives visibility (§14)
  customer_id: string;
  customer_name: string;
  property_address: string;
  service_type: ServiceType;
  status: QuoteStatus;

  // §15 — "Scope of Work" renamed to Notes; shown on the customer agreement.
  notes?: string;
  scope_of_work?: string; // legacy alias

  // §24/§25 — inventory-based configured line items with immutable snapshots.
  // Optional at the type level so legacy quote flows compile; the new
  // lead-based quote page always populates them.
  items?: QuoteItem[];
  subtotal_cents?: number;
  total_cents?: number;

  // Legacy fields retained so existing /quotes list + convert-to-job compile.
  line_items?: QuoteLineItem[];
  subtotal?: number;
  discount?: number;
  tax?: number;
  deposit_amount?: number;
  total: number; // dollar mirror of total_cents for legacy consumers

  customer_notes?: string;
  internal_notes?: string;
  sent_at?: string;
  created_at: string;
  updated_at?: string;
}

/** A single attribute choice captured on a quote line (immutable snapshot). */
export interface QuoteItemAttributeSelection {
  attribute_id: string;
  attribute_name: string;
  type: "select" | "number";
  option_id?: string;
  option_label?: string;
  number_value?: number;
  unit_label?: string;
  // Snapshotted pricing at time of add (per selection / per unit-of-measure).
  cost_cents: number; // internal cost contribution
  upcharge_cents: number; // customer-facing contribution
}

/** A configured inventory item added to a quote — fully snapshotted (§25). */
export interface QuoteItem {
  id: string;
  catalog_item_id: string;
  // Snapshots — historical quotes must not change if the catalog changes.
  series_snapshot: string;
  window_type_snapshot: string;
  universal_range_snapshot: string;
  item_name_snapshot: string;
  base_price_cents_snapshot: number;
  base_cost_cents_snapshot: number;
  selections: QuoteItemAttributeSelection[];
  configured_unit_price_cents: number;
  configured_unit_cost_cents: number;
  quantity: number;
  line_total_cents: number;
  line_cost_cents: number;
  created_at: string;
}

export interface PurchaseOrderItem {
  id: string;
  opening_ref?: string; // room or opening reference
  quantity: number;
  width?: number;
  height?: number;
  model_sku?: string;
  style?: string;
  frame?: string;
  color?: string;
  glass_package?: string;
  grids?: string;
  screens?: string;
  unit_cost?: number;
  received_quantity?: number;
  damaged?: boolean;
  notes?: string;
}

export interface PurchaseOrder {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  quote_id?: string; // accepted quote
  customer_id?: string;
  customer_name: string;
  job_id?: string;
  manufacturer?: string;
  product_line?: string;
  supplier?: string;
  po_number?: string;
  order_date?: string;
  confirmed_date?: string;
  estimated_ship_date?: string;
  estimated_arrival_date?: string;
  actual_arrival_date?: string;
  status: PurchaseOrderStatus;
  supplier_contact?: string;
  freight_cost?: number;
  storage_location?: string;
  tracking_info?: string;
  internal_notes?: string;
  items: PurchaseOrderItem[];
  created_at: string;
  updated_at?: string;
}

export interface Job {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  quote_id?: string;
  estimate_id?: string; // measurement record
  purchase_order_id?: string;
  customer_id: string;
  customer_name: string;
  customer_phone: string;
  address: string;
  city: string;
  county?: string;
  service_type: ServiceType;
  stage: JobStage;
  crew_id?: string;
  crew_name?: string;
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  estimated_install_days?: number;
  priority: "low" | "medium" | "high";

  // Fulfillment / status flags
  units_count?: number;
  permit_status?: "not_required" | "pending" | "approved";
  inspection_status?: "not_required" | "scheduled" | "passed" | "failed";
  material_delivery_status?: "pending" | "partial" | "received";
  deposit_status?: "none" | "pending" | "paid";
  reorder_status?: "none" | "needed" | "ordered";
  final_walkthrough_status?: "pending" | "passed" | "failed";

  // Checklists & punch list
  pre_install_checklist?: string[];
  installation_checklist?: string[];
  quality_control_checklist?: string[];
  punch_list?: string[];

  materials?: string[];
  completion_notes?: string;
  internal_notes?: string;
  customer_notes?: string;
  invoice_status?: "none" | "draft" | "sent" | "paid";
  payment_status?: "none" | "pending" | "paid" | "partial";
  review_request_status?: ReviewRequestStatus;
  quality_check_status?: "pending" | "passed" | "failed";
  job_value: number;
  created_at: string;
  updated_at?: string;
}

export interface Crew {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  name: string;
  lead_name: string;
  phone: string;
  email?: string;
  member_count: number;
  members?: string[];
  skills: string[];
  availability?: string;
  status?: CrewStatus;
  active_jobs: number;
  completed_jobs: number;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface CrewMember {
  id: string;
  crew_id: string;
  full_name: string;
  phone: string;
  role: string;
  skills: string[];
  availability: "available" | "on_job" | "off";
}

export interface Material {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  reorder_level: number;
  supplier: string;
  cost: number;
  color_options?: string[];
  notes?: string;
}

export interface Communication {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  entity_type: "lead" | "customer" | "job";
  entity_id: string;
  type: "call" | "text" | "email" | "note" | "appointment" | "quote" | "job" | "review" | "order";
  subject: string;
  body: string;
  created_by: string;
  created_at: string;
}

export interface Review {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  customer_id: string;
  customer_name: string;
  job_id?: string;
  status: ReviewRequestStatus | "pending" | "requested" | "received";
  rating?: number;
  platform: "google" | "facebook" | "other";
  request_method?: "sms" | "email" | "manual";
  review_link?: string;
  service_type?: ServiceType;
  phone?: string;
  email?: string;
  message?: string;
  requested_at?: string;
  received_at?: string;
  sent_at?: string;
  happy_customer: boolean;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleEvent {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  title: string;
  type: CalendarEventType;
  start: string;
  end: string;
  customer_name?: string;
  address?: string;
  city?: string;
  crew_id?: string;
  crew_name?: string;
  lead_id?: string;
  customer_id?: string;
  estimate_id?: string;
  job_id?: string;
  order_id?: string;
  notes?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
}

export interface InventoryLog {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  material_id: string;
  item_name: string;
  action: "add" | "remove" | "assign_job" | "adjust";
  quantity_changed: number;
  job_id?: string;
  notes?: string;
  created_at: string;
}

export interface MarketingCampaign {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  name: string;
  source: string; // channel
  city?: string;
  county?: string; // location
  service_type?: ServiceType;
  spend: number;
  leads_generated: number;
  qualified_leads: number;
  measurements_booked: number;
  proposals_issued: number;
  jobs_won: number;
  estimated_revenue: number;
  sold_revenue: number;
  collected_revenue: number;
  cost: number; // retained alias of spend for compatibility
  actual_revenue: number; // retained alias of sold_revenue
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface Automation {
  id: string;
  name: string;
  trigger: string;
  delay: string;
  action: string;
  enabled: boolean;
}

export interface Invoice {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  job_id: string;
  customer_id: string;
  customer_name: string;
  amount: number;
  status: "draft" | "sent" | "paid" | "overdue";
  due_date: string;
  paid_at?: string;
}

// ── §3 Repeatable lead contacts ──────────────────────────────────
export interface LeadContact {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  lead_id?: string;
  first_name: string;
  last_name: string;
  phone: string;
  email?: string;
  notes?: string;
  is_primary: boolean;
  created_at: string;
  updated_at?: string;
}

// ── §7 Team members (UserProfile) ────────────────────────────────
import type { TeamRole } from "@/lib/domain";
export type { TeamRole };

export interface NotificationPreferences {
  email_assignment: boolean;
  email_confirmation: boolean;
}

export interface TeamMember {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  role: TeamRole;
  active: boolean;
  manager_id?: string; // §7 — a rep may have one manager
  notification_preferences: NotificationPreferences;
  created_at: string;
  updated_at?: string;
}

// ── §8/§12/§28 Notifications (outbox / log) ──────────────────────
export type NotificationKind =
  | "lead_assignment"
  | "manager_assignment"
  | "website_manager"
  | "admin_unassigned";

export interface NotificationRecord {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  kind: NotificationKind;
  lead_id: string;
  recipient_user_id?: string;
  recipient_role?: string;
  to_email: string;
  subject: string;
  body_html: string;
  status: "queued" | "sent" | "failed" | "sandbox";
  error?: string;
  dedupe_key: string; // prevents duplicate sends on retry (§8)
  confirmation_id?: string;
  created_at: string;
  sent_at?: string;
}

// ── §10 Appointment confirmations ────────────────────────────────
export interface AppointmentConfirmation {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  notification_id: string;
  lead_id: string;
  recipient_user_id?: string;
  recipient_role?: string;
  token_hash: string; // only the hash is stored (§10)
  status: "pending" | "confirmed" | "expired";
  expires_at: string;
  confirmed_at?: string;
  created_at: string;
}

// ── §28 Lead activity timeline ───────────────────────────────────
export type LeadActivityType =
  | "lead_created"
  | "contact_added"
  | "lead_assigned"
  | "appointment_scheduled"
  | "assignment_email_generated"
  | "assignment_email_sent"
  | "assignment_email_failed"
  | "rep_confirmed_receipt"
  | "manager_confirmed_receipt"
  | "website_lead_imported"
  | "quote_started"
  | "quote_saved"
  | "quote_status_changed";

export interface LeadActivity {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  lead_id: string;
  type: LeadActivityType;
  actor: string; // user name or "System" / "Website"
  description: string;
  related_id?: string;
  metadata?: Record<string, string | number | boolean | null>;
  created_at: string;
}

// ── §18–§22 Inventory catalog hierarchy ──────────────────────────
export interface CatalogSeries {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  name: string;
  description?: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string;
}

export interface CatalogWindowType {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  series_id: string;
  name: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at?: string;
}

export interface CatalogUniversalRange {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  window_type_id: string;
  label: string;
  min_in: number; // inclusive
  max_in: number; // inclusive
  base_cost_cents?: number;
  base_price_cents?: number;
  active: boolean;
  sort_order: number;
  notes?: string;
  created_at: string;
  updated_at?: string;
}

export interface CatalogAttributeOption {
  id: string;
  label: string;
  cost_adj_cents: number; // internal cost adjustment
  upcharge_cents: number; // customer upcharge
  is_default: boolean;
  active: boolean;
  sort_order: number;
}

export interface CatalogAttribute {
  id: string;
  item_id: string; // attached to a sellable item
  name: string;
  type: "select" | "number";
  required: boolean;
  active: boolean;
  sort_order: number;
  // select-type:
  options?: CatalogAttributeOption[];
  // number-type:
  unit_label?: string;
  cost_per_unit_cents?: number;
  charge_per_unit_cents?: number;
  min?: number;
  max?: number;
  step?: number;
  default_value?: number;
}

export interface CatalogItem {
  id: string;
  /** Owning tenant (§1). Required in the database; optional here only so the
   * pre-tenant sandbox store migrates cleanly (see crm-store migration v4). */
  tenant_id?: string;
  name: string;
  series_id: string;
  window_type_id: string;
  universal_range_id?: string;
  base_cost_cents: number;
  base_price_cents: number;
  supplier?: string;
  sku?: string;
  inventory_mode: "tracked" | "unlimited";
  quantity?: number; // tracked mode only
  reorder_level?: number; // tracked mode only
  active: boolean;
  archived: boolean; // archived items stay on historical quotes (§18/§25)
  notes?: string;
  attributes: CatalogAttribute[];
  created_at: string;
  updated_at?: string;
}
