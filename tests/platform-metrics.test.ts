import { describe, it, expect } from "vitest";
import {
  onboardingPercent,
  onboardingFunnel,
  trialsEndingSoon,
  daysUntilTrialEnd,
  effectiveSubscription,
  computeMrr,
  mrrByMonth,
  tenantStatusCounts,
  distinctActiveUsers,
  newTenantsThisMonth,
  registrationsByMonth,
  countByPlan,
  withinDays,
  unresolvedEvents,
  eventCountsByKind,
  buildAlerts,
  isFeatureEnabled,
  featureLimit,
  supportSessionRemainingMs,
  formatCountdown,
  activeSupportSessions,
  clampSupportMinutes,
  csvCell,
  buildCsv,
  csvFilename,
  auditMatchesSearch,
  paginate,
} from "@/lib/tenancy/platform-metrics";
import { formatCents } from "@/lib/money";
import type {
  AuditLogEntry,
  FeatureEntitlement,
  FeatureFlag,
  PlanEntitlement,
  SubscriptionPlan,
  SupportSession,
  SystemEvent,
  Tenant,
  TenantMembership,
  TenantSubscription,
} from "@/lib/tenancy/types";

const NOW = new Date("2026-07-15T12:00:00.000Z");
const iso = (d: Date) => d.toISOString();
const daysFromNow = (n: number) => iso(new Date(NOW.getTime() + n * 86_400_000));

const tenant = (over: Partial<Tenant> & { id: string }): Tenant => ({
  name: over.id,
  slug: over.id,
  status: "active",
  owner_user_id: "u1",
  timezone: "UTC",
  currency: "USD",
  onboarding_status: "completed",
  onboarding_completed_steps: [],
  created_at: iso(NOW),
  ...over,
});

const PLANS: SubscriptionPlan[] = [
  { id: "plan-starter", name: "Starter", slug: "starter", price_cents: 4900, max_users: 3, max_managers: 1, storage_mb: 1024, api_access: false, audit_retention_days: 30, active: true, sort_order: 1 },
  { id: "plan-pro", name: "Professional", slug: "professional", price_cents: 14900, max_users: 15, max_managers: 3, storage_mb: 10240, api_access: true, audit_retention_days: 90, active: true, sort_order: 2 },
  { id: "plan-ent", name: "Enterprise", slug: "enterprise", price_cents: null, max_users: null, max_managers: null, storage_mb: null, api_access: true, audit_retention_days: 730, active: true, sort_order: 4 },
];

// ── Onboarding ───────────────────────────────────────────────────
describe("onboarding % (Deliverable 1/2)", () => {
  it("is 0 with no steps and 100 with every step", () => {
    expect(onboardingPercent({ onboarding_completed_steps: [] })).toBe(0);
    expect(
      onboardingPercent({
        onboarding_completed_steps: [
          "company_profile", "services", "service_areas", "team", "lead_sources",
          "catalog", "notifications", "website_integration", "review",
        ],
      })
    ).toBe(100);
  });

  it("rounds partial progress and ignores unknown/duplicate steps", () => {
    // 3 of 9 steps → 33%
    expect(onboardingPercent({ onboarding_completed_steps: ["company_profile", "services", "team"] })).toBe(33);
    // duplicates and junk cannot push it over 100
    const junk = ["company_profile", "company_profile", "nope"] as unknown as Tenant["onboarding_completed_steps"];
    expect(onboardingPercent({ onboarding_completed_steps: junk })).toBe(11);
  });

  it("buckets tenants into the onboarding funnel", () => {
    const rows = [
      tenant({ id: "a", onboarding_status: "not_started" }),
      tenant({ id: "b", onboarding_status: "in_progress" }),
      tenant({ id: "c", onboarding_status: "completed" }),
      tenant({ id: "d", onboarding_status: "completed" }),
    ];
    expect(onboardingFunnel(rows)).toEqual({ not_started: 1, in_progress: 1, completed: 2 });
    expect(onboardingFunnel([])).toEqual({ not_started: 0, in_progress: 0, completed: 0 });
  });
});

// ── Trials ───────────────────────────────────────────────────────
describe("trial-ending-soon (Deliverable 1)", () => {
  const rows = [
    tenant({ id: "soon", status: "trial", trial_ends_at: daysFromNow(3) }),
    tenant({ id: "edge", status: "trial", trial_ends_at: daysFromNow(7) }),
    tenant({ id: "later", status: "trial", trial_ends_at: daysFromNow(20) }),
    tenant({ id: "lapsed", status: "trial", trial_ends_at: daysFromNow(-1) }),
    tenant({ id: "paid", status: "active", trial_ends_at: daysFromNow(2) }),
    tenant({ id: "notrial", status: "trial" }),
  ];

  it("returns only in-window, un-lapsed trials", () => {
    expect(trialsEndingSoon(rows, 7, NOW).map((t) => t.id)).toEqual(["soon", "edge"]);
  });

  it("ignores non-trial tenants even when a trial date exists", () => {
    expect(trialsEndingSoon(rows, 7, NOW).some((t) => t.id === "paid")).toBe(false);
  });

  it("computes whole days remaining, negative once lapsed", () => {
    expect(daysUntilTrialEnd(rows[0], NOW)).toBe(3);
    expect(daysUntilTrialEnd(rows[3], NOW)).toBeLessThan(0);
    expect(daysUntilTrialEnd(rows[5], NOW)).toBeNull();
  });

  it("is empty on an empty platform", () => {
    expect(trialsEndingSoon([], 7, NOW)).toEqual([]);
  });
});

// ── MRR ──────────────────────────────────────────────────────────
describe("MRR computation (Deliverable 1)", () => {
  it("is $0 on an empty platform — never fabricated", () => {
    const m = computeMrr([], [], PLANS);
    expect(m.mrr_cents).toBe(0);
    expect(m.paying_tenants).toBe(0);
    expect(formatCents(m.mrr_cents)).toBe("$0.00");
  });

  it("sums active subscriptions and reports trials separately", () => {
    const rows = [
      tenant({ id: "t1", status: "active", plan_id: "plan-pro" }),
      tenant({ id: "t2", status: "active", plan_id: "plan-starter" }),
      tenant({ id: "t3", status: "trial", plan_id: "plan-pro" }),
    ];
    const m = computeMrr(rows, [], PLANS);
    expect(m.mrr_cents).toBe(14900 + 4900); // trial excluded
    expect(m.trial_mrr_cents).toBe(14900);
    expect(m.paying_tenants).toBe(2);
  });

  it("excludes suspended/cancelled tenants and tenants with no plan", () => {
    const rows = [
      tenant({ id: "s", status: "suspended", plan_id: "plan-pro" }),
      tenant({ id: "c", status: "cancelled", plan_id: "plan-pro" }),
      tenant({ id: "n", status: "active" }), // no plan
    ];
    expect(computeMrr(rows, [], PLANS).mrr_cents).toBe(0);
  });

  it("counts custom-priced plans separately instead of guessing a value", () => {
    const rows = [tenant({ id: "e", status: "active", plan_id: "plan-ent" })];
    const m = computeMrr(rows, [], PLANS);
    expect(m.mrr_cents).toBe(0);
    expect(m.custom_priced_tenants).toBe(1);
  });

  it("prefers an explicit subscription over the tenant's plan_id", () => {
    const rows = [tenant({ id: "t1", status: "active", plan_id: "plan-starter" })];
    const subs: TenantSubscription[] = [
      { id: "s1", tenant_id: "t1", plan_id: "plan-pro", status: "active", started_at: iso(NOW) },
    ];
    const sub = effectiveSubscription(rows[0], subs);
    expect(sub?.plan_id).toBe("plan-pro");
    expect(sub?.derived).toBe(false);
    expect(computeMrr(rows, subs, PLANS).mrr_cents).toBe(14900);
  });

  it("marks a plan_id-derived subscription as derived", () => {
    const t = tenant({ id: "t9", status: "active", plan_id: "plan-starter" });
    const sub = effectiveSubscription(t, []);
    expect(sub?.derived).toBe(true);
    expect(sub?.status).toBe("active");
    expect(effectiveSubscription(tenant({ id: "none" }), [])).toBeUndefined();
  });

  it("ignores unknown plan ids rather than crashing", () => {
    const rows = [tenant({ id: "x", status: "active", plan_id: "plan-does-not-exist" })];
    expect(computeMrr(rows, [], PLANS).mrr_cents).toBe(0);
  });

  it("builds a month series that only counts subscriptions already started", () => {
    const rows = [
      tenant({ id: "old", status: "active", plan_id: "plan-starter", created_at: "2026-05-02T00:00:00.000Z" }),
      tenant({ id: "new", status: "active", plan_id: "plan-starter", created_at: "2026-07-02T00:00:00.000Z" }),
    ];
    const series = mrrByMonth(rows, [], PLANS, 3, NOW);
    expect(series).toHaveLength(3);
    expect(series[series.length - 1].month).toBe("2026-07");
    expect(series[0].mrr_cents).toBe(4900);  // May: only "old"
    expect(series[2].mrr_cents).toBe(9800);  // July: both
  });
});

// ── Counts ───────────────────────────────────────────────────────
describe("tenant + user counts (Deliverable 1)", () => {
  const rows = [
    tenant({ id: "a", status: "active" }),
    tenant({ id: "t", status: "trial" }),
    tenant({ id: "s", status: "suspended" }),
    tenant({ id: "c", status: "cancelled" }),
  ];

  it("counts by status", () => {
    expect(tenantStatusCounts(rows)).toEqual({ total: 4, trial: 1, active: 1, suspended: 1, cancelled: 1 });
    expect(tenantStatusCounts([])).toEqual({ total: 0, trial: 0, active: 0, suspended: 0, cancelled: 0 });
  });

  it("counts distinct users across active accepted memberships only", () => {
    const mk = (id: string, user: string, over: Partial<TenantMembership> = {}): TenantMembership => ({
      id, tenant_id: "a", user_id: user, role: "manager", active: true,
      invitation_status: "accepted", created_at: "", ...over,
    });
    const members = [
      mk("m1", "u1"),
      mk("m2", "u1"),                                    // same user, second tenant
      mk("m3", "u2"),
      mk("m4", "u3", { active: false }),                 // inactive
      mk("m5", "u4", { invitation_status: "pending" }),  // not accepted
    ];
    expect(distinctActiveUsers(members)).toBe(2);
    expect(distinctActiveUsers([])).toBe(0);
  });

  it("counts registrations this month and by month", () => {
    const rows2 = [
      tenant({ id: "j", created_at: "2026-07-03T00:00:00.000Z" }),
      tenant({ id: "j2", created_at: "2026-07-11T00:00:00.000Z" }),
      tenant({ id: "old", created_at: "2026-06-11T00:00:00.000Z" }),
    ];
    expect(newTenantsThisMonth(rows2, NOW)).toBe(2);
    const series = registrationsByMonth(rows2, 2, NOW);
    expect(series).toEqual([
      { month: "2026-06", count: 1 },
      { month: "2026-07", count: 2 },
    ]);
  });

  it("counts by plan and surfaces unassigned tenants", () => {
    const rows3 = [
      tenant({ id: "a", plan_id: "plan-pro" }),
      tenant({ id: "b", plan_id: "plan-pro" }),
      tenant({ id: "c" }),
    ];
    const counts = countByPlan(rows3, PLANS);
    expect(counts.find((c) => c.plan === "Professional")?.count).toBe(2);
    expect(counts.find((c) => c.plan === "Unassigned")?.count).toBe(1);
    // No unassigned bucket when every tenant has a plan.
    expect(countByPlan([tenant({ id: "z", plan_id: "plan-pro" })], PLANS).some((c) => c.plan === "Unassigned")).toBe(false);
  });
});

// ── Events + alerts ──────────────────────────────────────────────
describe("events and alerts (Deliverables 1 & 7)", () => {
  const ev = (id: string, kind: SystemEvent["kind"], ageDays: number, resolved = false): SystemEvent => ({
    id, kind, message: id, created_at: daysFromNow(-ageDays),
    ...(resolved ? { resolved_at: iso(NOW) } : {}),
  });

  it("filters by window and resolution state", () => {
    const rows = [ev("a", "email_failed", 0), ev("b", "email_failed", 40), ev("c", "security", 0, true)];
    expect(withinDays(rows, 30, NOW).map((r) => r.id)).toEqual(["a", "c"]);
    expect(unresolvedEvents(rows).map((r) => r.id)).toEqual(["a", "b"]);
    expect(eventCountsByKind(rows)).toEqual({ email_failed: 2, security: 1 });
  });

  it("returns NO alerts on a healthy/empty platform", () => {
    expect(buildAlerts({ tenants: [], systemEvents: [], now: NOW })).toEqual([]);
  });

  it("raises alerts for trials, suspensions and recent failures", () => {
    const alerts = buildAlerts({
      tenants: [
        tenant({ id: "t", status: "trial", trial_ends_at: daysFromNow(2) }),
        tenant({ id: "s", status: "suspended" }),
      ],
      systemEvents: [ev("f", "email_failed", 0)],
      now: NOW,
    });
    expect(alerts.map((a) => a.id).sort()).toEqual(["failures-24h", "suspended", "trials-ending"]);
    expect(alerts.every((a) => a.href.startsWith("/platform-admin"))).toBe(true);
    expect(alerts.find((a) => a.id === "suspended")?.severity).toBe("critical");
  });

  it("ignores resolved failures older than 24h", () => {
    const alerts = buildAlerts({ tenants: [], systemEvents: [ev("old", "job_failed", 5)], now: NOW });
    expect(alerts).toEqual([]);
  });
});

// ── Feature entitlements ─────────────────────────────────────────
describe("feature entitlement resolution (Deliverable 5)", () => {
  const flags: FeatureFlag[] = [
    { id: "f1", key: "ai_assistant", enabled_globally: false, enabled_tenant_ids: ["t-beta"] },
    { id: "f2", key: "website_lead_intake", enabled_globally: true, enabled_tenant_ids: [] },
  ];

  it("follows global flag when there is no override", () => {
    expect(isFeatureEnabled("website_lead_intake", "t1", flags)).toBe(true);
    expect(isFeatureEnabled("ai_assistant", "t1", flags)).toBe(false);
  });

  it("honours a per-tenant flag override", () => {
    expect(isFeatureEnabled("ai_assistant", "t-beta", flags)).toBe(true);
  });

  it("lets an explicit entitlement win over the flag, in both directions", () => {
    const ents: FeatureEntitlement[] = [
      { id: "e1", tenant_id: "t1", feature_key: "ai_assistant", enabled: true },
      { id: "e2", tenant_id: "t2", feature_key: "website_lead_intake", enabled: false },
    ];
    expect(isFeatureEnabled("ai_assistant", "t1", flags, ents)).toBe(true);
    expect(isFeatureEnabled("website_lead_intake", "t2", flags, ents)).toBe(false);
  });

  it("returns false for an unknown feature", () => {
    expect(isFeatureEnabled("nope", "t1", flags)).toBe(false);
  });

  // ── Plan-level defaults (Deliverable 3) ────────────────────────
  const planRules: PlanEntitlement[] = [
    { id: "p1", plan_id: "plan-pro", feature_key: "ai_assistant", enabled: true },
    { id: "p2", plan_id: "plan-pro", feature_key: "website_lead_intake", enabled: false },
  ];

  it("applies a plan default when the tenant has no rule of its own", () => {
    expect(isFeatureEnabled("ai_assistant", "t1", flags, [], "plan-pro", planRules)).toBe(true);
    expect(isFeatureEnabled("website_lead_intake", "t1", flags, [], "plan-pro", planRules)).toBe(
      false
    );
  });

  it("lets a tenant entitlement override the plan default", () => {
    const ents: FeatureEntitlement[] = [
      { id: "e1", tenant_id: "t1", feature_key: "ai_assistant", enabled: false },
    ];
    expect(isFeatureEnabled("ai_assistant", "t1", flags, ents, "plan-pro", planRules)).toBe(false);
  });

  it("lets a per-tenant flag override beat the plan default", () => {
    expect(isFeatureEnabled("ai_assistant", "t-beta", flags, [], "plan-none", planRules)).toBe(
      true
    );
  });

  it("ignores plan rules for a tenant on a different plan", () => {
    expect(isFeatureEnabled("ai_assistant", "t1", flags, [], "plan-starter", planRules)).toBe(
      false
    );
  });

  it("falls back to the global flag when the plan has no rule", () => {
    expect(isFeatureEnabled("website_lead_intake", "t1", flags, [], "plan-starter", planRules)).toBe(
      true
    );
  });

  it("reads a numeric limit, null when unset", () => {
    const ents: FeatureEntitlement[] = [
      { id: "e1", tenant_id: "t1", feature_key: "seats", enabled: true, limit_value: 25 },
    ];
    expect(featureLimit("seats", "t1", ents)).toBe(25);
    expect(featureLimit("seats", "t2", ents)).toBeNull();
  });
});

// ── Support sessions ─────────────────────────────────────────────
describe("support session expiry (Deliverable 8)", () => {
  const session = (over: Partial<SupportSession>): SupportSession => ({
    id: "s1", tenant_id: "t1", platform_user_id: "p1", mode: "read_only",
    reason: "ticket 42", started_at: iso(NOW), expires_at: daysFromNow(1), ...over,
  });

  it("counts down and reports zero once expired or ended", () => {
    expect(supportSessionRemainingMs(session({ expires_at: iso(new Date(NOW.getTime() + 90_000)) }), NOW)).toBe(90_000);
    expect(supportSessionRemainingMs(session({ expires_at: daysFromNow(-1) }), NOW)).toBe(0);
    expect(supportSessionRemainingMs(session({ ended_at: iso(NOW) }), NOW)).toBe(0);
  });

  it("formats a human countdown", () => {
    expect(formatCountdown(90_000)).toBe("1m 30s");
    expect(formatCountdown(0)).toBe("expired");
  });

  it("lists only live sessions", () => {
    const rows = [
      session({ id: "live", expires_at: iso(new Date(NOW.getTime() + 60_000)) }),
      session({ id: "dead", expires_at: daysFromNow(-1) }),
      session({ id: "ended", ended_at: iso(NOW) }),
    ];
    expect(activeSupportSessions(rows, NOW).map((s) => s.id)).toEqual(["live"]);
  });

  it("clamps a requested duration to the 60-minute maximum", () => {
    expect(clampSupportMinutes(30)).toBe(30);
    expect(clampSupportMinutes(600)).toBe(60);
    expect(clampSupportMinutes(0)).toBe(60);
    expect(clampSupportMinutes(Number.NaN)).toBe(60);
  });
});

// ── CSV ──────────────────────────────────────────────────────────
describe("CSV export builder (Deliverables 2 & 6)", () => {
  it("quotes commas, quotes and newlines", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("neutralises spreadsheet formula injection", () => {
    expect(csvCell("=cmd|'/c calc'!A1")).toMatch(/^'?"?'=/);
    expect(csvCell("+1")).toBe("'+1");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
  });

  it("emits a header row even with no data", () => {
    const csv = buildCsv<{ id: string }>([], [{ header: "ID", value: (r) => r.id }]);
    expect(csv).toBe("ID");
  });

  it("builds rows in column order with CRLF line endings", () => {
    const csv = buildCsv(
      [{ name: "Acme, Inc", seats: 3 }],
      [
        { header: "Company", value: (r) => r.name },
        { header: "Seats", value: (r) => r.seats },
      ]
    );
    expect(csv).toBe('Company,Seats\r\n"Acme, Inc",3');
  });

  it("stamps the filename with the date", () => {
    expect(csvFilename("companies", NOW)).toBe("companies-2026-07-15.csv");
  });
});

// ── Audit search + pagination ────────────────────────────────────
describe("audit search and pagination (Deliverable 6)", () => {
  const entry: AuditLogEntry = {
    id: "a1", tenant_id: "t1", actor_user_id: "u1", actor_role: "platform_super_admin",
    action: "tenant.suspended", entity_type: "tenant", entity_id: "t1",
    metadata: { reason: "non-payment" }, created_at: iso(NOW),
  };

  it("matches action, role and metadata, and is case-insensitive", () => {
    expect(auditMatchesSearch(entry, "suspend")).toBe(true);
    expect(auditMatchesSearch(entry, "NON-PAYMENT")).toBe(true);
    expect(auditMatchesSearch(entry, "super_admin")).toBe(true);
    expect(auditMatchesSearch(entry, "nothing-here")).toBe(false);
  });

  it("an empty query matches everything", () => {
    expect(auditMatchesSearch(entry, "   ")).toBe(true);
  });

  it("paginates and clamps out-of-range pages", () => {
    const rows = Array.from({ length: 25 }, (_, i) => i);
    const p1 = paginate(rows, 1, 10);
    expect(p1.items).toHaveLength(10);
    expect(p1.totalPages).toBe(3);
    expect(paginate(rows, 3, 10).items).toEqual([20, 21, 22, 23, 24]);
    expect(paginate(rows, 99, 10).page).toBe(3);   // clamped up
    expect(paginate(rows, -5, 10).page).toBe(1);   // clamped down
  });

  it("handles an empty list without dividing by zero", () => {
    const p = paginate([], 1, 25);
    expect(p).toEqual({ items: [], page: 1, totalPages: 1, total: 0 });
  });
});
