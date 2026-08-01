"use client";

/**
 * Feature flags (admin panel Deliverable 5).
 *
 * Global toggles plus per-company overrides. Every change is written to the
 * audit log with action `security.setting_changed`, because a flag change can
 * grant or remove functionality for a whole tenant.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { ToggleRight, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SelectField } from "@/components/ui/select-field";
import { usePlatformSettingsStore } from "@/lib/tenancy/platform-settings-store";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";

export default function PlatformFeaturesPage() {
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const tenants = useTenancyStore((s) => s.tenants);
  const logAudit = useTenancyStore((s) => s.logAudit);

  const featureFlags = usePlatformSettingsStore((s) => s.featureFlags);
  const entitlements = usePlatformSettingsStore((s) => s.entitlements);
  const toggleFlagGlobal = usePlatformSettingsStore((s) => s.toggleFlagGlobal);
  const setTenantFlagOverride = usePlatformSettingsStore((s) => s.setTenantFlagOverride);

  /** Which company the "add override" select is pointing at, per flag key. */
  const [pending, setPending] = useState<Record<string, string>>({});

  const tenantOptions = useMemo(
    () => [
      { value: "", label: tenants.length === 0 ? "No companies yet" : "Add a company override…" },
      ...tenants.map((t) => ({ value: t.id, label: t.name })),
    ],
    [tenants]
  );

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;

  const audit = (key: string, metadata: Record<string, string | number | boolean | null>) =>
    logAudit({
      action: "security.setting_changed",
      tenant_id: null,
      entity_type: "feature_flag",
      entity_id: key,
      metadata,
    });

  if (!hasHydrated) {
    return <p className="text-sm text-muted-foreground">Loading feature flags…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Feature Flags"
        description="Global feature switches and the companies that override them."
      />

      {featureFlags.length === 0 ? (
        <EmptyState
          icon={ToggleRight}
          title="No feature flags defined"
          description="Flags are provisioned with the platform; none are configured on this deployment."
        />
      ) : (
        <div className="space-y-4">
          {featureFlags.map((f) => {
            const entitlementOverrides = entitlements.filter((e) => e.feature_key === f.key);
            return (
              <Card key={f.key}>
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <CardTitle className="text-base">
                      <code className="text-sm">{f.key}</code>
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {f.description || "No description"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={f.enabled_globally ? "success" : "secondary"}>
                      {f.enabled_globally ? "Enabled globally" : "Disabled globally"}
                    </Badge>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        toggleFlagGlobal(f.key);
                        audit(f.key, { scope: "global", enabled: !f.enabled_globally });
                      }}
                    >
                      {f.enabled_globally ? "Disable globally" : "Enable globally"}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Company overrides
                  </p>
                  {f.enabled_tenant_ids.length === 0 ? (
                    <p className="mb-3 text-sm text-muted-foreground">
                      None — every company follows the global setting.
                    </p>
                  ) : (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {f.enabled_tenant_ids.map((id) => (
                        <span
                          key={id}
                          className="inline-flex items-center gap-1.5 rounded-md border bg-slate-50 px-2 py-1 text-xs"
                        >
                          <Link
                            href={`/platform-admin/companies/${id}`}
                            className="text-brand-blue hover:underline"
                          >
                            {tenantName(id)}
                          </Link>
                          <button
                            type="button"
                            aria-label={`Remove ${tenantName(id)} override`}
                            onClick={() => {
                              setTenantFlagOverride(f.key, id, false);
                              audit(f.key, { scope: "tenant", tenant_id: id, enabled: false });
                            }}
                          >
                            <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-end gap-2">
                    <div className="w-64">
                      <SelectField
                        aria-label={`Add override for ${f.key}`}
                        value={pending[f.key] ?? ""}
                        options={tenantOptions}
                        disabled={tenants.length === 0}
                        onChange={(v) => setPending({ ...pending, [f.key]: v })}
                      />
                    </div>
                    <Button
                      size="sm"
                      disabled={!pending[f.key]}
                      onClick={() => {
                        const id = pending[f.key];
                        if (!id) return;
                        setTenantFlagOverride(f.key, id, true);
                        audit(f.key, { scope: "tenant", tenant_id: id, enabled: true });
                        setPending({ ...pending, [f.key]: "" });
                      }}
                    >
                      Add override
                    </Button>
                  </div>

                  {entitlementOverrides.length > 0 && (
                    <p className="mt-3 text-xs text-muted-foreground">
                      {entitlementOverrides.length} company-level entitlement
                      {entitlementOverrides.length === 1 ? "" : "s"} also target this feature and
                      take precedence over the settings above.
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 text-xs text-muted-foreground">
        Resolution order: a company entitlement, then a company flag override, then the plan
        default, then the global switch. Flags are a product control, not a security boundary —
        access control stays with roles and row-level security.
      </p>
    </div>
  );
}
