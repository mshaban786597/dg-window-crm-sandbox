"use client";

/**
 * Platform-wide settings, subscription plans and feature flags (§21).
 *
 * ⚠️  NOT A SECURITY BOUNDARY — same caveat as `tenancy-store.ts`. This is the
 * non-production sandbox representation of the `platform_settings`,
 * `subscription_plans` and `feature_flags` tables. Every write here is mirrored
 * by a `security.setting_changed` audit entry recorded by the caller.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  FeatureEntitlement,
  FeatureFlag,
  SubscriptionPlan,
  TenantSubscription,
} from "./types";

const newId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export type PlanSlug = SubscriptionPlan["slug"];

export interface PlatformSettings {
  /** Product name shown across the platform + tenant emails. */
  product_name: string;
  support_email: string;
  /** Self-service tenant registration open/closed (§5, §21). */
  registration_enabled: boolean;
  email_verification_required: boolean;
  /** Length of the trial granted to a newly registered tenant. */
  trial_duration_days: number;
  /** Blocks tenant workspaces while platform admins keep access (§21). */
  maintenance_mode: boolean;
  /** Global kill switch for platform support impersonation (§26). */
  support_impersonation_allowed: boolean;
  default_plan_slug: PlanSlug;
}

export const DEFAULT_PLATFORM_SETTINGS: PlatformSettings = {
  product_name: "DG Window CRM",
  support_email: "support@windowcrm.local",
  registration_enabled: true,
  email_verification_required: true,
  trial_duration_days: 14,
  maintenance_mode: false,
  support_impersonation_allowed: true,
  default_plan_slug: "starter",
};

/** Catalogue of sellable plans (§21). Read-only in the sandbox. */
export const SUBSCRIPTION_PLANS: SubscriptionPlan[] = [
  {
    id: "plan-starter",
    price_cents: 4900,
    name: "Starter",
    slug: "starter",
    max_users: 3,
    max_managers: 1,
    storage_mb: 1024,
    api_access: false,
    audit_retention_days: 30,
    active: true,
    sort_order: 1,
  },
  {
    id: "plan-professional",
    price_cents: 14900,
    name: "Professional",
    slug: "professional",
    max_users: 15,
    max_managers: 3,
    storage_mb: 10240,
    api_access: true,
    audit_retention_days: 90,
    active: true,
    sort_order: 2,
  },
  {
    id: "plan-business",
    price_cents: 39900,
    name: "Business",
    slug: "business",
    max_users: 50,
    max_managers: 10,
    storage_mb: 51200,
    api_access: true,
    audit_retention_days: 365,
    active: true,
    sort_order: 3,
  },
  {
    id: "plan-enterprise",
    price_cents: null,
    name: "Enterprise",
    slug: "enterprise",
    max_users: null,
    max_managers: null,
    storage_mb: null,
    api_access: true,
    audit_retention_days: 730,
    active: true,
    sort_order: 4,
  },
];

export function planById(planId: string | undefined | null): SubscriptionPlan | undefined {
  if (!planId) return undefined;
  return SUBSCRIPTION_PLANS.find((p) => p.id === planId || p.slug === planId);
}

export function planLabel(planId: string | undefined | null): string {
  return planById(planId)?.name ?? "Unassigned";
}

/** Platform feature flags (§21). Tenant overrides live in `enabled_tenant_ids`. */
export const PLATFORM_FEATURE_FLAGS: FeatureFlag[] = [
  {
    id: "flag-ai-assistant",
    key: "ai_assistant",
    description: "In-app AI assistant panel for tenant users.",
    enabled_globally: false,
    enabled_tenant_ids: [],
  },
  {
    id: "flag-website-intake",
    key: "website_lead_intake",
    description: "Public website lead intake endpoint for tenants.",
    enabled_globally: true,
    enabled_tenant_ids: [],
  },
  {
    id: "flag-advanced-reports",
    key: "advanced_reports",
    description: "Extended reporting and export tooling.",
    enabled_globally: false,
    enabled_tenant_ids: [],
  },
  {
    id: "flag-api-access",
    key: "api_access",
    description: "Tenant-scoped REST API keys (Professional plan and above).",
    enabled_globally: false,
    enabled_tenant_ids: [],
  },
];

interface PlatformSettingsState {
  _hasHydrated: boolean;
  settings: PlatformSettings;
  /** Editable plan catalogue, seeded from SUBSCRIPTION_PLANS (Deliverable 3). */
  plans: SubscriptionPlan[];
  /** Editable feature flags, seeded from PLATFORM_FEATURE_FLAGS (Deliverable 5). */
  featureFlags: FeatureFlag[];
  /** Explicit tenant billing rows. Absent rows fall back to `tenant.plan_id`. */
  subscriptions: TenantSubscription[];
  /** Per-tenant feature overrides (Deliverable 2/5). */
  entitlements: FeatureEntitlement[];

  setHasHydrated: (v: boolean) => void;
  updateSettings: (patch: Partial<PlatformSettings>) => void;
  resetSettings: () => void;

  // Plans
  createPlan: (plan: Omit<SubscriptionPlan, "id">) => SubscriptionPlan;
  updatePlan: (id: string, patch: Partial<SubscriptionPlan>) => void;
  archivePlan: (id: string) => void;

  // Feature flags
  toggleFlagGlobal: (key: string) => void;
  setTenantFlagOverride: (key: string, tenantId: string, enabled: boolean) => void;

  // Entitlements
  setEntitlement: (tenantId: string, featureKey: string, enabled: boolean, limit?: number | null) => void;
  clearEntitlement: (tenantId: string, featureKey: string) => void;

  // Subscriptions
  setTenantPlan: (tenantId: string, planId: string) => void;
  setSubscriptionStatus: (tenantId: string, status: TenantSubscription["status"]) => void;
}

export const usePlatformSettingsStore = create<PlatformSettingsState>()(
  persist(
    (set) => ({
      _hasHydrated: false,
      settings: DEFAULT_PLATFORM_SETTINGS,
      plans: SUBSCRIPTION_PLANS,
      featureFlags: PLATFORM_FEATURE_FLAGS,
      subscriptions: [],
      entitlements: [],

      setHasHydrated: (v) => set({ _hasHydrated: v }),
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      resetSettings: () => set({ settings: DEFAULT_PLATFORM_SETTINGS }),

      createPlan: (plan) => {
        const created: SubscriptionPlan = { ...plan, id: newId("plan") };
        set((s) => ({ plans: [...s.plans, created] }));
        return created;
      },
      updatePlan: (id, patch) =>
        set((s) => ({ plans: s.plans.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
      /** Archive = deactivate. Plans are never deleted, so historical
       *  subscriptions keep resolving to a real plan record. */
      archivePlan: (id) =>
        set((s) => ({ plans: s.plans.map((p) => (p.id === id ? { ...p, active: false } : p)) })),

      toggleFlagGlobal: (key) =>
        set((s) => ({
          featureFlags: s.featureFlags.map((f) =>
            f.key === key ? { ...f, enabled_globally: !f.enabled_globally } : f
          ),
        })),
      setTenantFlagOverride: (key, tenantId, enabled) =>
        set((s) => ({
          featureFlags: s.featureFlags.map((f) => {
            if (f.key !== key) return f;
            const ids = new Set(f.enabled_tenant_ids);
            if (enabled) ids.add(tenantId);
            else ids.delete(tenantId);
            return { ...f, enabled_tenant_ids: [...ids] };
          }),
        })),

      setEntitlement: (tenantId, featureKey, enabled, limit = null) =>
        set((s) => {
          const existing = s.entitlements.find(
            (e) => e.tenant_id === tenantId && e.feature_key === featureKey
          );
          if (existing) {
            return {
              entitlements: s.entitlements.map((e) =>
                e === existing ? { ...e, enabled, limit_value: limit } : e
              ),
            };
          }
          return {
            entitlements: [
              ...s.entitlements,
              { id: newId("ent"), tenant_id: tenantId, feature_key: featureKey, enabled, limit_value: limit },
            ],
          };
        }),
      clearEntitlement: (tenantId, featureKey) =>
        set((s) => ({
          entitlements: s.entitlements.filter(
            (e) => !(e.tenant_id === tenantId && e.feature_key === featureKey)
          ),
        })),

      setTenantPlan: (tenantId, planId) =>
        set((s) => {
          const existing = s.subscriptions.find((x) => x.tenant_id === tenantId);
          if (existing) {
            return {
              subscriptions: s.subscriptions.map((x) =>
                x === existing ? { ...x, plan_id: planId } : x
              ),
            };
          }
          return {
            subscriptions: [
              ...s.subscriptions,
              {
                id: newId("sub"),
                tenant_id: tenantId,
                plan_id: planId,
                status: "active",
                started_at: new Date().toISOString(),
              },
            ],
          };
        }),
      setSubscriptionStatus: (tenantId, status) =>
        set((s) => ({
          subscriptions: s.subscriptions.map((x) =>
            x.tenant_id === tenantId ? { ...x, status } : x
          ),
        })),
    }),
    {
      name: "dg-window-crm-platform-settings-v1",
      version: 1,
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
      partialize: (s) => ({
        settings: s.settings,
        plans: s.plans,
        featureFlags: s.featureFlags,
        subscriptions: s.subscriptions,
        entitlements: s.entitlements,
      }),
    }
  )
);
