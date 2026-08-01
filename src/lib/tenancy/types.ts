/**
 * Multi-tenant SaaS core types (§1, §7, §11).
 *
 * SECURITY MODEL
 * --------------
 * Tenant isolation is enforced at the DATABASE and SERVER layers:
 *   - every tenant-owned row carries a NOT NULL `tenant_id`
 *   - Postgres RLS policies scope reads/writes to the caller's active
 *     memberships (see supabase/migrations/0003_multi_tenant.sql)
 *   - server route guards + tenant-scoped query helpers re-assert the scope
 *
 * The local Zustand/localStorage mode is a NON-PRODUCTION sandbox. Browser
 * storage is fully readable/writable by the end user, so it is NOT a security
 * boundary and must never hold more than one tenant's real data.
 */

// ── Platform vs tenant roles ─────────────────────────────────────
/** Platform-level role. Never self-assignable; bootstrap only (§3, §25). */
export const PLATFORM_ROLES = ["platform_super_admin", "platform_support"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const TENANT_ROLES = [
  "tenant_owner",
  "tenant_admin",
  "manager",
  "sales_representative",
  "estimator",
  "crew",
  "marketing",
  "accountant",
  "read_only",
] as const;
export type TenantRole = (typeof TENANT_ROLES)[number];

export const TENANT_ROLE_LABELS: Record<TenantRole, string> = {
  tenant_owner: "Owner",
  tenant_admin: "Administrator",
  manager: "Manager",
  sales_representative: "Sales Representative",
  estimator: "Estimator",
  crew: "Crew",
  marketing: "Marketing",
  accountant: "Accountant",
  read_only: "Read Only",
};

// ── Tenant lifecycle ─────────────────────────────────────────────
export const TENANT_STATUSES = ["trial", "active", "suspended", "cancelled"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  trial: "Trial",
  active: "Active",
  suspended: "Suspended",
  cancelled: "Cancelled",
};

export const ONBOARDING_STEPS = [
  "company_profile",
  "services",
  "service_areas",
  "team",
  "lead_sources",
  "catalog",
  "notifications",
  "website_integration",
  "review",
] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_STEP_LABELS: Record<OnboardingStep, string> = {
  company_profile: "Company Profile",
  services: "Services",
  service_areas: "Service Areas",
  team: "Team Setup",
  lead_sources: "Lead Sources",
  catalog: "Inventory / Product Catalog",
  notifications: "Notification Settings",
  website_integration: "Website Lead Integration",
  review: "Review and Finish",
};

/** Steps a tenant may skip and resume later (§6). */
export const OPTIONAL_ONBOARDING_STEPS: OnboardingStep[] = [
  "service_areas",
  "team",
  "lead_sources",
  "catalog",
  "notifications",
  "website_integration",
];

export const INVITATION_STATUSES = ["pending", "accepted", "revoked", "expired"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

// ── Entities ─────────────────────────────────────────────────────
export interface PlatformUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone?: string;
  /** Platform role — undefined for ordinary tenant users. */
  platform_role?: PlatformRole;
  /**
   * Platform-level account state. `undefined` is treated as active so existing
   * records keep working; only an explicit `false` disables the account.
   */
  active?: boolean;
  email_verified: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at?: string;
}

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  plan_id?: string;
  owner_user_id: string;
  timezone: string;
  currency: string;
  country?: string;
  state?: string;
  phone?: string;
  website?: string;
  logo_url?: string;
  onboarding_status: "not_started" | "in_progress" | "completed";
  onboarding_completed_steps: OnboardingStep[];
  trial_ends_at?: string;
  suspended_at?: string;
  created_at: string;
  updated_at?: string;
}

/** Per-membership notification opt-ins (§8). Tenant-scoped, never global. */
export interface MembershipNotificationPreferences {
  email_assignment: boolean;
  email_confirmation: boolean;
  email_daily_digest: boolean;
}

export const DEFAULT_MEMBERSHIP_NOTIFICATIONS: MembershipNotificationPreferences = {
  email_assignment: true,
  email_confirmation: true,
  email_daily_digest: false,
};

export interface TenantMembership {
  id: string;
  tenant_id: string;
  user_id: string;
  role: TenantRole;
  /** Optional — falls back to DEFAULT_MEMBERSHIP_NOTIFICATIONS when unset. */
  notification_preferences?: MembershipNotificationPreferences;
  /** Primary manager, referenced by MEMBERSHIP id (tenant-scoped). */
  manager_membership_id?: string;
  job_title?: string;
  department?: string;
  active: boolean;
  invitation_status: InvitationStatus;
  invited_by?: string;
  invited_at?: string;
  accepted_at?: string;
  last_accessed_at?: string;
  created_at: string;
  updated_at?: string;
}

/** Pending invite. Only the token HASH is ever persisted (§9). */
export interface TenantInvitation {
  id: string;
  tenant_id: string;
  email: string;
  role: TenantRole;
  manager_membership_id?: string;
  token_hash: string;
  status: InvitationStatus;
  invited_by_user_id: string;
  expires_at: string;
  accepted_at?: string;
  created_at: string;
}

export interface SubscriptionPlan {
  id: string;
  name: string;
  slug: "starter" | "professional" | "business" | "enterprise";
  /**
   * Recurring monthly list price in INTEGER CENTS (§ money.ts).
   * `null` means custom/contact-sales pricing — such plans contribute 0 to MRR
   * and are reported separately rather than being guessed at.
   */
  price_cents: number | null;
  max_users: number | null;
  max_managers: number | null;
  storage_mb: number | null;
  api_access: boolean;
  audit_retention_days: number;
  active: boolean;
  sort_order: number;
}

export interface TenantSubscription {
  id: string;
  tenant_id: string;
  plan_id: string;
  status: "trialing" | "active" | "past_due" | "cancelled";
  started_at: string;
  current_period_end?: string;
}

export interface FeatureEntitlement {
  id: string;
  tenant_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value?: number | null;
}

/**
 * Plan-level feature default (admin panel Deliverable 3). Applies to every
 * tenant on the plan unless that tenant has its own `FeatureEntitlement`.
 */
export interface PlanEntitlement {
  id: string;
  plan_id: string;
  feature_key: string;
  enabled: boolean;
  limit_value?: number | null;
}

export interface FeatureFlag {
  id: string;
  key: string;
  description?: string;
  enabled_globally: boolean;
  enabled_tenant_ids: string[];
}

// ── Audit + support (§4, §18, §26) ───────────────────────────────
export type AuditAction =
  | "tenant.registered"
  | "tenant.suspended"
  | "tenant.reactivated"
  | "tenant.plan_changed"
  | "user.invited"
  | "user.invitation_accepted"
  | "user.invitation_revoked"
  | "user.role_changed"
  | "user.manager_assigned"
  | "user.deactivated"
  | "lead.created"
  | "lead.assigned"
  | "quote.created"
  | "quote.status_changed"
  | "job.assigned"
  | "job.completed"
  | "data.exported"
  | "platform.tenant_accessed"
  | "platform.support_started"
  | "platform.support_ended"
  | "platform.impersonation_started"
  | "platform.impersonation_ended"
  | "security.setting_changed"
  | "integration.credential_changed"
  | "subscription.changed"
  | "data.deleted"
  // §14 authentication + security events
  | "auth.login_succeeded"
  | "auth.login_failed"
  | "auth.login_rate_limited"
  | "auth.password_reset_requested"
  | "auth.password_changed"
  | "auth.email_verified"
  | "auth.mfa_verified"
  | "auth.session_revoked"
  | "security.rate_limited"
  | "security.provision_failed"
  | "security.invitation_rejected"
  | "security.cross_tenant_attempt"
  | "security.access_denied";

export interface AuditLogEntry {
  id: string;
  /** null for pure platform events (§18). */
  tenant_id: string | null;
  /** The REAL actor. Never rewritten to the impersonated user (§4). */
  actor_user_id: string;
  actor_membership_id?: string;
  actor_role: string;
  /** Set when the action was performed through support/impersonation. */
  impersonated_user_id?: string;
  action: AuditAction;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, string | number | boolean | null>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
}

export const SUPPORT_MODES = ["read_only", "impersonation"] as const;
export type SupportMode = (typeof SUPPORT_MODES)[number];

/** A time-boxed platform-support session into a tenant (§26). */
export interface SupportSession {
  id: string;
  tenant_id: string;
  platform_user_id: string;
  mode: SupportMode;
  reason: string;
  started_at: string;
  expires_at: string;
  ended_at?: string;
}

/** Maximum impersonation/support window before auto-expiry (§4, §26). */
export const SUPPORT_SESSION_MAX_MINUTES = 60;

export const SYSTEM_EVENT_KINDS = [
  "email_failed",
  "integration_failed",
  "job_failed",
  "intake_failed",
  "security",
] as const;
export type SystemEventKind = (typeof SYSTEM_EVENT_KINDS)[number];

export const SYSTEM_EVENT_KIND_LABELS: Record<SystemEventKind, string> = {
  email_failed: "Email failed",
  integration_failed: "Integration failed",
  job_failed: "Job failed",
  intake_failed: "Intake failed",
  security: "Security",
};

export interface SystemEvent {
  id: string;
  tenant_id?: string | null;
  kind: SystemEventKind;
  message: string;
  metadata?: Record<string, string | number | boolean | null>;
  created_at: string;
  /** Set when an operator acknowledges/resolves the event (§ Deliverable 7). */
  resolved_at?: string;
  resolved_by?: string;
}

// ── Active session shape used by guards ──────────────────────────
export interface ActiveSession {
  user: PlatformUser;
  /** Active tenant + membership, when operating inside a workspace. */
  tenant?: Tenant;
  membership?: TenantMembership;
  /** Present while a platform admin is inside a tenant via support (§26). */
  support?: SupportSession;
}
