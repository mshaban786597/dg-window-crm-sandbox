import type {
  ServiceType,
  PropertyType,
  LeadSource,
  QuoteStatus,
  JobStage,
  MeasurementStatus,
  ReviewRequestStatus,
  CrewStatus,
  LeadStage,
  UrgencyLevel,
  LeadQuality,
  PurchaseOrderStatus,
  CalendarEventType,
  WindowOpening,
  QuoteLineItem,
  PurchaseOrderItem,
} from "@/types/database";

export interface CustomerFormData {
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
}

export interface LeadFormData {
  full_name: string;
  phone: string;
  email?: string;
  address: string;
  city: string;
  county: string;
  zip_code: string;
  service_requested: ServiceType;
  lead_source: LeadSource;
  urgency: UrgencyLevel;
  property_type: PropertyType;
  preferred_appointment_date?: string;
  assigned_estimator_id?: string;
  assigned_estimator_name?: string;
  notes?: string;
  status: LeadStage;
  estimated_project_value?: number;

  // Window qualification (optional)
  window_opening_count?: number;
  preferred_window_style?: string;
  preferred_frame_material?: string;
  impact_interest?: boolean;
  energy_efficiency_interest?: boolean;
  financing_interest?: boolean;
  project_timeframe?: string;
  occupancy?: string;
  decision_maker?: boolean;
  preferred_contact_method?: string;
  campaign_name?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  referral_partner?: string;
  lead_quality?: LeadQuality;
  next_follow_up_date?: string;
}

export interface EstimateFormData {
  lead_id?: string;
  customer_id?: string;
  customer_name: string;
  property_address: string;
  city: string;
  county: string;
  service_type: ServiceType;
  status: MeasurementStatus;
  scheduled_date?: string;
  scheduled_time?: string;
  estimator_name?: string;

  project_type?: PropertyType;
  year_built?: number;
  stories?: number;
  exterior_type?: string;
  access_difficulty?: string;
  lead_safe_pre1978?: boolean;
  permit_required?: boolean;
  hoa_approval_required?: boolean;
  installation_method?: string;
  preferred_manufacturer?: string;
  preferred_product_line?: string;
  interior_trim_work?: boolean;
  exterior_trim_capping?: boolean;
  visible_damage?: boolean;
  disposal_required?: boolean;
  estimator_notes?: string;

  openings: WindowOpening[];
}

export interface QuoteFormData {
  lead_id?: string;
  customer_id?: string;
  customer_name: string;
  property_address: string;
  service_type: ServiceType;
  scope_of_work: string;
  estimate_id?: string;
  line_items: QuoteLineItem[];
  discount: number;
  tax_rate: number;
  deposit_amount?: number;
  optional_upgrades?: string[];
  financing_option?: string;
  production_lead_time?: string;
  installation_duration?: string;
  warranty_notes?: string;
  expires_at?: string;
  status: QuoteStatus;
  internal_notes?: string;
  customer_notes?: string;
}

export interface PurchaseOrderFormData {
  quote_id?: string;
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
}

export interface JobFormData {
  customer_id: string;
  quote_id?: string;
  estimate_id?: string;
  purchase_order_id?: string;
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
  units_count?: number;
  permit_status?: "not_required" | "pending" | "approved";
  inspection_status?: "not_required" | "scheduled" | "passed" | "failed";
  material_delivery_status?: "pending" | "partial" | "received";
  deposit_status?: "none" | "pending" | "paid";
  final_walkthrough_status?: "pending" | "passed" | "failed";
  materials?: string[];
  internal_notes?: string;
  customer_notes?: string;
  completion_notes?: string;
  job_value: number;
}

export interface CalendarEventFormData {
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
}

export interface CrewFormData {
  name: string;
  lead_name: string;
  phone: string;
  email?: string;
  skills: string[];
  availability: string;
  status: CrewStatus;
  notes?: string;
}

export interface InventoryFormData {
  name: string;
  category: string;
  quantity: number;
  unit: string;
  reorder_level: number;
  supplier: string;
  cost: number;
  color_options?: string;
  notes?: string;
}

export interface ReviewRequestFormData {
  customer_id: string;
  job_id?: string;
  customer_name: string;
  phone: string;
  email?: string;
  service_type: ServiceType;
  request_method: "sms" | "email" | "manual";
  status?: ReviewRequestStatus;
  rating?: number;
  notes?: string;
}

export interface MarketingCampaignFormData {
  name: string;
  source: LeadSource | string;
  city?: string;
  county?: string;
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
  notes?: string;
}
