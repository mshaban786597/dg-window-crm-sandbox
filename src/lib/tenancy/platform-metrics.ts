/**
 * Platform admin metrics — pure computation (Deliverables 1-8).
 *
 * HONESTY RULE: nothing here invents data. Every figure is derived from the
 * stores that were passed in; an empty platform yields zeros and empty arrays,
 * never a placeholder. Money is INTEGER CENTS throughout (§ lib/money.ts).
 *
 * Kept free of React and of store imports so it is directly unit-testable.
 */
import type {
  AuditLogEntry,
  FeatureEntitlement,
  FeatureFlag,
  PlanEntitlement,
  OnboardingStep,
  SubscriptionPlan,
  SupportSession,
  SystemEvent,
  Tenant,
  TenantMembership,
  TenantSubscription,
} from "./types";
import { ONBOARDING_STEPS, SUPPORT_SESSION_MAX_MINUTES } from "./types";

const DAY_MS = 86_400_000;

// ── Onboarding ───────────────────────────────────────────────────
/**
 * Percentage of onboarding steps completed (0-100, integer).
 * Unknown/duplicate step values are ignored so a corrupted array cannot report
 * more than 100%.
 */
export function onboardingPercent(tenant: Pick<Tenant, "onboarding_completed_steps">): number {
  const total: number = ONBOARDING_STEPS.length;
  const valid = new Set<OnboardingStep>();
  for (const step of tenant.onboarding_completed_steps ?? []) {
    if ((ONBOARDING_STEPS as readonly string[]).includes(step)) valid.add(step);
  }
  return Math.round((valid.size / total) * 100);
}

/** Counts of tenants at each onboarding stage (funnel chart). */
export function onboardingFunnel(tenants: Tenant[]): {
  not_started: number;
  in_progress: number;
  completed: number;
} {
  const out = { not_started: 0, in_progress: 0, completed: 0 };
  for (const t of tenants) {
    if (t.onboarding_status === "completed") out.completed += 1;
    else if (t.onboarding_status === "in_progress") out.in_progress += 1;
    else out.not_started += 1;
  }
  return out;
}

// ── Trials ───────────────────────────────────────────────────────
/**
 * Tenants whose trial ends within `days` (default 7) and has not already
 * lapsed. Only tenants actually in trial are considered.
 */
export function trialsEndingSoon(
  tenants: Tenant[],
  days = 7,
  now: Date = new Date()
): Tenant[] {
  const horizon = now.getTime() + days * DAY_MS;
  return tenants.filter((t) => {
    if (t.status !== "trial" || !t.trial_ends_at) return false;
    const ends = new Date(t.trial_ends_at).getTime();
    if (Number.isNaN(ends)) return false;
    return ends >= now.getTime() && ends <= horizon;
  });
}

/** Whole days until the trial ends; negative when already lapsed. */
export function daysUntilTrialEnd(tenant: Tenant, now: Date = new Date()): number | null {
  if (!tenant.trial_ends_at) return null;
  const ends = new Date(tenant.trial_ends_at).getTime();
  if (Number.isNaN(ends)) return null;
  return Math.ceil((ends - now.getTime()) / DAY_MS);
}

// ── Subscriptions & revenue ──────────────────────────────────────
export interface EffectiveSubscription {
  tenant_id: string;
  plan_id: string | undefined;
  status: TenantSubscription["status"];
  started_at: string;
  /** True when derived from `tenant.plan_id` rather than an explicit record. */
  derived: boolean;
}

/**
 * The subscription in force for a tenant.
 *
 * Prefers an explicit `TenantSubscription`. When none exists we fall back to the
 * tenant's own `plan_id` + lifecycle status, because a tenant sitting on a plan
 * is economically subscribed even before a billing row is written. The result is
 * marked `derived` so callers can distinguish it. A tenant with no plan at all
 * yields `undefined` — never a guessed plan.
 */
export function effectiveSubscription(
  tenant: Tenant,
  subscriptions: TenantSubscription[]
): EffectiveSubscription | undefined {
  const explicit = subscriptions
    .filter((s) => s.tenant_id === tenant.id)
    .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime())[0];

  if (explicit) {
    return {
      tenant_id: tenant.id,
      plan_id: explicit.plan_id,
      status: explicit.status,
      started_at: explicit.started_at,
      derived: false,
    };
  }
  if (!tenant.plan_id) return undefined;

  const status: TenantSubscription["status"] =
    tenant.status === "trial"
      ? "trialing"
      : tenant.status === "active"
        ? "active"
        : "cancelled";

  return {
    tenant_id: tenant.id,
    plan_id: tenant.plan_id,
    status,
    started_at: tenant.created_at,
    derived: true,
  };
}

export interface MrrBreakdown {
  /** Billed monthly recurring revenue, in cents. Trials excluded. */
  mrr_cents: number;
  /** Potential MRR from tenants currently in trial, in cents. */
  trial_mrr_cents: number;
  /** Paying tenants counted in `mrr_cents`. */
  paying_tenants: number;
  /** Tenants on a custom-priced plan (price_cents === null), excluded above. */
  custom_priced_tenants: number;
}

/**
 * Monthly recurring revenue.
 *
 * Only `active` subscriptions count toward MRR — trials are reported separately
 * so the headline number is not inflated. Plans priced `null` (custom) are
 * counted but contribute 0, since guessing their value would be fabrication.
 */
export function computeMrr(
  tenants: Tenant[],
  subscriptions: TenantSubscription[],
  plans: SubscriptionPlan[]
): MrrBreakdown {
  const planPrice = new Map(plans.map((p) => [p.id, p.price_cents] as const));
  const bySlug = new Map(plans.map((p) => [p.slug as string, p.price_cents] as const));
  const out: MrrBreakdown = {
    mrr_cents: 0,
    trial_mrr_cents: 0,
    paying_tenants: 0,
    custom_priced_tenants: 0,
  };

  for (const tenant of tenants) {
    const sub = effectiveSubscription(tenant, subscriptions);
    if (!sub || !sub.plan_id) continue;
    if (sub.status === "cancelled") continue;

    const price = planPrice.has(sub.plan_id)
      ? planPrice.get(sub.plan_id)
      : bySlug.get(sub.plan_id);
    if (price === undefined) continue; // unknown plan → contributes nothing

    if (price === null) {
      out.custom_priced_tenants += 1;
      continue;
    }
    if (sub.status === "trialing") {
      out.trial_mrr_cents += price;
    } else {
      out.mrr_cents += price;
      out.paying_tenants += 1;
    }
  }
  return out;
}

/** MRR by calendar month, oldest → newest, for the revenue trend chart. */
export function mrrByMonth(
  tenants: Tenant[],
  subscriptions: TenantSubscription[],
  plans: SubscriptionPlan[],
  months = 12,
  now: Date = new Date()
): { month: string; mrr_cents: number }[] {
  const out: { month: string; mrr_cents: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59, 999);
    // Only subscriptions that had started by the end of that month.
    const active = tenants.filter((t) => {
      const sub = effectiveSubscription(t, subscriptions);
      if (!sub) return false;
      const started = new Date(sub.started_at).getTime();
      return !Number.isNaN(started) && started <= monthEnd.getTime();
    });
    out.push({
      month: `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`,
      mrr_cents: computeMrr(active, subscriptions, plans).mrr_cents,
    });
  }
  return out;
}

// ── Counts ───────────────────────────────────────────────────────
export function tenantStatusCounts(tenants: Tenant[]) {
  return {
    total: tenants.length,
    trial: tenants.filter((t) => t.status === "trial").length,
    active: tenants.filter((t) => t.status === "active").length,
    suspended: tenants.filter((t) => t.status === "suspended").length,
    cancelled: tenants.filter((t) => t.status === "cancelled").length,
  };
}

/** Distinct users holding an active, accepted membership. */
export function distinctActiveUsers(memberships: TenantMembership[]): number {
  const ids = new Set<string>();
  for (const m of memberships) {
    if (m.active && m.invitation_status === "accepted") ids.add(m.user_id);
  }
  return ids.size;
}

export function newTenantsThisMonth(tenants: Tenant[], now: Date = new Date()): number {
  const start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  return tenants.filter((t) => {
    const created = new Date(t.created_at).getTime();
    return !Number.isNaN(created) && created >= start;
  }).length;
}

/** Tenant registrations per month, oldest → newest. */
export function registrationsByMonth(
  tenants: Tenant[],
  months = 12,
  now: Date = new Date()
): { month: string; count: number }[] {
  const out: { month: string; count: number }[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
    out.push({
      month: key,
      count: tenants.filter((t) => (t.created_at ?? "").slice(0, 7) === key).length,
    });
  }
  return out;
}

export function countByPlan(
  tenants: Tenant[],
  plans: SubscriptionPlan[]
): { plan: string; count: number }[] {
  const rows = plans.map((p) => ({
    plan: p.name,
    count: tenants.filter((t) => t.plan_id === p.id || t.plan_id === p.slug).length,
  }));
  const unassigned = tenants.filter(
    (t) => !t.plan_id || !plans.some((p) => p.id === t.plan_id || p.slug === t.plan_id)
  ).length;
  return unassigned > 0 ? [...rows, { plan: "Unassigned", count: unassigned }] : rows;
}

// ── Events within a window ───────────────────────────────────────
export function withinDays<T extends { created_at: string }>(
  rows: T[],
  days: number,
  now: Date = new Date()
): T[] {
  const cutoff = now.getTime() - days * DAY_MS;
  return rows.filter((r) => {
    const t = new Date(r.created_at).getTime();
    return !Number.isNaN(t) && t >= cutoff;
  });
}

export function unresolvedEvents(events: SystemEvent[]): SystemEvent[] {
  return events.filter((e) => !e.resolved_at);
}

export function eventCountsByKind(events: SystemEvent[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const e of events) out[e.kind] = (out[e.kind] ?? 0) + 1;
  return out;
}

// ── Alerts (Deliverable 1) ───────────────────────────────────────
export interface PlatformAlert {
  id: string;
  severity: "warning" | "critical" | "info";
  message: string;
  href: string;
  count: number;
}

/**
 * Actionable alerts for the dashboard banner. Returns an EMPTY array when
 * nothing needs attention — the banner is then not rendered at all.
 */
export function buildAlerts(input: {
  tenants: Tenant[];
  systemEvents: SystemEvent[];
  now?: Date;
}): PlatformAlert[] {
  const now = input.now ?? new Date();
  const alerts: PlatformAlert[] = [];

  const endingSoon = trialsEndingSoon(input.tenants, 7, now);
  if (endingSoon.length > 0) {
    alerts.push({
      id: "trials-ending",
      severity: "warning",
      message: `${endingSoon.length} trial${endingSoon.length === 1 ? "" : "s"} ending within 7 days`,
      href: "/platform-admin/companies?status=trial",
      count: endingSoon.length,
    });
  }

  const suspended = input.tenants.filter((t) => t.status === "suspended");
  if (suspended.length > 0) {
    alerts.push({
      id: "suspended",
      severity: "critical",
      message: `${suspended.length} suspended compan${suspended.length === 1 ? "y" : "ies"}`,
      href: "/platform-admin/companies?status=suspended",
      count: suspended.length,
    });
  }

  const recentFailures = unresolvedEvents(withinDays(input.systemEvents, 1, now)).filter((e) =>
    e.kind.endsWith("_failed")
  );
  if (recentFailures.length > 0) {
    alerts.push({
      id: "failures-24h",
      severity: "critical",
      message: `${recentFailures.length} failed deliver${recentFailures.length === 1 ? "y" : "ies"} in the last 24h`,
      href: "/platform-admin/events",
      count: recentFailures.length,
    });
  }
  return alerts;
}

// ── Feature entitlement resolution (Deliverable 5) ───────────────
/**
 * Is `featureKey` enabled for a tenant?
 *
 * Precedence, most specific first:
 *   1. explicit per-tenant entitlement
 *   2. per-tenant flag override
 *   3. plan-level entitlement for the tenant's plan (Deliverable 3)
 *   4. global flag
 *   5. otherwise disabled
 *
 * `planId`/`planEntitlements` are optional so existing callers keep the old
 * four-argument behaviour unchanged.
 */
export function isFeatureEnabled(
  featureKey: string,
  tenantId: string,
  flags: FeatureFlag[],
  entitlements: FeatureEntitlement[] = [],
  planId?: string | null,
  planEntitlements: PlanEntitlement[] = []
): boolean {
  const entitlement = entitlements.find(
    (e) => e.tenant_id === tenantId && e.feature_key === featureKey
  );
  if (entitlement) return entitlement.enabled;

  const flag = flags.find((f) => f.key === featureKey);
  if (flag?.enabled_tenant_ids.includes(tenantId)) return true;

  if (planId) {
    const planRule = planEntitlements.find(
      (e) => e.plan_id === planId && e.feature_key === featureKey
    );
    if (planRule) return planRule.enabled;
  }

  if (!flag) return false;
  return flag.enabled_globally;
}

/** Numeric limit for a feature, or null when unlimited/unset. */
export function featureLimit(
  featureKey: string,
  tenantId: string,
  entitlements: FeatureEntitlement[]
): number | null {
  const e = entitlements.find((x) => x.tenant_id === tenantId && x.feature_key === featureKey);
  return e?.limit_value ?? null;
}

// ── Support sessions (Deliverable 8) ─────────────────────────────
/** Milliseconds until a support session expires; 0 once expired/ended. */
export function supportSessionRemainingMs(
  session: SupportSession,
  now: Date = new Date()
): number {
  if (session.ended_at) return 0;
  const expires = new Date(session.expires_at).getTime();
  if (Number.isNaN(expires)) return 0;
  return Math.max(0, expires - now.getTime());
}

export function formatCountdown(ms: number): string {
  if (ms <= 0) return "expired";
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}m ${String(s).padStart(2, "0")}s`;
}

export function activeSupportSessions(
  sessions: SupportSession[],
  now: Date = new Date()
): SupportSession[] {
  return sessions.filter((s) => supportSessionRemainingMs(s, now) > 0);
}

/** Clamp a requested duration to the platform maximum (§26). */
export function clampSupportMinutes(requested: number): number {
  if (!Number.isFinite(requested) || requested <= 0) return SUPPORT_SESSION_MAX_MINUTES;
  return Math.min(Math.floor(requested), SUPPORT_SESSION_MAX_MINUTES);
}

// ── CSV export (Deliverables 2 & 6) ──────────────────────────────
/**
 * Escape one CSV cell.
 *
 * Also neutralises spreadsheet formula injection: a value starting with
 * = + - @ or a control char is prefixed with a single quote so Excel/Sheets
 * treat it as text rather than executing it.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => unknown;
}

/** Build a CSV document from typed columns. Header row is always emitted. */
export function buildCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const head = columns.map((c) => csvCell(c.header)).join(",");
  const body = rows.map((r) => columns.map((c) => csvCell(c.value(r))).join(","));
  return [head, ...body].join("\r\n");
}

/** Timestamped download filename, e.g. `companies-2026-07-27.csv`. */
export function csvFilename(prefix: string, now: Date = new Date()): string {
  const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return `${prefix}-${stamp}.csv`;
}

// ── Audit helpers (Deliverable 6) ────────────────────────────────
/** Free-text search across an audit entry, including its metadata. */
export function auditMatchesSearch(entry: AuditLogEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [
    entry.action,
    entry.actor_role,
    entry.entity_type,
    entry.entity_id,
    entry.actor_user_id,
    entry.tenant_id,
    entry.ip_address,
    entry.user_agent,
    entry.metadata ? JSON.stringify(entry.metadata) : "",
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

/** Simple 1-based pagination over an already-filtered list. */
export function paginate<T>(rows: T[], page: number, perPage: number): {
  items: T[];
  page: number;
  totalPages: number;
  total: number;
} {
  const total = rows.length;
  const size = Math.max(1, Math.floor(perPage));
  const totalPages = Math.max(1, Math.ceil(total / size));
  const requested = Number.isFinite(page) ? Math.floor(page) : 1;
  const safePage = Math.min(Math.max(1, requested), totalPages);
  const start = (safePage - 1) * size;
  return { items: rows.slice(start, start + size), page: safePage, totalPages, total };
}
