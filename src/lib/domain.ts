/**
 * Central domain configuration for DG Window CRM.
 *
 * This is the single source of truth for window-industry terminology:
 * services, pipeline stages, statuses, taxonomies, and enums. Types are
 * derived from these const arrays so labels and unions never drift apart.
 *
 * Anything that is meant to be tailored per-company (services, lead stages,
 * lead sources, manufacturers, product lines, tax rate, review link, etc.)
 * ships here only as a DEFAULT and is overridable from Settings.
 */

// ── Product identity ─────────────────────────────────────────────
export const APP = {
  name: "DG Window CRM",
  subtitle: "Window Sales & Operations",
} as const;

// ── Sandbox flags ────────────────────────────────────────────────
// Read from env with safe defaults. In sandbox mode no external
// integration (email/SMS/webhook/third-party API) may execute.
export const SANDBOX_MODE =
  (process.env.NEXT_PUBLIC_SANDBOX_MODE ?? "true") !== "false";

export const EXTERNAL_INTEGRATIONS_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_EXTERNAL_INTEGRATIONS === "true";

/** True when it is safe to call an external service. */
export const canUseExternalIntegrations =
  !SANDBOX_MODE && EXTERNAL_INTEGRATIONS_ENABLED;

// ── Generic company profile defaults (blank on purpose) ──────────
export const DEFAULT_COMPANY = {
  name: "",
  phone: "",
  email: "",
  website: "",
  service_area: "",
  review_link: "",
  logo_url: "",
  default_tax_rate: 0,
  currency: "USD",
  timezone: "America/New_York",
  proposal_validity_days: 30,
  default_deposit_percent: 0,
} as const;

// ── Services (window taxonomy — editable in Settings) ────────────
export const SERVICES = [
  "window_replacement",
  "window_installation",
  "new_construction_windows",
  "window_repair",
  "glass_replacement",
  "impact_windows",
  "energy_efficient_windows",
  "custom_windows",
  "commercial_windows",
  "sliding_glass_doors",
] as const;
export type ServiceType = (typeof SERVICES)[number];

export const SERVICE_LABELS: Record<string, string> = {
  window_replacement: "Window Replacement",
  window_installation: "Window Installation",
  new_construction_windows: "New Construction Windows",
  window_repair: "Window Repair",
  glass_replacement: "Glass Replacement",
  impact_windows: "Impact Windows",
  energy_efficient_windows: "Energy-Efficient Windows",
  custom_windows: "Custom Windows",
  commercial_windows: "Commercial Windows",
  sliding_glass_doors: "Sliding Glass Doors",
};

// ── Property types ───────────────────────────────────────────────
export const PROPERTY_TYPES = [
  "residential",
  "commercial",
  "multifamily",
  "new_construction",
] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  residential: "Residential",
  commercial: "Commercial",
  multifamily: "Multifamily",
  new_construction: "New Construction",
};

// ── Lead pipeline stages ─────────────────────────────────────────
export const LEAD_STAGES = [
  "new_lead",
  "contact_attempted",
  "contacted",
  "qualified",
  "measurement_scheduled",
  "measurement_completed",
  "proposal_sent",
  "follow_up_needed",
  "won",
  "lost",
  "archived",
] as const;
export type LeadStage = (typeof LEAD_STAGES)[number];

export const LEAD_STAGE_LABELS: Record<string, string> = {
  new_lead: "New Lead",
  contact_attempted: "Contact Attempted",
  contacted: "Contacted",
  qualified: "Qualified",
  measurement_scheduled: "Measurement Scheduled",
  measurement_completed: "Measurement Completed",
  proposal_sent: "Proposal Sent",
  follow_up_needed: "Follow-Up Needed",
  won: "Won",
  lost: "Lost",
  archived: "Archived",
};

// ── Lead sources (editable in Settings) ──────────────────────────
export const LEAD_SOURCES = [
  "website_form",
  "google_business",
  "organic_search",
  "google_ads",
  "local_services_ads",
  "meta_ads",
  "phone_call",
  "referral",
  "home_show",
  "door_to_door",
  "builder_contractor",
  "returning_customer",
  "other",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  website_form: "Website Form",
  google_business: "Google Business Profile",
  organic_search: "Organic Search",
  google_ads: "Google Ads",
  local_services_ads: "Local Services Ads",
  meta_ads: "Meta Ads",
  phone_call: "Phone Call",
  referral: "Referral",
  home_show: "Home Show",
  door_to_door: "Door-to-Door",
  builder_contractor: "Builder or Contractor",
  returning_customer: "Returning Customer",
  other: "Other",
};

// ── Lead qualification enums ─────────────────────────────────────
export const LEAD_QUALITY = ["hot", "warm", "cold", "unqualified"] as const;
export type LeadQuality = (typeof LEAD_QUALITY)[number];

export const LEAD_QUALITY_LABELS: Record<string, string> = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  unqualified: "Unqualified",
};

export const PROJECT_TIMEFRAMES = [
  "immediate",
  "1_3_months",
  "3_6_months",
  "6_12_months",
  "just_researching",
] as const;

export const PROJECT_TIMEFRAME_LABELS: Record<string, string> = {
  immediate: "Immediate",
  "1_3_months": "1–3 months",
  "3_6_months": "3–6 months",
  "6_12_months": "6–12 months",
  just_researching: "Just researching",
};

export const CONTACT_METHODS = ["phone", "text", "email"] as const;
export const CONTACT_METHOD_LABELS: Record<string, string> = {
  phone: "Phone",
  text: "Text",
  email: "Email",
};

export const OCCUPANCY = ["occupied", "vacant"] as const;
export const OCCUPANCY_LABELS: Record<string, string> = {
  occupied: "Occupied",
  vacant: "Vacant",
};

export const URGENCY_LEVELS = ["low", "medium", "high", "urgent"] as const;
export type UrgencyLevel = (typeof URGENCY_LEVELS)[number];
export const URGENCY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

// ── Window product enums (used by measurements, openings, orders) ─
export const WINDOW_STYLES = [
  "single_hung",
  "double_hung",
  "casement",
  "awning",
  "sliding",
  "picture",
  "bay",
  "bow",
  "garden",
  "specialty",
  "sliding_glass_door",
] as const;
export type WindowStyle = (typeof WINDOW_STYLES)[number];
export const WINDOW_STYLE_LABELS: Record<string, string> = {
  single_hung: "Single Hung",
  double_hung: "Double Hung",
  casement: "Casement",
  awning: "Awning",
  sliding: "Sliding",
  picture: "Picture / Fixed",
  bay: "Bay",
  bow: "Bow",
  garden: "Garden",
  specialty: "Specialty / Shaped",
  sliding_glass_door: "Sliding Glass Door",
};

export const OPERATION_TYPES = [
  "fixed",
  "operable",
  "left_hand",
  "right_hand",
  "tilt_turn",
] as const;
export const OPERATION_TYPE_LABELS: Record<string, string> = {
  fixed: "Fixed",
  operable: "Operable",
  left_hand: "Left Hand",
  right_hand: "Right Hand",
  tilt_turn: "Tilt / Turn",
};

export const FRAME_MATERIALS = [
  "vinyl",
  "aluminum",
  "wood",
  "fiberglass",
  "composite",
  "clad_wood",
] as const;
export type FrameMaterial = (typeof FRAME_MATERIALS)[number];
export const FRAME_MATERIAL_LABELS: Record<string, string> = {
  vinyl: "Vinyl",
  aluminum: "Aluminum",
  wood: "Wood",
  fiberglass: "Fiberglass",
  composite: "Composite",
  clad_wood: "Clad Wood",
};

export const GLASS_PACKAGES = [
  "standard_dual_pane",
  "low_e",
  "low_e_argon",
  "triple_pane",
  "impact_laminated",
  "tempered",
  "obscured",
] as const;
export const GLASS_PACKAGE_LABELS: Record<string, string> = {
  standard_dual_pane: "Standard Dual Pane",
  low_e: "Low-E",
  low_e_argon: "Low-E + Argon",
  triple_pane: "Triple Pane",
  impact_laminated: "Impact / Laminated",
  tempered: "Tempered",
  obscured: "Obscured / Privacy",
};

export const GRID_PATTERNS = [
  "none",
  "colonial",
  "prairie",
  "diamond",
  "custom",
] as const;
export const GRID_PATTERN_LABELS: Record<string, string> = {
  none: "None",
  colonial: "Colonial",
  prairie: "Prairie",
  diamond: "Diamond",
  custom: "Custom",
};

export const SCREEN_OPTIONS = [
  "none",
  "half_screen",
  "full_screen",
  "retractable",
] as const;
export const SCREEN_OPTION_LABELS: Record<string, string> = {
  none: "None",
  half_screen: "Half Screen",
  full_screen: "Full Screen",
  retractable: "Retractable",
};

export const INSTALLATION_METHODS = [
  "insert_pocket",
  "full_frame",
  "new_construction",
] as const;
export const INSTALLATION_METHOD_LABELS: Record<string, string> = {
  insert_pocket: "Insert / Pocket",
  full_frame: "Full-Frame Replacement",
  new_construction: "New Construction",
};

export const MEASUREMENT_UNITS = ["in", "cm"] as const;
export const MEASUREMENT_UNIT_LABELS: Record<string, string> = {
  in: "Inches",
  cm: "Centimeters",
};

export const OPENING_CONDITIONS = [
  "good",
  "fair",
  "poor",
  "rot_present",
  "water_damage",
] as const;
export const OPENING_CONDITION_LABELS: Record<string, string> = {
  good: "Good",
  fair: "Fair",
  poor: "Poor",
  rot_present: "Rot Present",
  water_damage: "Water Damage",
};

// ── Measurement (formerly Estimate) statuses ─────────────────────
export const MEASUREMENT_STATUSES = [
  "scheduled",
  "in_progress",
  "completed",
  "quoted",
  "no_show",
  "rescheduled",
  "cancelled",
  "converted_to_quote",
] as const;
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];
export const MEASUREMENT_STATUS_LABELS: Record<string, string> = {
  scheduled: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  quoted: "Quoted",
  no_show: "No Show",
  rescheduled: "Rescheduled",
  cancelled: "Cancelled",
  converted_to_quote: "Converted to Quote",
};

export const ACCESS_DIFFICULTY = ["easy", "moderate", "difficult"] as const;
export const ACCESS_DIFFICULTY_LABELS: Record<string, string> = {
  easy: "Easy",
  moderate: "Moderate",
  difficult: "Difficult",
};

// ── Quote statuses ───────────────────────────────────────────────
export const QUOTE_STATUSES = [
  "draft",
  "sent",
  "viewed",
  "accepted",
  "declined",
  "expired",
] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const QUOTE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  accepted: "Accepted",
  declined: "Declined",
  expired: "Expired",
};

// Optional quote upgrade catalog (no hardcoded pricing).
export const OPTIONAL_UPGRADES = [
  "low_e_glass_package",
  "impact_rated_glass",
  "upgraded_grids",
  "full_screens",
  "exterior_aluminum_capping",
  "interior_trim_replacement",
  "extended_labor_warranty",
] as const;
export const OPTIONAL_UPGRADE_LABELS: Record<string, string> = {
  low_e_glass_package: "Low-E glass package",
  impact_rated_glass: "Impact-rated glass",
  upgraded_grids: "Upgraded grids",
  full_screens: "Full screens",
  exterior_aluminum_capping: "Exterior aluminum capping",
  interior_trim_replacement: "Interior trim replacement",
  extended_labor_warranty: "Extended labor warranty",
};

// ── Purchase order (Window Orders) statuses ──────────────────────
export const PURCHASE_ORDER_STATUSES = [
  "draft",
  "submitted",
  "confirmed",
  "in_production",
  "shipped",
  "partially_received",
  "received",
  "damaged_short",
  "ready_for_installation",
  "cancelled",
] as const;
export type PurchaseOrderStatus = (typeof PURCHASE_ORDER_STATUSES)[number];
export const PURCHASE_ORDER_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  confirmed: "Confirmed",
  in_production: "In Production",
  shipped: "Shipped",
  partially_received: "Partially Received",
  received: "Received",
  damaged_short: "Damaged or Short",
  ready_for_installation: "Ready for Installation",
  cancelled: "Cancelled",
};

// ── Job stages (window fulfillment) ──────────────────────────────
export const JOB_STAGES = [
  "not_scheduled",
  "deposit_pending",
  "measurement_verified",
  "order_pending",
  "ordered",
  "in_production",
  "materials_received",
  "installation_scheduled",
  "crew_assigned",
  "in_progress",
  "quality_check",
  "punch_list",
  "completed",
  "invoice_sent",
  "paid",
  "review_requested",
  "closed",
] as const;
export type JobStage = (typeof JOB_STAGES)[number];
export const JOB_STAGE_LABELS: Record<string, string> = {
  not_scheduled: "Not Scheduled",
  deposit_pending: "Deposit Pending",
  measurement_verified: "Measurement Verified",
  order_pending: "Order Pending",
  ordered: "Ordered",
  in_production: "In Production",
  materials_received: "Materials Received",
  installation_scheduled: "Installation Scheduled",
  crew_assigned: "Crew Assigned",
  in_progress: "In Progress",
  quality_check: "Quality Check",
  punch_list: "Punch List",
  completed: "Completed",
  invoice_sent: "Invoice Sent",
  paid: "Paid",
  review_requested: "Review Requested",
  closed: "Closed",
};

// Job stages that count as "active" / "complete" for stats.
export const JOB_COMPLETE_STAGES = [
  "completed",
  "invoice_sent",
  "paid",
  "review_requested",
  "closed",
] as const;

// ── Calendar event types ─────────────────────────────────────────
export const CALENDAR_EVENT_TYPES = [
  "measurement",
  "installation",
  "repair",
  "delivery",
  "inspection",
  "follow_up",
  "payment",
  "review",
  "internal",
] as const;
export type CalendarEventType = (typeof CALENDAR_EVENT_TYPES)[number];
export const CALENDAR_EVENT_TYPE_LABELS: Record<string, string> = {
  measurement: "Measurement",
  installation: "Installation",
  repair: "Repair",
  delivery: "Delivery",
  inspection: "Inspection",
  follow_up: "Follow-Up",
  payment: "Payment",
  review: "Review",
  internal: "Internal",
};

// ── Crew skills (editable) ───────────────────────────────────────
export const CREW_SKILLS = [
  "Insert or Pocket Installation",
  "Full-Frame Replacement",
  "New Construction Installation",
  "Impact Window Installation",
  "Commercial Window Installation",
  "Glass Replacement",
  "Sliding Glass Door Installation",
  "Exterior Capping",
  "Interior Trim",
  "Caulking and Waterproofing",
  "Service and Repair",
  "Final Quality Inspection",
] as const;

export const CREW_STATUSES = [
  "available",
  "assigned",
  "off_today",
  "inactive",
] as const;
export type CrewStatus = (typeof CREW_STATUSES)[number];
export const CREW_STATUS_LABELS: Record<string, string> = {
  available: "Available",
  assigned: "Assigned",
  off_today: "Off Today",
  inactive: "Inactive",
};

// ── Inventory categories ─────────────────────────────────────────
export const INVENTORY_CATEGORIES = [
  "Ordered Window Units",
  "Glass and IGUs",
  "Screens",
  "Window Hardware",
  "Exterior Capping Coil",
  "Interior Trim",
  "Flashing Tape",
  "Sill Pans",
  "Sealants and Caulk",
  "Expanding Foam",
  "Shims",
  "Fasteners",
  "Protective Materials",
  "Tools",
  "PPE",
  "Other",
] as const;

// ── Review request statuses ──────────────────────────────────────
export const REVIEW_STATUSES = [
  "not_requested",
  "requested",
  "sent",
  "opened",
  "received",
  "failed",
  "follow_up_needed",
] as const;
export type ReviewRequestStatus = (typeof REVIEW_STATUSES)[number];
export const REVIEW_STATUS_LABELS: Record<string, string> = {
  not_requested: "Not Requested",
  requested: "Requested",
  sent: "Sent",
  opened: "Opened",
  received: "Completed",
  failed: "Failed",
  follow_up_needed: "Follow-Up Needed",
};

// ── User roles ───────────────────────────────────────────────────
export const USER_ROLES = [
  "owner",
  "sales_manager",
  "estimator",
  "crew_manager",
  "field_crew",
  "office_staff",
] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner / Admin",
  sales_manager: "Sales Manager",
  estimator: "Estimator",
  crew_manager: "Crew Manager",
  field_crew: "Field Crew",
  office_staff: "Office Staff",
};

// ── Automation templates (display only; never execute) ───────────
export interface AutomationTemplate {
  id: string;
  name: string;
  trigger: string;
  delay: string;
  action: string;
}
export const AUTOMATION_TEMPLATES: AutomationTemplate[] = [
  { id: "new_lead_ack", name: "New lead acknowledgment", trigger: "lead_created", delay: "Immediate", action: "Send acknowledgment" },
  { id: "contact_attempt_reminder", name: "Contact-attempt reminder", trigger: "no_contact", delay: "1 hour", action: "Remind sales rep" },
  { id: "measurement_reminder", name: "Measurement appointment reminder", trigger: "measurement_scheduled", delay: "1 day before", action: "Send reminder" },
  { id: "quote_followup_1d", name: "Quote follow-up after 1 day", trigger: "proposal_sent", delay: "1 day", action: "Send follow-up" },
  { id: "quote_followup_3d", name: "Quote follow-up after 3 days", trigger: "proposal_sent", delay: "3 days", action: "Send follow-up" },
  { id: "quote_followup_7d", name: "Quote follow-up after 7 days", trigger: "proposal_sent", delay: "7 days", action: "Send follow-up" },
  { id: "accepted_missing_deposit", name: "Accepted quote missing deposit", trigger: "quote_accepted", delay: "1 day", action: "Notify office" },
  { id: "po_eta_followup", name: "Purchase-order ETA follow-up", trigger: "order_submitted", delay: "Weekly", action: "Check supplier ETA" },
  { id: "install_reminder", name: "Installation reminder", trigger: "installation_scheduled", delay: "1 day before", action: "Send reminder" },
  { id: "completion_followup", name: "Completion follow-up", trigger: "job_completed", delay: "1 day", action: "Send follow-up" },
  { id: "review_request", name: "Review request", trigger: "job_completed", delay: "2 days", action: "Send review request" },
];

// ── Navigation ───────────────────────────────────────────────────
export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "LayoutDashboard", roles: "all" },
  { href: "/leads", label: "Leads", icon: "Users", roles: "all" },
  { href: "/customers", label: "Customers", icon: "UserCircle", roles: "all" },
  { href: "/estimates", label: "Measurements", icon: "Ruler", roles: "all" },
  { href: "/quotes", label: "Quotes", icon: "FileText", roles: "all" },
  { href: "/orders", label: "Window Orders", icon: "PackageOpen", roles: "all" },
  { href: "/jobs", label: "Jobs", icon: "Hammer", roles: "all" },
  { href: "/calendar", label: "Calendar", icon: "Calendar", roles: "all" },
  { href: "/crews", label: "Crews", icon: "HardHat", roles: "crew_manager,owner,field_crew" },
  { href: "/inventory", label: "Inventory", icon: "Package", roles: "crew_manager,owner,office_staff" },
  { href: "/reviews", label: "Reviews", icon: "Star", roles: "all" },
  { href: "/reports", label: "Reports", icon: "BarChart3", roles: "owner,sales_manager,office_staff" },
  { href: "/marketing", label: "Marketing", icon: "Megaphone", roles: "owner,sales_manager" },
  { href: "/settings", label: "Settings", icon: "Settings", roles: "owner" },
] as const;

// Default window manufacturers / product lines shipped as blank
// starting points — populated by the company in Settings.
export const DEFAULT_MANUFACTURERS: string[] = [];
export const DEFAULT_PRODUCT_LINES: string[] = [];
export const DEFAULT_SERVICE_AREAS: string[] = [];
