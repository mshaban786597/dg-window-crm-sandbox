/**
 * Domain entity types for DG Window CRM.
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
  full_name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  county: string; // county or region
  zip_code: string;
  service_requested: ServiceType; // project type / service needed
  lead_source: LeadSource;
  urgency: UrgencyLevel;
  property_type: PropertyType;
  notes?: string;
  photos?: string[];
  preferred_appointment_date?: string;
  created_at: string;
  updated_at?: string;
  assigned_estimator_id?: string; // assigned sales representative
  assigned_estimator_name?: string;
  status: LeadStage;
  estimated_project_value?: number;
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
  estimate_id?: string;
  lead_id?: string;
  customer_id: string;
  customer_name: string;
  property_address: string;
  service_type: ServiceType;
  status: QuoteStatus;
  scope_of_work: string;
  line_items: QuoteLineItem[];

  subtotal: number;
  discount: number;
  tax: number;
  deposit_amount?: number;
  total: number;

  optional_upgrades?: string[];
  financing_option?: string;
  production_lead_time?: string;
  installation_duration?: string;
  warranty_notes?: string;
  expires_at?: string;
  customer_notes?: string;
  internal_notes?: string;
  sent_at?: string;
  created_at: string;
  updated_at?: string;
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
  job_id: string;
  customer_id: string;
  customer_name: string;
  amount: number;
  status: "draft" | "sent" | "paid" | "overdue";
  due_date: string;
  paid_at?: string;
}
