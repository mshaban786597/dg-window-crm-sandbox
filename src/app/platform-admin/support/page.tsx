"use client";

/**
 * Support & impersonation console (§26, admin panel Deliverable 8).
 *
 * Sessions are time-boxed to SUPPORT_SESSION_MAX_MINUTES and expire on their own
 * — the countdown here is a display of that stored expiry, not a second timer
 * that could disagree with it. Starting a session always requires a reason, and
 * every action taken inside the tenant is audited against the REAL platform
 * account with `impersonated_user_id` recorded separately (§4).
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LifeBuoy, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { StatCard } from "@/components/shared/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { usePlatformSettingsStore } from "@/lib/tenancy/platform-settings-store";
import {
  formatCountdown,
  supportSessionRemainingMs,
} from "@/lib/tenancy/platform-metrics";
import { isSupportSessionActive } from "@/lib/tenancy/audit";
import { SUPPORT_SESSION_MAX_MINUTES } from "@/lib/tenancy/types";
import type { SupportMode, SupportSession } from "@/lib/tenancy/types";
import { fmtDateTime } from "../_components/admin-ui";

const MODE_OPTIONS: { value: SupportMode; label: string }[] = [
  { value: "read_only", label: "Read-only" },
  { value: "impersonation", label: "Impersonation" },
];

export default function PlatformSupportPage() {
  const router = useRouter();
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const tenants = useTenancyStore((s) => s.tenants);
  const users = useTenancyStore((s) => s.users);
  const supportSessions = useTenancyStore((s) => s.supportSessions);
  const activeSupportSessionId = useTenancyStore((s) => s.activeSupportSessionId);
  const startSupport = useTenancyStore((s) => s.startSupport);
  const endSupport = useTenancyStore((s) => s.endSupport);
  const impersonationAllowed = usePlatformSettingsStore(
    (s) => s.settings.support_impersonation_allowed
  );

  const [tenantId, setTenantId] = useState("");
  const [mode, setMode] = useState<SupportMode>("read_only");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  /** Ticks once a second purely so the countdown re-renders. */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  const sorted = useMemo(
    () =>
      [...supportSessions].sort(
        (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
      ),
    [supportSessions]
  );

  const active = useMemo(() => sorted.filter((s) => isSupportSessionActive(s)), [sorted]);
  const history = useMemo(() => sorted.filter((s) => !isSupportSessionActive(s)), [sorted]);

  const tenantName = (id: string) => tenants.find((t) => t.id === id)?.name ?? id;
  const userLabel = (id: string) => {
    const u = users.find((x) => x.id === id);
    if (!u) return id;
    return `${u.first_name} ${u.last_name}`.trim() || u.email;
  };

  const begin = () => {
    if (!tenantId) {
      setError("Choose a company.");
      return;
    }
    if (reason.trim().length < 5) {
      setError("A reason of at least 5 characters is required.");
      return;
    }
    if (mode === "impersonation" && !impersonationAllowed) {
      setError("Impersonation is disabled in platform settings.");
      return;
    }
    const result = startSupport(tenantId, mode, reason.trim());
    if (!result.ok) {
      setError(result.reason ?? "Unable to start the support session.");
      return;
    }
    setError(null);
    setReason("");
    router.push("/app/dashboard");
  };

  if (!hasHydrated) {
    return <p className="text-sm text-muted-foreground">Loading support sessions…</p>;
  }

  const columns = (showCountdown: boolean) => [
    {
      key: "tenant",
      header: "Company",
      render: (s: SupportSession) => (
        <Link
          href={`/platform-admin/companies/${s.tenant_id}`}
          className="font-medium text-brand-blue hover:underline"
        >
          {tenantName(s.tenant_id)}
        </Link>
      ),
    },
    {
      key: "mode",
      header: "Mode",
      render: (s: SupportSession) => (
        <Badge variant={s.mode === "read_only" ? "outline" : "warning"}>
          {s.mode === "read_only" ? "Read-only" : "Impersonation"}
        </Badge>
      ),
    },
    {
      key: "admin",
      header: "Administrator",
      render: (s: SupportSession) => userLabel(s.platform_user_id),
    },
    { key: "reason", header: "Reason", render: (s: SupportSession) => s.reason || "—" },
    { key: "started", header: "Started", render: (s: SupportSession) => fmtDateTime(s.started_at) },
    showCountdown
      ? {
          key: "remaining",
          header: "Auto-expires in",
          render: (s: SupportSession) => (
            <span className="font-mono tabular-nums">
              {formatCountdown(supportSessionRemainingMs(s))}
            </span>
          ),
        }
      : {
          key: "ended",
          header: "Ended",
          render: (s: SupportSession) =>
            s.ended_at ? fmtDateTime(s.ended_at) : `Expired ${fmtDateTime(s.expires_at)}`,
        },
    {
      key: "actions",
      header: "",
      className: "w-32 text-right",
      render: (s: SupportSession) =>
        showCountdown && s.id === activeSupportSessionId ? (
          <Button variant="outline" size="sm" onClick={endSupport}>
            End session
          </Button>
        ) : null,
    },
  ];

  return (
    <div>
      <PageHeader
        title="Support & Impersonation"
        description={`Time-boxed access into a company workspace. Sessions expire automatically after ${SUPPORT_SESSION_MAX_MINUTES} minutes.`}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard title="Active sessions" value={active.length} icon={LifeBuoy} />
        <StatCard
          title="Impersonation"
          value={impersonationAllowed ? "Allowed" : "Disabled"}
          subtitle="Platform setting"
          icon={ShieldAlert}
        />
        <StatCard title="Session history" value={history.length} icon={LifeBuoy} />
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">Start a session</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-3">
          <SelectField
            label="Company"
            value={tenantId}
            options={[
              { value: "", label: tenants.length === 0 ? "No companies yet" : "Select a company…" },
              ...tenants.map((t) => ({ value: t.id, label: t.name })),
            ]}
            disabled={tenants.length === 0}
            onChange={setTenantId}
          />
          <SelectField
            label="Mode"
            value={mode}
            options={MODE_OPTIONS}
            onChange={(v) => setMode(v as SupportMode)}
          />
          <div className="space-y-1.5 lg:col-span-3">
            <Label htmlFor="support-reason">Reason (required, stored on the audit entry)</Label>
            <Textarea
              id="support-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Investigating missing quote totals (ticket #1420)"
            />
          </div>
          {error && <p className="text-xs text-red-600 lg:col-span-3">{error}</p>}
          <div className="lg:col-span-3">
            <Button onClick={begin} disabled={tenants.length === 0}>
              Start session
            </Button>
            {mode === "impersonation" && !impersonationAllowed && (
              <p className="mt-2 text-xs text-amber-700">
                Impersonation is currently disabled in platform settings.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Active sessions</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {active.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={LifeBuoy}
                title="No active support sessions"
                description="Nobody is currently inside a company workspace."
              />
            </div>
          ) : (
            <DataTable<SupportSession> data={active} columns={columns(true)} />
          )}
        </CardContent>
      </Card>

      <Card className="mt-6 overflow-hidden">
        <CardHeader>
          <CardTitle className="text-base">Session history</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {history.length === 0 ? (
            <div className="p-6">
              <EmptyState
                icon={LifeBuoy}
                title="No past sessions"
                description="Ended and expired sessions are listed here with their reason."
              />
            </div>
          ) : (
            <DataTable<SupportSession> data={history.slice(0, 50)} columns={columns(false)} />
          )}
        </CardContent>
      </Card>

      <p className="mt-4 text-xs text-muted-foreground">
        While a session is running, the tenant workspace shows a persistent support banner. Audit
        entries keep the platform account as the actor and record the impersonated user separately —
        history is never rewritten.
      </p>
    </div>
  );
}
