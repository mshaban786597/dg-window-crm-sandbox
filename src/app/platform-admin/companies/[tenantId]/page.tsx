"use client";

/**
 * Tenant detail (§17).
 *
 * Read-first view of one company for platform administrators. Two invariants
 * are visible in the UI itself:
 *   1. secrets are ALWAYS piped through maskSensitive()/maskSecret()
 *   2. audit entries keep the REAL platform actor, with the impersonated tenant
 *      user recorded separately — history is never rewritten (§4)
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Building2,
  Eye,
  KeyRound,
  ShieldAlert,
  UserCog,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { useTenantUsageLookup } from "@/lib/tenancy/platform-usage";
import { maskSecret, maskSensitive, isSupportSessionActive } from "@/lib/tenancy/audit";
import { planById, planLabel, usePlatformSettingsStore } from "@/lib/tenancy/platform-settings-store";
import {
  ONBOARDING_STEP_LABELS,
  TENANT_ROLE_LABELS,
  TENANT_STATUS_LABELS,
} from "@/lib/tenancy/types";
import type {
  AuditLogEntry,
  SupportSession,
  TenantMembership,
  TenantStatus,
} from "@/lib/tenancy/types";
import { useSettingsStore } from "@/lib/settings/settings-store";
import { formatDate, formatDateTime } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

const STATUS_VARIANT: Record<TenantStatus, BadgeVariant> = {
  trial: "warning",
  active: "success",
  suspended: "danger",
  cancelled: "secondary",
};

/**
 * Shape of the integration credential record surfaced to platform admins.
 * Values are optional because the sandbox never persists real secrets; anything
 * present is masked before render.
 */
interface IntegrationCredentialView {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  api_key?: string;
  client_secret?: string;
  webhook_token?: string;
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-0.5 text-sm text-foreground">{value}</div>
    </div>
  );
}

export default function PlatformTenantDetailPage() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId;
  const router = useRouter();

  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const tenants = useTenancyStore((s) => s.tenants);
  const users = useTenancyStore((s) => s.users);
  const memberships = useTenancyStore((s) => s.memberships);
  const invitations = useTenancyStore((s) => s.invitations);
  const auditLogs = useTenancyStore((s) => s.auditLogs);
  const supportSessions = useTenancyStore((s) => s.supportSessions);
  const startSupport = useTenancyStore((s) => s.startSupport);
  const impersonationAllowed = usePlatformSettingsStore(
    (s) => s.settings.support_impersonation_allowed
  );
  const integrations = useSettingsStore((s) => s.integrations);
  const usageFor = useTenantUsageLookup();

  const [supportOpen, setSupportOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tenant = tenants.find((t) => t.id === tenantId);

  const tenantMemberships = useMemo(
    () => memberships.filter((m) => m.tenant_id === tenantId),
    [memberships, tenantId]
  );

  const tenantAudit = useMemo(
    () =>
      auditLogs
        .filter((l) => l.tenant_id === tenantId)
        .slice()
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [auditLogs, tenantId]
  );

  const platformAccess = useMemo(
    () => tenantAudit.filter((l) => l.action.startsWith("platform.")),
    [tenantAudit]
  );

  const tenantSupportSessions = useMemo(
    () =>
      supportSessions
        .filter((s) => s.tenant_id === tenantId)
        .slice()
        .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()),
    [supportSessions, tenantId]
  );

  // Every credential is masked BEFORE it is handed to React (§4, §17).
  const maskedIntegrations = useMemo<IntegrationCredentialView[]>(
    () =>
      maskSensitive(
        integrations.map<IntegrationCredentialView>((i) => ({
          id: i.id,
          name: i.name,
          description: i.description,
          enabled: i.enabled,
        }))
      ),
    [integrations]
  );

  const userLabel = (userId: string | undefined): string => {
    if (!userId) return "—";
    const u = users.find((x) => x.id === userId);
    if (!u) return userId;
    const name = `${u.first_name} ${u.last_name}`.trim();
    return name ? `${name} (${u.email})` : u.email;
  };

  const managerLabel = (membership: TenantMembership): string => {
    if (!membership.manager_membership_id) return "—";
    const manager = tenantMemberships.find((m) => m.id === membership.manager_membership_id);
    if (!manager) return "—";
    return userLabel(manager.user_id);
  };

  const beginSupport = (mode: "read_only" | "impersonation") => {
    const trimmed = reason.trim();
    if (trimmed.length < 5) {
      setError("A reason of at least 5 characters is required.");
      return;
    }
    if (mode === "impersonation" && !confirmed) {
      setError("Please confirm you understand this session is recorded.");
      return;
    }
    const result = startSupport(tenantId, mode, trimmed);
    if (!result.ok) {
      setError(result.reason ?? "Unable to start the support session.");
      return;
    }
    setSupportOpen(false);
    setImpersonateOpen(false);
    setReason("");
    setConfirmed(false);
    setError(null);
    router.push("/app/dashboard");
  };

  if (!hasHydrated) {
    return <p className="text-sm text-muted-foreground">Loading tenant…</p>;
  }

  if (!tenant) {
    return (
      <div>
        <Link
          href="/platform-admin/companies"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-blue hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to companies
        </Link>
        <EmptyState
          icon={Building2}
          title="Tenant not found"
          description="This company no longer exists on the platform."
        />
      </div>
    );
  }

  const usage = usageFor(tenant.id);
  const plan = planById(tenant.plan_id);
  const activeSupport = tenantSupportSessions.find((s) => isSupportSessionActive(s));

  return (
    <div>
      <Link
        href="/platform-admin/companies"
        className="mb-4 inline-flex items-center gap-1.5 text-sm text-brand-blue hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to companies
      </Link>

      <PageHeader
        title={tenant.name}
        description={`${tenant.slug} · ${TENANT_STATUS_LABELS[tenant.status]} · ${planLabel(tenant.plan_id)}`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setReason("");
                setError(null);
                setSupportOpen(true);
              }}
            >
              <Eye className="h-4 w-4" />
              Open Read-Only Support View
            </Button>
            <Button
              onClick={() => {
                setReason("");
                setConfirmed(false);
                setError(null);
                setImpersonateOpen(true);
              }}
              disabled={!impersonationAllowed}
              title={
                impersonationAllowed
                  ? undefined
                  : "Impersonation is disabled in platform settings"
              }
            >
              <UserCog className="h-4 w-4" />
              Impersonate
            </Button>
          </>
        }
      />

      {activeSupport && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          A {activeSupport.mode === "read_only" ? "read-only" : "impersonation"} support session is
          currently active on this tenant (expires {formatDateTime(activeSupport.expires_at)}).
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
        </TabsList>

        {/* ── Overview ─────────────────────────────────────────── */}
        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Company profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Company" value={tenant.name} />
              <Field label="Slug" value={tenant.slug} />
              <Field
                label="Status"
                value={
                  <Badge variant={STATUS_VARIANT[tenant.status]}>
                    {TENANT_STATUS_LABELS[tenant.status]}
                  </Badge>
                }
              />
              <Field label="Owner" value={userLabel(tenant.owner_user_id)} />
              <Field label="Plan" value={planLabel(tenant.plan_id)} />
              <Field label="Timezone" value={tenant.timezone} />
              <Field label="Currency" value={tenant.currency} />
              <Field label="Country / State" value={`${tenant.country || "—"} / ${tenant.state || "—"}`} />
              <Field label="Phone" value={tenant.phone || "—"} />
              <Field label="Website" value={tenant.website || "—"} />
              <Field label="Created" value={formatDateTime(tenant.created_at)} />
              <Field
                label="Trial ends"
                value={tenant.trial_ends_at ? formatDate(tenant.trial_ends_at) : "—"}
              />
              <Field
                label="Suspended at"
                value={tenant.suspended_at ? formatDateTime(tenant.suspended_at) : "—"}
              />
              <Field label="Onboarding" value={tenant.onboarding_status.replace(/_/g, " ")} />
              <Field
                label="Completed steps"
                value={
                  tenant.onboarding_completed_steps.length === 0
                    ? "None"
                    : tenant.onboarding_completed_steps
                        .map((s) => ONBOARDING_STEP_LABELS[s])
                        .join(", ")
                }
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Users ────────────────────────────────────────────── */}
        <TabsContent value="users">
          {tenantMemberships.length === 0 ? (
            <EmptyState
              icon={UserCog}
              title="No users yet"
              description="This company has no memberships."
            />
          ) : (
            <DataTable<TenantMembership>
              data={tenantMemberships}
              columns={[
                {
                  key: "user",
                  header: "User",
                  render: (m) => {
                    const u = users.find((x) => x.id === m.user_id);
                    return (
                      <div>
                        <p className="font-medium">
                          {u ? `${u.first_name} ${u.last_name}`.trim() || u.email : m.user_id}
                        </p>
                        <p className="text-xs text-muted-foreground">{u?.email ?? "—"}</p>
                      </div>
                    );
                  },
                },
                { key: "role", header: "Role", render: (m) => TENANT_ROLE_LABELS[m.role] },
                { key: "manager", header: "Manager", render: (m) => managerLabel(m) },
                {
                  key: "active",
                  header: "Active",
                  render: (m) => (
                    <Badge variant={m.active ? "success" : "secondary"}>
                      {m.active ? "Active" : "Inactive"}
                    </Badge>
                  ),
                },
                {
                  key: "invitation",
                  header: "Invitation",
                  render: (m) => (
                    <Badge variant={m.invitation_status === "accepted" ? "outline" : "warning"}>
                      {m.invitation_status}
                    </Badge>
                  ),
                },
                {
                  key: "last_access",
                  header: "Last Access",
                  render: (m) => (m.last_accessed_at ? formatDateTime(m.last_accessed_at) : "—"),
                },
              ]}
            />
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            {invitations.filter((i) => i.tenant_id === tenantId && i.status === "pending").length}{" "}
            pending invitation(s). Invitation tokens are stored hashed and are never displayed.
          </p>
        </TabsContent>

        {/* ── Usage ────────────────────────────────────────────── */}
        <TabsContent value="usage">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Users", value: usage.users },
              { label: "Active users", value: usage.activeUsers },
              { label: "Pending invitations", value: usage.pendingInvitations },
              { label: "Leads", value: usage.leads },
              { label: "Quotes", value: usage.quotes },
              { label: "Jobs", value: usage.jobs },
            ].map((row) => (
              <Card key={row.label}>
                <CardContent className="p-5">
                  <p className="text-sm font-medium text-muted-foreground">{row.label}</p>
                  <p className="mt-1 text-2xl font-bold tracking-tight">{row.value}</p>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Last activity: {usage.lastActivity ? formatDateTime(usage.lastActivity) : "—"}.
            {!usage.crmAttributable &&
              " Lead/quote/job counts are reported as 0 because this tenant's workspace is not the one loaded in the local sandbox — no figure is estimated."}
          </p>
        </TabsContent>

        {/* ── Audit logs ───────────────────────────────────────── */}
        <TabsContent value="audit">
          {tenantAudit.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No audit entries yet"
              description="Actions taken inside this company will be recorded here."
            />
          ) : (
            <DataTable<AuditLogEntry>
              data={tenantAudit}
              columns={[
                {
                  key: "when",
                  header: "Timestamp",
                  render: (l) => formatDateTime(l.created_at),
                },
                {
                  key: "actor",
                  header: "Actor (real)",
                  render: (l) => (
                    <div>
                      <p>{userLabel(l.actor_user_id)}</p>
                      <p className="text-xs text-muted-foreground">{l.actor_role}</p>
                    </div>
                  ),
                },
                {
                  key: "impersonated",
                  header: "Acting as",
                  render: (l) =>
                    l.impersonated_user_id ? (
                      <Badge variant="warning">{userLabel(l.impersonated_user_id)}</Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    ),
                },
                { key: "action", header: "Action", render: (l) => l.action },
                {
                  key: "entity",
                  header: "Entity",
                  render: (l) =>
                    l.entity_type ? `${l.entity_type}${l.entity_id ? ` · ${l.entity_id}` : ""}` : "—",
                },
              ]}
            />
          )}
        </TabsContent>

        {/* ── Subscription ─────────────────────────────────────── */}
        <TabsContent value="subscription">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Subscription</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Plan" value={planLabel(tenant.plan_id)} />
              <Field label="Status" value={TENANT_STATUS_LABELS[tenant.status]} />
              <Field
                label="Trial ends"
                value={tenant.trial_ends_at ? formatDate(tenant.trial_ends_at) : "—"}
              />
              <Field
                label="Max users"
                value={plan ? (plan.max_users === null ? "Unlimited" : plan.max_users) : "—"}
              />
              <Field
                label="Max managers"
                value={plan ? (plan.max_managers === null ? "Unlimited" : plan.max_managers) : "—"}
              />
              <Field
                label="Storage"
                value={
                  plan ? (plan.storage_mb === null ? "Unlimited" : `${plan.storage_mb} MB`) : "—"
                }
              />
              <Field label="API access" value={plan ? (plan.api_access ? "Yes" : "No") : "—"} />
              <Field
                label="Audit retention"
                value={plan ? `${plan.audit_retention_days} days` : "—"}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Security ─────────────────────────────────────────── */}
        <TabsContent value="security">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Platform access to this tenant</CardTitle>
              </CardHeader>
              <CardContent>
                {platformAccess.length === 0 ? (
                  <EmptyState
                    icon={ShieldAlert}
                    title="No platform access recorded"
                    description="No platform administrator has entered this workspace."
                  />
                ) : (
                  <DataTable<AuditLogEntry>
                    data={platformAccess}
                    columns={[
                      { key: "when", header: "When", render: (l) => formatDateTime(l.created_at) },
                      {
                        key: "who",
                        header: "Platform administrator",
                        render: (l) => userLabel(l.actor_user_id),
                      },
                      { key: "action", header: "Action", render: (l) => l.action },
                      {
                        key: "acting_as",
                        header: "Acting as",
                        render: (l) =>
                          l.impersonated_user_id ? userLabel(l.impersonated_user_id) : "—",
                      },
                      {
                        key: "reason",
                        header: "Reason",
                        render: (l) => String(l.metadata?.reason ?? "—"),
                      },
                    ]}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Support sessions</CardTitle>
              </CardHeader>
              <CardContent>
                {tenantSupportSessions.length === 0 ? (
                  <EmptyState
                    icon={Eye}
                    title="No support sessions"
                    description="Read-only and impersonation sessions are listed here with their reason and expiry."
                  />
                ) : (
                  <DataTable<SupportSession>
                    data={tenantSupportSessions}
                    columns={[
                      {
                        key: "mode",
                        header: "Mode",
                        render: (s) => (
                          <Badge variant={s.mode === "read_only" ? "outline" : "warning"}>
                            {s.mode === "read_only" ? "Read-only" : "Impersonation"}
                          </Badge>
                        ),
                      },
                      {
                        key: "admin",
                        header: "Administrator",
                        render: (s) => userLabel(s.platform_user_id),
                      },
                      { key: "reason", header: "Reason", render: (s) => s.reason || "—" },
                      {
                        key: "started",
                        header: "Started",
                        render: (s) => formatDateTime(s.started_at),
                      },
                      {
                        key: "expires",
                        header: "Expires",
                        render: (s) => formatDateTime(s.expires_at),
                      },
                      {
                        key: "state",
                        header: "State",
                        render: (s) => (
                          <Badge variant={isSupportSessionActive(s) ? "warning" : "secondary"}>
                            {s.ended_at
                              ? `Ended ${formatDateTime(s.ended_at)}`
                              : isSupportSessionActive(s)
                                ? "Active"
                                : "Expired"}
                          </Badge>
                        ),
                      },
                    ]}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" />
                  Integration credentials
                </CardTitle>
              </CardHeader>
              <CardContent>
                {maskedIntegrations.length === 0 ? (
                  <EmptyState
                    icon={KeyRound}
                    title="No integrations configured"
                    description="Credentials are always displayed masked."
                  />
                ) : (
                  <DataTable<IntegrationCredentialView>
                    data={maskedIntegrations}
                    columns={[
                      { key: "name", header: "Integration", render: (i) => i.name },
                      {
                        key: "enabled",
                        header: "Enabled",
                        render: (i) => (
                          <Badge variant={i.enabled ? "success" : "secondary"}>
                            {i.enabled ? "Enabled" : "Disabled"}
                          </Badge>
                        ),
                      },
                      {
                        key: "api_key",
                        header: "API key",
                        render: (i) => maskSecret(i.api_key) || "Not configured",
                      },
                      {
                        key: "client_secret",
                        header: "Client secret",
                        render: (i) => maskSecret(i.client_secret) || "Not configured",
                      },
                      {
                        key: "webhook_token",
                        header: "Webhook token",
                        render: (i) => maskSecret(i.webhook_token) || "Not configured",
                      },
                    ]}
                  />
                )}
                <p className="mt-3 text-xs text-muted-foreground">
                  Secrets are passed through maskSensitive() and maskSecret() before rendering —
                  plaintext credentials are never sent to the platform console.
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Read-only support view */}
      <Dialog
        open={supportOpen}
        onOpenChange={(open) => {
          setSupportOpen(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open read-only support view</DialogTitle>
            <DialogDescription>
              You will enter {tenant.name} as Platform Support. Writes are blocked, a banner stays
              visible for the whole session, and every action is audited against your platform
              account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ro-reason">Reason</Label>
            <Textarea
              id="ro-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Verifying reported quote totals (ticket #1420)"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => beginSupport("read_only")}>Open support view</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Impersonation — reason (min 5 chars) AND explicit confirmation */}
      <Dialog
        open={impersonateOpen}
        onOpenChange={(open) => {
          setImpersonateOpen(open);
          if (!open) setError(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Impersonate a user in {tenant.name}</DialogTitle>
            <DialogDescription>
              Impersonation grants write access inside this company. The audit trail keeps YOU as
              the actor and records the impersonated user separately. The session expires
              automatically.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="imp-reason">Administrative reason (required)</Label>
              <Textarea
                id="imp-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Reproducing failed job assignment reported in ticket #1420"
              />
            </div>
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 rounded border-input"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              <span>
                I confirm this impersonation is necessary, time-boxed, and that every action will be
                recorded against my platform account.
              </span>
            </label>
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImpersonateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reason.trim().length < 5 || !confirmed}
              onClick={() => beginSupport("impersonation")}
            >
              Start impersonation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
