"use client";

/**
 * Platform dashboard (§15, admin panel Deliverable 1).
 *
 * Every number below is computed from the stores. Nothing is seeded, estimated
 * or back-filled — an empty platform reports zeros, empty charts and no alerts.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  BarChart,
  Bar,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Building2,
  CheckCircle2,
  Clock,
  Ban,
  Users,
  MailWarning,
  AlertTriangle,
  BarChart3,
  DollarSign,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatCents } from "@/lib/money";
import { useCRMStoreRaw } from "@/lib/store/crm-store";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { usePlatformSettingsStore } from "@/lib/tenancy/platform-settings-store";
import {
  TENANT_STATUSES,
  TENANT_STATUS_LABELS,
  SYSTEM_EVENT_KIND_LABELS,
} from "@/lib/tenancy/types";
import type { Tenant, TenantStatus } from "@/lib/tenancy/types";
import {
  buildAlerts,
  computeMrr,
  countByPlan,
  distinctActiveUsers,
  mrrByMonth,
  newTenantsThisMonth,
  onboardingFunnel,
  onboardingPercent,
  registrationsByMonth,
  trialsEndingSoon,
  withinDays,
} from "@/lib/tenancy/platform-metrics";
import { fmtDate, fmtDateTime } from "./_components/admin-ui";

const CHART_EMPTY = "No data available yet";

const STATUS_COLORS: Record<TenantStatus, string> = {
  trial: "#60A5FA",
  active: "#2563EB",
  suspended: "#DC2626",
  cancelled: "#94A3B8",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...TENANT_STATUSES.map((s) => ({ value: s, label: TENANT_STATUS_LABELS[s] })),
];

/** Inclusive [from, to] filter on an ISO timestamp; blank bounds are open. */
function inRange(iso: string | undefined, from: string, to: string): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (from && t < new Date(`${from}T00:00:00`).getTime()) return false;
  if (to && t > new Date(`${to}T23:59:59.999`).getTime()) return false;
  return true;
}

/** "2026-08" → "Aug 2026". */
function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  if (Number.isNaN(date.getTime())) return key;
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

const ALERT_STYLE: Record<string, string> = {
  critical: "border-red-200 bg-red-50 text-red-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-blue-200 bg-blue-50 text-blue-900",
};

export default function PlatformDashboardPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");

  const tenants = useTenancyStore((s) => s.tenants);
  const users = useTenancyStore((s) => s.users);
  const memberships = useTenancyStore((s) => s.memberships);
  const systemEvents = useTenancyStore((s) => s.systemEvents);
  const auditLogs = useTenancyStore((s) => s.auditLogs);

  const plans = usePlatformSettingsStore((s) => s.plans);
  const subscriptions = usePlatformSettingsStore((s) => s.subscriptions);

  const notifications = useCRMStoreRaw((s) => s.notifications);

  const planOptions = useMemo(
    () => [
      { value: "all", label: "All plans" },
      { value: "none", label: "Unassigned" },
      ...plans.map((p) => ({ value: p.id, label: p.name })),
    ],
    [plans]
  );

  const filteredTenants = useMemo<Tenant[]>(() => {
    return tenants.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (plan === "none" && t.plan_id) return false;
      if (plan !== "all" && plan !== "none" && t.plan_id !== plan) return false;
      if ((from || to) && !inRange(t.created_at, from, to)) return false;
      return true;
    });
  }, [tenants, status, plan, from, to]);

  const tenantIds = useMemo(() => new Set(filteredTenants.map((t) => t.id)), [filteredTenants]);

  const scopedMemberships = useMemo(
    () => memberships.filter((m) => tenantIds.has(m.tenant_id)),
    [memberships, tenantIds]
  );

  const mrr = useMemo(
    () => computeMrr(filteredTenants, subscriptions, plans),
    [filteredTenants, subscriptions, plans]
  );

  const endingSoon = useMemo(() => trialsEndingSoon(filteredTenants, 7), [filteredTenants]);

  const totals = useMemo(() => {
    const byStatus = (s: TenantStatus) => filteredTenants.filter((t) => t.status === s).length;
    const dateFiltered = Boolean(from || to);

    return {
      tenants: filteredTenants.length,
      active: byStatus("active"),
      trial: byStatus("trial"),
      suspended: byStatus("suspended") + byStatus("cancelled"),
      users: distinctActiveUsers(scopedMemberships),
      newThisMonth: newTenantsThisMonth(filteredTenants),
      failedNotifications: notifications.filter(
        (n) =>
          n.status === "failed" &&
          (dateFiltered ? inRange(n.created_at, from, to) : withinDays([n], 30).length === 1)
      ).length,
      platformErrors: systemEvents.filter((e) =>
        dateFiltered ? inRange(e.created_at, from, to) : withinDays([e], 30).length === 1
      ).length,
    };
  }, [filteredTenants, scopedMemberships, notifications, systemEvents, from, to]);

  const registrationSeries = useMemo(
    () =>
      registrationsByMonth(filteredTenants).map((r) => ({
        month: monthLabel(r.month),
        tenants: r.count,
      })),
    [filteredTenants]
  );

  const statusSeries = useMemo(
    () =>
      TENANT_STATUSES.map((s) => ({
        status: TENANT_STATUS_LABELS[s],
        key: s,
        count: filteredTenants.filter((t) => t.status === s).length,
      })).filter((row) => row.count > 0),
    [filteredTenants]
  );

  const planSeries = useMemo(
    () => countByPlan(filteredTenants, plans).filter((r) => r.count > 0),
    [filteredTenants, plans]
  );

  const funnelSeries = useMemo(() => {
    const f = onboardingFunnel(filteredTenants);
    return [
      { stage: "Not started", count: f.not_started },
      { stage: "In progress", count: f.in_progress },
      { stage: "Completed", count: f.completed },
    ];
  }, [filteredTenants]);

  const revenueSeries = useMemo(
    () =>
      mrrByMonth(filteredTenants, subscriptions, plans)
        .map((r) => ({ month: monthLabel(r.month), mrr: r.mrr_cents / 100 }))
        // An all-zero series is not a trend — show the honest empty state instead.
        .filter((_, __, arr) => arr.some((x) => x.mrr > 0)),
    [filteredTenants, subscriptions, plans]
  );

  const alerts = useMemo(
    () => buildAlerts({ tenants: filteredTenants, systemEvents }),
    [filteredTenants, systemEvents]
  );

  const recentRegistrations = useMemo(
    () =>
      [...filteredTenants]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8)
        .map((t) => ({
          tenant: t,
          ownerEmail: users.find((u) => u.id === t.owner_user_id)?.email ?? "—",
          percent: onboardingPercent(t),
        })),
    [filteredTenants, users]
  );

  const recentAudit = useMemo(
    () =>
      [...auditLogs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8),
    [auditLogs]
  );

  const recentEvents = useMemo(
    () =>
      [...systemEvents]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 8),
    [systemEvents]
  );

  const userEmail = (id: string) => users.find((u) => u.id === id)?.email ?? id;
  const tenantName = (id: string | null | undefined) =>
    id ? (tenants.find((t) => t.id === id)?.name ?? id) : "Platform";

  const filtersActive = Boolean(from || to || status !== "all" || plan !== "all");
  const chartsHaveData = filteredTenants.length > 0;

  return (
    <div>
      <PageHeader
        title="Platform Dashboard"
        description="Aggregate health across every tenant on this deployment."
      />

      {/* Alerts banner — rendered only when something actually needs attention. */}
      {alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {alerts.map((a) => (
            <Link
              key={a.id}
              href={a.href}
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm font-medium transition-opacity hover:opacity-90 ${
                ALERT_STYLE[a.severity] ?? ALERT_STYLE.info
              }`}
            >
              <span className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {a.message}
              </span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
          ))}
        </div>
      )}

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className="space-y-1.5">
            <Label htmlFor="from">From</Label>
            <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="to">To</Label>
            <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <SelectField label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
          <SelectField label="Plan" value={plan} options={planOptions} onChange={setPlan} />
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              disabled={!filtersActive}
              onClick={() => {
                setFrom("");
                setTo("");
                setStatus("all");
                setPlan("all");
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Registered Companies" value={totals.tenants} icon={Building2} />
        <StatCard title="Active Companies" value={totals.active} icon={CheckCircle2} />
        <StatCard
          title="Companies in Trial"
          value={totals.trial}
          subtitle={
            endingSoon.length > 0
              ? `${endingSoon.length} ending within 7 days`
              : "None ending within 7 days"
          }
          icon={Clock}
          iconClassName={endingSoon.length > 0 ? "bg-amber-100 text-amber-600" : undefined}
        />
        <StatCard title="Suspended / Cancelled" value={totals.suspended} icon={Ban} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Platform Users"
          value={totals.users}
          subtitle="Distinct users with an active membership"
          icon={Users}
        />
        <StatCard
          title="MRR"
          value={formatCents(mrr.mrr_cents)}
          subtitle={
            mrr.custom_priced_tenants > 0
              ? `${mrr.paying_tenants} paying · ${mrr.custom_priced_tenants} custom-priced excluded`
              : `${mrr.paying_tenants} paying compan${mrr.paying_tenants === 1 ? "y" : "ies"}`
          }
          icon={DollarSign}
        />
        <StatCard
          title="Trial Pipeline"
          value={formatCents(mrr.trial_mrr_cents)}
          subtitle="Potential MRR from active trials"
          icon={Sparkles}
        />
        <StatCard title="New Companies This Month" value={totals.newThisMonth} icon={Building2} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Failed Notifications"
          value={totals.failedNotifications}
          subtitle={from || to ? "Within the selected range" : "Last 30 days"}
          icon={MailWarning}
          iconClassName={totals.failedNotifications > 0 ? "bg-red-100 text-red-600" : undefined}
        />
        <StatCard
          title="Platform System Errors"
          value={totals.platformErrors}
          subtitle={from || to ? "Within the selected range" : "Last 30 days"}
          icon={AlertTriangle}
          iconClassName={totals.platformErrors > 0 ? "bg-red-100 text-red-600" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Company Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            {registrationSeries.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title={CHART_EMPTY}
                description="Registrations will appear here once companies sign up."
              />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={registrationSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="tenants"
                    name="New companies"
                    stroke="#2563EB"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Companies by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusSeries.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title={CHART_EMPTY}
                description="Status distribution appears once at least one company exists."
              />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={statusSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Companies" radius={[4, 4, 0, 0]}>
                    {statusSeries.map((row) => (
                      <Cell key={row.key} fill={STATUS_COLORS[row.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Companies by Plan</CardTitle>
          </CardHeader>
          <CardContent>
            {planSeries.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title={CHART_EMPTY}
                description="Plan distribution appears once companies are assigned a plan."
              />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={planSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="plan" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Companies" fill="#2563EB" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Onboarding Funnel</CardTitle>
          </CardHeader>
          <CardContent>
            {!chartsHaveData ? (
              <EmptyState
                icon={BarChart3}
                title={CHART_EMPTY}
                description="The funnel fills in as companies work through onboarding."
              />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={funnelSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Companies" fill="#60A5FA" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">Revenue Trend (MRR by month)</CardTitle>
        </CardHeader>
        <CardContent>
          {revenueSeries.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title={`${formatCents(0)} recurring revenue`}
              description="No priced subscriptions yet. The trend appears once a company is on a paid plan."
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={revenueSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatCents(Math.round(v * 100))} />
                <Line
                  type="monotone"
                  dataKey="mrr"
                  name="MRR"
                  stroke="#2563EB"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest Registrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentRegistrations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No companies registered yet.</p>
            ) : (
              recentRegistrations.map((r) => (
                <Link
                  key={r.tenant.id}
                  href={`/platform-admin/companies/${r.tenant.id}`}
                  className="block rounded-lg border p-3 transition-colors hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{r.tenant.name}</p>
                    <Badge variant="outline">{r.percent}%</Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">{r.ownerEmail}</p>
                  <p className="text-xs text-muted-foreground">{fmtDate(r.tenant.created_at)}</p>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest Audit Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit activity recorded yet.</p>
            ) : (
              recentAudit.map((a) => (
                <div key={a.id} className="rounded-lg border p-3">
                  <p className="truncate text-sm font-semibold">{a.action}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {userEmail(a.actor_user_id)} · {tenantName(a.tenant_id)}
                  </p>
                  <p className="text-xs text-muted-foreground">{fmtDateTime(a.created_at)}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Latest System Events</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No system events recorded yet.</p>
            ) : (
              recentEvents.map((e) => (
                <div key={e.id} className="rounded-lg border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={e.resolved_at ? "secondary" : "danger"}>
                      {SYSTEM_EVENT_KIND_LABELS[e.kind] ?? e.kind}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{fmtDate(e.created_at)}</span>
                  </div>
                  <p className="mt-1 truncate text-sm">{e.message}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <p className="mt-6 text-xs text-muted-foreground">
        Local sandbox mode — figures are read directly from browser storage and are not a
        production data source.
      </p>
    </div>
  );
}
