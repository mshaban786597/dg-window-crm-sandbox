"use client";

/**
 * Subscription plan catalogue + feature flag matrix (§21).
 *
 * Read-only in the sandbox: plans and flags are provisioned by migration in a
 * real deployment, so the console displays them rather than inventing edits.
 */
import { Layers, ToggleLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import {
  PLATFORM_FEATURE_FLAGS,
  SUBSCRIPTION_PLANS,
} from "@/lib/tenancy/platform-settings-store";
import type { FeatureFlag, SubscriptionPlan } from "@/lib/tenancy/types";

const limit = (v: number | null): string => (v === null ? "Unlimited" : String(v));

export function PlansPanel({ defaultPlanSlug }: { defaultPlanSlug?: string }) {
  const plans = [...SUBSCRIPTION_PLANS].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="h-4 w-4" />
          Subscription plans
        </CardTitle>
      </CardHeader>
      <CardContent>
        {plans.length === 0 ? (
          <EmptyState icon={Layers} title="No plans configured" />
        ) : (
          <DataTable<SubscriptionPlan>
            data={plans}
            columns={[
              {
                key: "name",
                header: "Plan",
                render: (p) => (
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {defaultPlanSlug === p.slug && <Badge variant="outline">Default</Badge>}
                  </div>
                ),
              },
              { key: "users", header: "Max users", render: (p) => limit(p.max_users) },
              { key: "managers", header: "Max managers", render: (p) => limit(p.max_managers) },
              {
                key: "storage",
                header: "Storage",
                render: (p) => (p.storage_mb === null ? "Unlimited" : `${p.storage_mb} MB`),
              },
              {
                key: "api",
                header: "API access",
                render: (p) => (
                  <Badge variant={p.api_access ? "success" : "secondary"}>
                    {p.api_access ? "Yes" : "No"}
                  </Badge>
                ),
              },
              {
                key: "retention",
                header: "Audit retention",
                render: (p) => `${p.audit_retention_days} days`,
              },
              {
                key: "active",
                header: "Status",
                render: (p) => (
                  <Badge variant={p.active ? "success" : "secondary"}>
                    {p.active ? "Active" : "Retired"}
                  </Badge>
                ),
              },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function FeatureFlagsPanel() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ToggleLeft className="h-4 w-4" />
          Feature flags
        </CardTitle>
      </CardHeader>
      <CardContent>
        {PLATFORM_FEATURE_FLAGS.length === 0 ? (
          <EmptyState icon={ToggleLeft} title="No feature flags defined" />
        ) : (
          <DataTable<FeatureFlag>
            data={PLATFORM_FEATURE_FLAGS}
            columns={[
              { key: "key", header: "Key", render: (f) => <code className="text-xs">{f.key}</code> },
              { key: "description", header: "Description", render: (f) => f.description ?? "—" },
              {
                key: "global",
                header: "Global",
                render: (f) => (
                  <Badge variant={f.enabled_globally ? "success" : "secondary"}>
                    {f.enabled_globally ? "Enabled" : "Disabled"}
                  </Badge>
                ),
              },
              {
                key: "overrides",
                header: "Tenant overrides",
                render: (f) =>
                  f.enabled_tenant_ids.length === 0 ? "—" : f.enabled_tenant_ids.length,
              },
            ]}
          />
        )}
      </CardContent>
    </Card>
  );
}
