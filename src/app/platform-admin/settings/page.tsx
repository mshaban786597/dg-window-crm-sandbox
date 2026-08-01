"use client";

/**
 * Platform settings (§21, admin panel Deliverable 9).
 *
 * Every save records a `security.setting_changed` audit entry naming the keys
 * that changed — settings changes are never silent.
 *
 * HONESTY: the security block records INTENDED policy. The values actually
 * enforced live in lib/auth/policy.ts and run server-side; both are shown side
 * by side so a stored preference is never mistaken for an active control.
 */
import { useEffect, useMemo, useState } from "react";
import { Save, Settings2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { usePlatformSettingsStore } from "@/lib/tenancy/platform-settings-store";
import type { PlanSlug, PlatformSettings } from "@/lib/tenancy/platform-settings-store";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/policy";

const PLAN_SLUG_VALUES = ["starter", "professional", "business", "enterprise"] as const;

function isPlanSlug(value: string): value is PlanSlug {
  return (PLAN_SLUG_VALUES as readonly string[]).includes(value);
}

/**
 * Environment-derived values. These are BUILD-TIME constants — they are shown
 * read-only because changing them here could not affect the running app.
 */
const ENV_VIEW = {
  sandbox: process.env.NEXT_PUBLIC_SANDBOX_MODE === "true",
  integrations: process.env.NEXT_PUBLIC_ENABLE_EXTERNAL_INTEGRATIONS === "true",
  addressProvider: process.env.NEXT_PUBLIC_ADDRESS_PROVIDER || "",
  mapsKeyConfigured: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
  adminEmail: process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL || "",
};

function ReadOnlyRow({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">{label}</span>
        {value}
      </div>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
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
  const plans = usePlatformSettingsStore((s) => s.plans);
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

  const planOptions = useMemo(
    () => plans.filter((p) => p.active).map((p) => ({ value: p.slug, label: p.name })),
    [plans]
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
              label="Default plan for new registrations"
              value={draft.default_plan_slug}
              options={
                planOptions.length > 0
                  ? planOptions
                  : [{ value: draft.default_plan_slug, label: draft.default_plan_slug }]
              }
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

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Security policy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              These values record the intended policy. Enforcement happens server-side in
              <code className="mx-1">lib/auth/policy.ts</code>; the effective value is shown beside
              each field. Changing a number here does not weaken or strengthen the running check.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="password_min_length">
                  Minimum password length{" "}
                  <span className="font-normal text-muted-foreground">
                    (enforced: {MIN_PASSWORD_LENGTH})
                  </span>
                </Label>
                <Input
                  id="password_min_length"
                  type="number"
                  min={8}
                  max={128}
                  value={draft.password_min_length}
                  onChange={(e) =>
                    patch({ password_min_length: Number.parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="session_timeout_minutes">Session timeout (minutes)</Label>
                <Input
                  id="session_timeout_minutes"
                  type="number"
                  min={5}
                  max={1440}
                  value={draft.session_timeout_minutes}
                  onChange={(e) =>
                    patch({ session_timeout_minutes: Number.parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="max_login_attempts">
                  Max login attempts before rate-limit{" "}
                  <span className="font-normal text-muted-foreground">(enforced: 5 / 15 min)</span>
                </Label>
                <Input
                  id="max_login_attempts"
                  type="number"
                  min={1}
                  max={50}
                  value={draft.max_login_attempts}
                  onChange={(e) =>
                    patch({ max_login_attempts: Number.parseInt(e.target.value, 10) || 0 })
                  }
                />
              </div>
              <Toggle
                id="password_require_complexity"
                label="Require password complexity"
                description="Reject passwords that reuse the email or company name, or that appear in the common-password list."
                checked={draft.password_require_complexity}
                onChange={(v) => patch({ password_require_complexity: v })}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quota defaults for new companies</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="default_storage_mb">Storage (MB, blank = unlimited)</Label>
              <Input
                id="default_storage_mb"
                type="number"
                min={0}
                value={draft.default_storage_mb ?? ""}
                onChange={(e) =>
                  patch({
                    default_storage_mb:
                      e.target.value === "" ? null : Number.parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="default_max_users">Users (blank = unlimited)</Label>
              <Input
                id="default_max_users"
                type="number"
                min={0}
                value={draft.default_max_users ?? ""}
                onChange={(e) =>
                  patch({
                    default_max_users:
                      e.target.value === "" ? null : Number.parseInt(e.target.value, 10) || 0,
                  })
                }
              />
            </div>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              A plan&apos;s own limits always win over these defaults. Manage them under{" "}
              <Link href="/platform-admin/plans" className="text-brand-blue hover:underline">
                Plans &amp; Billing
              </Link>
              .
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Environment (read-only)</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <ReadOnlyRow
              label="Sandbox mode"
              value={
                <Badge variant={ENV_VIEW.sandbox ? "warning" : "success"}>
                  {ENV_VIEW.sandbox ? "On" : "Off"}
                </Badge>
              }
              hint="NEXT_PUBLIC_SANDBOX_MODE — set in .env.local, applied at build time."
            />
            <ReadOnlyRow
              label="External integrations"
              value={
                <Badge variant={ENV_VIEW.integrations ? "success" : "secondary"}>
                  {ENV_VIEW.integrations ? "Enabled" : "Disabled"}
                </Badge>
              }
              hint="NEXT_PUBLIC_ENABLE_EXTERNAL_INTEGRATIONS."
            />
            <ReadOnlyRow
              label="Address provider"
              value={
                <Badge variant={ENV_VIEW.addressProvider ? "outline" : "secondary"}>
                  {ENV_VIEW.addressProvider || "Manual entry"}
                </Badge>
              }
              hint="NEXT_PUBLIC_ADDRESS_PROVIDER — without a provider the address field falls back to manual entry."
            />
            <ReadOnlyRow
              label="Google Maps API key"
              value={
                <Badge variant={ENV_VIEW.mapsKeyConfigured ? "success" : "secondary"}>
                  {ENV_VIEW.mapsKeyConfigured ? "Configured" : "Not set"}
                </Badge>
              }
              hint="Only whether a key exists is shown — the value itself is never rendered."
            />
            <ReadOnlyRow
              label="Platform admin email"
              value={
                <span className="text-sm">
                  {ENV_VIEW.adminEmail || (
                    <span className="text-muted-foreground">Not exposed to the browser</span>
                  )}
                </span>
              }
              hint="The authoritative address is the server-only PLATFORM_ADMIN_EMAIL; the public hint variable is deliberately left blank."
            />
          </CardContent>
        </Card>
      </div>

      {changedKeys.length > 0 && (
        <p className="mt-4 text-xs text-muted-foreground">
          Unsaved changes: {changedKeys.join(", ")}
        </p>
      )}
    </div>
  );
}
