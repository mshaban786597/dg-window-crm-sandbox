"use client";

/**
 * Plans & Billing (§21, admin panel Deliverable 3).
 *
 * The plan catalogue is editable and persisted in the platform settings store.
 * Prices are INTEGER CENTS end to end — the input works in dollars purely for
 * human convenience and is converted with toCents/fromCents (§ lib/money.ts).
 * A plan is never deleted: archiving deactivates it so historical subscriptions
 * keep resolving to a real plan record.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Layers, Plus, ToggleRight } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatCents, fromCents, toCents } from "@/lib/money";
import { usePlatformSettingsStore } from "@/lib/tenancy/platform-settings-store";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { countByPlan } from "@/lib/tenancy/platform-metrics";
import type { SubscriptionPlan } from "@/lib/tenancy/types";

type PlanSlug = SubscriptionPlan["slug"];

const SLUG_OPTIONS: { value: PlanSlug; label: string }[] = [
  { value: "starter", label: "starter" },
  { value: "professional", label: "professional" },
  { value: "business", label: "business" },
  { value: "enterprise", label: "enterprise" },
];

interface PlanDraft {
  name: string;
  slug: PlanSlug;
  /** Dollars as typed. Empty string means custom/contact-sales pricing. */
  price: string;
  max_users: string;
  max_managers: string;
  storage_mb: string;
  api_access: boolean;
  audit_retention_days: string;
  sort_order: string;
  active: boolean;
}

const EMPTY_DRAFT: PlanDraft = {
  name: "",
  slug: "starter",
  price: "",
  max_users: "",
  max_managers: "",
  storage_mb: "",
  api_access: false,
  audit_retention_days: "90",
  sort_order: "0",
  active: true,
};

/** "" → null (unlimited / custom). Anything non-numeric is treated as unset. */
const numOrNull = (v: string): number | null => {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const limitLabel = (v: number | null): string => (v === null ? "Unlimited" : String(v));

export default function PlatformPlansPage() {
  const defaultPlanSlug = usePlatformSettingsStore((s) => s.settings.default_plan_slug);
  const plans = usePlatformSettingsStore((s) => s.plans);
  const featureFlags = usePlatformSettingsStore((s) => s.featureFlags);
  const planEntitlements = usePlatformSettingsStore((s) => s.planEntitlements);
  const createPlan = usePlatformSettingsStore((s) => s.createPlan);
  const updatePlan = usePlatformSettingsStore((s) => s.updatePlan);
  const archivePlan = usePlatformSettingsStore((s) => s.archivePlan);
  const setPlanEntitlement = usePlatformSettingsStore((s) => s.setPlanEntitlement);
  const clearPlanEntitlement = usePlatformSettingsStore((s) => s.clearPlanEntitlement);

  const tenants = useTenancyStore((s) => s.tenants);
  const logAudit = useTenancyStore((s) => s.logAudit);

  const [editing, setEditing] = useState<SubscriptionPlan | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(EMPTY_DRAFT);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<SubscriptionPlan | null>(null);
  const [entitlementPlanId, setEntitlementPlanId] = useState<string>("");

  const sorted = useMemo(
    () => [...plans].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name)),
    [plans]
  );

  const distribution = useMemo(
    () => countByPlan(tenants, plans).filter((r) => r.count > 0),
    [tenants, plans]
  );

  const tenantsOnPlan = (planId: string) => tenants.filter((t) => t.plan_id === planId).length;

  const openCreate = () => {
    setEditing(null);
    setDraft(EMPTY_DRAFT);
    setError(null);
    setOpen(true);
  };

  const openEdit = (p: SubscriptionPlan) => {
    setEditing(p);
    setDraft({
      name: p.name,
      slug: p.slug,
      price: p.price_cents === null ? "" : String(fromCents(p.price_cents)),
      max_users: p.max_users === null ? "" : String(p.max_users),
      max_managers: p.max_managers === null ? "" : String(p.max_managers),
      storage_mb: p.storage_mb === null ? "" : String(p.storage_mb),
      api_access: p.api_access,
      audit_retention_days: String(p.audit_retention_days),
      sort_order: String(p.sort_order),
      active: p.active,
    });
    setError(null);
    setOpen(true);
  };

  const save = () => {
    if (!draft.name.trim()) {
      setError("A plan name is required.");
      return;
    }
    const retention = Number(draft.audit_retention_days);
    if (!Number.isFinite(retention) || retention < 0) {
      setError("Audit retention must be a non-negative number of days.");
      return;
    }
    const payload = {
      name: draft.name.trim(),
      slug: draft.slug,
      price_cents: draft.price.trim() === "" ? null : toCents(draft.price),
      max_users: numOrNull(draft.max_users),
      max_managers: numOrNull(draft.max_managers),
      storage_mb: numOrNull(draft.storage_mb),
      api_access: draft.api_access,
      audit_retention_days: Math.round(retention),
      active: draft.active,
      sort_order: Math.round(Number(draft.sort_order) || 0),
    };

    if (editing) {
      updatePlan(editing.id, payload);
      logAudit({
        action: "subscription.changed",
        tenant_id: null,
        entity_type: "plan",
        entity_id: editing.id,
        metadata: { name: payload.name, price_cents: payload.price_cents },
      });
    } else {
      const created = createPlan(payload);
      logAudit({
        action: "subscription.changed",
        tenant_id: null,
        entity_type: "plan",
        entity_id: created.id,
        metadata: { created: true, name: payload.name, price_cents: payload.price_cents },
      });
    }
    setOpen(false);
  };

  const selectedPlan = plans.find((p) => p.id === entitlementPlanId);

  return (
    <div>
      <PageHeader
        title="Plans & Billing"
        description="Subscription tiers, pricing and the feature defaults each plan grants."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            New plan
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Layers className="h-4 w-4" />
            Subscription plans
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sorted.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No plans configured"
              description="Create a plan to start assigning companies to it."
            />
          ) : (
            <DataTable<SubscriptionPlan>
              data={sorted}
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
                {
                  key: "slug",
                  header: "Slug",
                  render: (p) => <code className="text-xs">{p.slug}</code>,
                },
                {
                  key: "price",
                  header: "Price",
                  render: (p) =>
                    p.price_cents === null ? (
                      <span className="text-muted-foreground">Custom</span>
                    ) : (
                      <span className="tabular-nums">{formatCents(p.price_cents)}/mo</span>
                    ),
                },
                { key: "companies", header: "Companies", render: (p) => tenantsOnPlan(p.id) },
                { key: "users", header: "Max users", render: (p) => limitLabel(p.max_users) },
                {
                  key: "managers",
                  header: "Max managers",
                  render: (p) => limitLabel(p.max_managers),
                },
                {
                  key: "storage",
                  header: "Storage",
                  render: (p) => (p.storage_mb === null ? "Unlimited" : `${p.storage_mb} MB`),
                },
                {
                  key: "api",
                  header: "API",
                  render: (p) => (
                    <Badge variant={p.api_access ? "success" : "secondary"}>
                      {p.api_access ? "Yes" : "No"}
                    </Badge>
                  ),
                },
                { key: "order", header: "Order", render: (p) => p.sort_order },
                {
                  key: "active",
                  header: "Status",
                  render: (p) => (
                    <Badge variant={p.active ? "success" : "secondary"}>
                      {p.active ? "Active" : "Archived"}
                    </Badge>
                  ),
                },
                {
                  key: "actions",
                  header: "",
                  className: "w-40 text-right",
                  render: (p) => (
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openEdit(p)}>
                        Edit
                      </Button>
                      {p.active ? (
                        <Button variant="ghost" size="sm" onClick={() => setArchiveTarget(p)}>
                          Archive
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => updatePlan(p.id, { active: true })}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                  ),
                },
              ]}
            />
          )}
        </CardContent>
      </Card>

      {/* ── Per-plan feature entitlements ─────────────────────── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ToggleRight className="h-4 w-4" />
            Plan feature entitlements
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-xs text-muted-foreground">
            Plan-level defaults apply to every company on the plan. A company-specific entitlement
            set on its detail page always wins over the value chosen here.
          </p>
          <div className="mb-4 max-w-xs">
            <SelectField
              label="Plan"
              value={entitlementPlanId}
              options={[
                { value: "", label: "Select a plan…" },
                ...sorted.map((p) => ({ value: p.id, label: p.name })),
              ]}
              onChange={setEntitlementPlanId}
            />
          </div>

          {!selectedPlan ? (
            <p className="text-sm text-muted-foreground">
              Choose a plan to edit the features it grants.
            </p>
          ) : featureFlags.length === 0 ? (
            <EmptyState
              icon={ToggleRight}
              title="No features defined"
              description="Define feature flags first under Platform → Feature Flags."
            />
          ) : (
            <div className="space-y-2">
              {featureFlags.map((f) => {
                const rule = planEntitlements.find(
                  (e) => e.plan_id === selectedPlan.id && e.feature_key === f.key
                );
                const on = rule?.enabled ?? f.enabled_globally;
                return (
                  <div
                    key={f.key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{f.key}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {rule
                          ? `Plan default: ${rule.enabled ? "on" : "off"}`
                          : `Inherits global default (${f.enabled_globally ? "on" : "off"})`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        className="w-28"
                        type="number"
                        min={0}
                        placeholder="Limit"
                        aria-label={`Limit for ${f.key}`}
                        value={rule?.limit_value ?? ""}
                        onChange={(e) =>
                          setPlanEntitlement(
                            selectedPlan.id,
                            f.key,
                            on,
                            e.target.value === "" ? null : Number(e.target.value)
                          )
                        }
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setPlanEntitlement(selectedPlan.id, f.key, !on, rule?.limit_value ?? null)
                        }
                      >
                        {on ? "Disable" : "Enable"}
                      </Button>
                      {rule && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => clearPlanEntitlement(selectedPlan.id, f.key)}
                        >
                          Reset
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Distribution ─────────────────────────────────────── */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Companies per plan</CardTitle>
        </CardHeader>
        <CardContent>
          {distribution.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No companies assigned to a plan"
              description="Assign a plan from a company's detail page to see the distribution."
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="plan" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" name="Companies" fill="#2563EB" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Per-company plan assignment lives on the{" "}
            <Link href="/platform-admin/companies" className="text-brand-blue hover:underline">
              company detail page
            </Link>
            .
          </p>
        </CardContent>
      </Card>

      {/* ── Create / edit dialog ─────────────────────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name}` : "New plan"}</DialogTitle>
            <DialogDescription>
              Leave the price empty for custom / contact-sales pricing — such plans contribute 0 to
              MRR and are reported separately rather than estimated.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="plan-name">Name</Label>
              <Input
                id="plan-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Professional"
              />
            </div>
            <SelectField
              label="Slug"
              value={draft.slug}
              options={SLUG_OPTIONS}
              onChange={(v) => setDraft({ ...draft, slug: v as PlanSlug })}
            />
            <div className="space-y-1.5">
              <Label htmlFor="plan-price">Monthly price (USD)</Label>
              <Input
                id="plan-price"
                type="number"
                min={0}
                step="0.01"
                value={draft.price}
                onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                placeholder="Custom"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-users">Max users (blank = unlimited)</Label>
              <Input
                id="plan-users"
                type="number"
                min={0}
                value={draft.max_users}
                onChange={(e) => setDraft({ ...draft, max_users: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-managers">Max managers (blank = unlimited)</Label>
              <Input
                id="plan-managers"
                type="number"
                min={0}
                value={draft.max_managers}
                onChange={(e) => setDraft({ ...draft, max_managers: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-storage">Storage MB (blank = unlimited)</Label>
              <Input
                id="plan-storage"
                type="number"
                min={0}
                value={draft.storage_mb}
                onChange={(e) => setDraft({ ...draft, storage_mb: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-retention">Audit retention (days)</Label>
              <Input
                id="plan-retention"
                type="number"
                min={0}
                value={draft.audit_retention_days}
                onChange={(e) => setDraft({ ...draft, audit_retention_days: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-order">Sort order</Label>
              <Input
                id="plan-order"
                type="number"
                value={draft.sort_order}
                onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={draft.api_access}
                onChange={(e) => setDraft({ ...draft, api_access: e.target.checked })}
              />
              API access
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={draft.active}
                onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
              />
              Active
            </label>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save}>{editing ? "Save changes" : "Create plan"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Archive confirmation ─────────────────────────────── */}
      <Dialog
        open={archiveTarget !== null}
        onOpenChange={(o) => {
          if (!o) setArchiveTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive {archiveTarget?.name}?</DialogTitle>
            <DialogDescription>
              The plan stops being offered to new companies. Nothing is deleted, and the{" "}
              {archiveTarget ? tenantsOnPlan(archiveTarget.id) : 0} company/companies already on it
              keep their subscription until it is changed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setArchiveTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!archiveTarget) return;
                archivePlan(archiveTarget.id);
                logAudit({
                  action: "subscription.changed",
                  tenant_id: null,
                  entity_type: "plan",
                  entity_id: archiveTarget.id,
                  metadata: { archived: true },
                });
                setArchiveTarget(null);
              }}
            >
              Archive plan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
