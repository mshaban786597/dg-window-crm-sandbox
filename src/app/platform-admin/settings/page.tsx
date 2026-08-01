"use client";

/**
 * Platform settings (§21).
 *
 * Every save records a `security.setting_changed` audit entry naming the keys
 * that changed — settings changes are never silent.
 */
import { useEffect, useMemo, useState } from "react";
import { Save, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { FeatureFlagsPanel, PlansPanel } from "@/components/tenancy/plans-flags-panels";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import {
  SUBSCRIPTION_PLANS,
  usePlatformSettingsStore,
} from "@/lib/tenancy/platform-settings-store";
import type { PlanSlug, PlatformSettings } from "@/lib/tenancy/platform-settings-store";

const PLAN_OPTIONS = SUBSCRIPTION_PLANS.map((p) => ({ value: p.slug, label: p.name }));

const PLAN_SLUGS: PlanSlug[] = SUBSCRIPTION_PLANS.map((p) => p.slug);

function isPlanSlug(value: string): value is PlanSlug {
  return (PLAN_SLUGS as string[]).includes(value);
}

function Toggle({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 rounded-lg border p-3">
      <input
        id={id}
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-input"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

export default function PlatformSettingsPage() {
  const hasHydrated = usePlatformSettingsStore((s) => s._hasHydrated);
  const settings = usePlatformSettingsStore((s) => s.settings);
  const updateSettings = usePlatformSettingsStore((s) => s.updateSettings);
  const logAudit = useTenancyStore((s) => s.logAudit);

  const [draft, setDraft] = useState<PlatformSettings>(settings);
  const [saved, setSaved] = useState(false);

  // Adopt the persisted values once rehydration completes.
  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const changedKeys = useMemo(
    () =>
      (Object.keys(draft) as (keyof PlatformSettings)[]).filter(
        (k) => draft[k] !== settings[k]
      ),
    [draft, settings]
  );

  const patch = (next: Partial<PlatformSettings>) => {
    setSaved(false);
    setDraft((d) => ({ ...d, ...next }));
  };

  const save = () => {
    if (changedKeys.length === 0) return;
    updateSettings(draft);
    logAudit({
      action: "security.setting_changed",
      tenant_id: null,
      entity_type: "platform_settings",
      metadata: { keys: changedKeys.join(", "), count: changedKeys.length },
    });
    setSaved(true);
  };

  if (!hasHydrated) {
    return <p className="text-sm text-muted-foreground">Loading platform settings…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Platform Settings"
        description="Global configuration applied to every tenant on this deployment."
        actions={
          <Button onClick={save} disabled={changedKeys.length === 0}>
            <Save className="h-4 w-4" />
            Save changes
          </Button>
        }
      />

      {saved && changedKeys.length === 0 && (
        <div className="mb-6 rounded-lg border border-green-300 bg-green-50 px-4 py-2.5 text-sm text-green-800">
          Settings saved and recorded in the audit log.
        </div>
      )}

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4" />
              General
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="product_name">Product name</Label>
              <Input
                id="product_name"
                value={draft.product_name}
                onChange={(e) => patch({ product_name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="support_email">Support email</Label>
              <Input
                id="support_email"
                type="email"
                value={draft.support_email}
                onChange={(e) => patch({ support_email: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="trial_days">Trial duration (days)</Label>
              <Input
                id="trial_days"
                type="number"
                min={0}
                max={365}
                value={draft.trial_duration_days}
                onChange={(e) =>
                  patch({ trial_duration_days: Number.parseInt(e.target.value, 10) || 0 })
                }
              />
            </div>
            <SelectField
              label="Default plan"
              value={draft.default_plan_slug}
              options={PLAN_OPTIONS}
              onChange={(v) => {
                if (isPlanSlug(v)) patch({ default_plan_slug: v });
              }}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Access & security</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <Toggle
              id="registration_enabled"
              label="Registration enabled"
              description="Allow new companies to sign up for a workspace."
              checked={draft.registration_enabled}
              onChange={(v) => patch({ registration_enabled: v })}
            />
            <Toggle
              id="email_verification_required"
              label="Email verification required"
              description="New owners must verify their email before onboarding."
              checked={draft.email_verification_required}
              onChange={(v) => patch({ email_verification_required: v })}
            />
            <Toggle
              id="maintenance_mode"
              label="Maintenance mode"
              description="Block tenant workspaces while platform admins keep access."
              checked={draft.maintenance_mode}
              onChange={(v) => patch({ maintenance_mode: v })}
            />
            <Toggle
              id="support_impersonation_allowed"
              label="Support impersonation allowed"
              description="Global kill switch for platform admin impersonation sessions."
              checked={draft.support_impersonation_allowed}
              onChange={(v) => patch({ support_impersonation_allowed: v })}
            />
          </CardContent>
        </Card>

        <PlansPanel defaultPlanSlug={draft.default_plan_slug} />
        <FeatureFlagsPanel />
      </div>

      {changedKeys.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Unsaved changes: {changedKeys.join(", ")}
        </p>
      )}
    </div>
  );
}
