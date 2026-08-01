"use client";

/**
 * Platform dashboard (§15).
 *
 * Every number below is computed from the stores. Nothing is seeded, estimated
 * or back-filled — an empty platform reports zeros and empty charts.
 */
import { useMemo, useState } from "react";
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
  Inbox,
  FileText,
  Hammer,
  MailWarning,
  AlertTriangle,
  BarChart3,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { StatCard } from "@/components/shared/stat-card";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Button } from "@/components/ui/button";
import { useCRMStoreRaw } from "@/lib/store/crm-store";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { SUBSCRIPTION_PLANS, planById } from "@/lib/tenancy/platform-settings-store";
import { TENANT_STATUSES, TENANT_STATUS_LABELS } from "@/lib/tenancy/types";
import type { Tenant, TenantStatus } from "@/lib/tenancy/types";

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

const PLAN_OPTIONS = [
  { value: "all", label: "All plans" },
  { value: "none", label: "Unassigned" },
  ...SUBSCRIPTION_PLANS.map((p) => ({ value: p.id, label: p.name })),
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

function monthKey(iso: string): string {
  return iso.slice(0, 7); // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const date = new Date(Number(y), Number(m) - 1, 1);
  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

export default function PlatformDashboardPage() {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");

  const tenants = useTenancyStore((s) => s.tenants);
  const memberships = useTenancyStore((s) => s.memberships);
  const systemEvents = useTenancyStore((s) => s.systemEvents);

  const leads = useCRMStoreRaw((s) => s.leads);
  const quotes = useCRMStoreRaw((s) => s.quotes);
  const jobs = useCRMStoreRaw((s) => s.jobs);
  const notifications = useCRMStoreRaw((s) => s.notifications);

  const filteredTenants = useMemo<Tenant[]>(() => {
    return tenants.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (plan === "none" && t.plan_id) return false;
      if (plan !== "all" && plan !== "none" && planById(t.plan_id)?.id !== plan) return false;
      if ((from || to) && !inRange(t.created_at, from, to)) return false;
      return true;
    });
  }, [tenants, status, plan, from, to]);

  const tenantIds = useMemo(() => new Set(filteredTenants.map((t) => t.id)), [filteredTenants]);

  const totals = useMemo(() => {
    const byStatus = (s: TenantStatus) => filteredTenants.filter((t) => t.status === s).length;
    // Counts are filtered by the date range only when one is set.
    const dated = (rows: readonly { created_at: string }[]): number =>
      from || to ? rows.filter((r) => inRange(r.created_at, from, to)).length : rows.length;

    const userIds = new Set(
      memberships.filter((m) => tenantIds.has(m.tenant_id)).map((m) => m.user_id)
    );

    return {
      tenants: filteredTenants.length,
      active: byStatus("active"),
      trial: byStatus("trial"),
      suspended: byStatus("suspended"),
      users: userIds.size,
      leads: dated(leads),
      quotes: dated(quotes),
      jobs: dated(jobs),
      failedNotifications: notifications.filter(
        (n) => n.status === "failed" && (!from && !to ? true : inRange(n.created_at, from, to))
      ).length,
      platformErrors: systemEvents.filter((e) =>
        !from && !to ? true : inRange(e.created_at, from, to)
      ).length,
    };
  }, [filteredTenants, tenantIds, memberships, leads, quotes, jobs, notifications, systemEvents, from, to]);

  const registrationSeries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of filteredTenants) {
      const key = monthKey(t.created_at);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({ month: monthLabel(key), tenants: value }));
  }, [filteredTenants]);

  const statusSeries = useMemo(() => {
    return TENANT_STATUSES.map((s) => ({
      status: TENANT_STATUS_LABELS[s],
      key: s,
      count: filteredTenants.filter((t) => t.status === s).length,
    })).filter((row) => row.count > 0);
  }, [filteredTenants]);

  const filtersActive = Boolean(from || to || status !== "all" || plan !== "all");

  return (
    <div>
      <PageHeader
        title="Platform Dashboard"
        description="Aggregate health across every tenant on this deployment."
      />

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
          <SelectField
            label="Status"
            value={status}
            options={STATUS_OPTIONS}
            onChange={setStatus}
          />
          <SelectField label="Plan" value={plan} options={PLAN_OPTIONS} onChange={setPlan} />
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
        <StatCard title="Total Tenants" value={totals.tenants} icon={Building2} />
        <StatCard title="Active Tenants" value={totals.active} icon={CheckCircle2} />
        <StatCard title="Trial Tenants" value={totals.trial} icon={Clock} />
        <StatCard title="Suspended Tenants" value={totals.suspended} icon={Ban} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Total Users" value={totals.users} subtitle="Users with a membership" icon={Users} />
        <StatCard title="Leads Created" value={totals.leads} icon={Inbox} />
        <StatCard title="Quotes Created" value={totals.quotes} icon={FileText} />
        <StatCard title="Jobs Created" value={totals.jobs} icon={Hammer} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <StatCard
          title="Failed Notifications"
          value={totals.failedNotifications}
          subtitle="Delivery failures awaiting retry"
          icon={MailWarning}
          iconClassName={totals.failedNotifications > 0 ? "bg-red-100 text-red-600" : undefined}
        />
        <StatCard
          title="Platform Errors"
          value={totals.platformErrors}
          subtitle="System events recorded"
          icon={AlertTriangle}
          iconClassName={totals.platformErrors > 0 ? "bg-red-100 text-red-600" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tenant Registrations</CardTitle>
          </CardHeader>
          <CardContent>
            {registrationSeries.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title={CHART_EMPTY}
                description="Tenant registrations will appear here once companies sign up."
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
                    name="New tenants"
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
            <CardTitle className="text-base">Tenants by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusSeries.length === 0 ? (
              <EmptyState
                icon={BarChart3}
                title={CHART_EMPTY}
                description="Status distribution appears once at least one tenant exists."
              />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={statusSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="status" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Tenants" radius={[4, 4, 0, 0]}>
                    {statusSeries.map((row) => (
                      <Cell key={row.key} fill={STATUS_COLORS[row.key]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
