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
  Check,
  Circle,
  Eye,
  KeyRound,
  ShieldAlert,
  ToggleRight,
  UserCog,
  UserPlus,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
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
import { usePlatformSettingsStore } from "@/lib/tenancy/platform-settings-store";
import {
  effectiveSubscription,
  isFeatureEnabled,
  onboardingPercent,
} from "@/lib/tenancy/platform-metrics";
import { formatCents } from "@/lib/money";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_LABELS,
  TENANT_ROLES,
  TENANT_ROLE_LABELS,
  TENANT_STATUS_LABELS,
} from "@/lib/tenancy/types";
import type {
  AuditLogEntry,
  SupportSession,
  TenantMembership,
  TenantRole,
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
  const endSupport = useTenancyStore((s) => s.endSupport);
  const suspendTenant = useTenancyStore((s) => s.suspendTenant);
  const reactivateTenant = useTenancyStore((s) => s.reactivateTenant);
  const updateTenant = useTenancyStore((s) => s.updateTenant);
  const updateMembership = useTenancyStore((s) => s.updateMembership);
  const deactivateMembership = useTenancyStore((s) => s.deactivateMembership);
  const inviteMember = useTenancyStore((s) => s.inviteMember);
  const activeSupportSessionId = useTenancyStore((s) => s.activeSupportSessionId);
  const logAudit = useTenancyStore((s) => s.logAudit);
  const currentUserId = useTenancyStore((s) => s.currentUserId);

  const impersonationAllowed = usePlatformSettingsStore(
    (s) => s.settings.support_impersonation_allowed
  );
  const plans = usePlatformSettingsStore((s) => s.plans);
  const subscriptions = usePlatformSettingsStore((s) => s.subscriptions);
  const entitlements = usePlatformSettingsStore((s) => s.entitlements);
  const featureFlags = usePlatformSettingsStore((s) => s.featureFlags);
  const setTenantPlan = usePlatformSettingsStore((s) => s.setTenantPlan);
  const setSubscriptionStatus = usePlatformSettingsStore((s) => s.setSubscriptionStatus);
  const setEntitlement = usePlatformSettingsStore((s) => s.setEntitlement);
  const clearEntitlement = usePlatformSettingsStore((s) => s.clearEntitlement);
  const integrations = useSettingsStore((s) => s.integrations);
  const usageFor = useTenantUsageLookup();

  const [supportOpen, setSupportOpen] = useState(false);
  const [impersonateOpen, setImpersonateOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [planOpen, setPlanOpen] = useState(false);
  const [planDraft, setPlanDraft] = useState("");
  const [lifecycleOpen, setLifecycleOpen] = useState<"suspend" | "reactivate" | null>(null);
  const [lifecycleReason, setLifecycleReason] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TenantRole>("sales_representative");
  const [inviteResult, setInviteResult] = useState<string | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);

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

  /**
   * Member management runs through the EXISTING tenant-scoped store actions,
   * which require an active tenant session with owner/admin rights. A platform
   * admin therefore has to be inside an impersonation support session — no new
   * bypass is introduced here (hard rule 2).
   */
  const canManageMembers = useMemo(() => {
    const active = supportSessions.find(
      (x) => x.id === activeSupportSessionId && x.tenant_id === tenantId && isSupportSessionActive(x)
    );
    if (!active || active.mode !== "impersonation") return false;
    const mine = memberships.find((m) => m.tenant_id === tenantId && m.user_id === currentUserId);
    return Boolean(mine && ["tenant_owner", "tenant_admin"].includes(mine.role));
  }, [supportSessions, activeSupportSessionId, tenantId, memberships, currentUserId]);

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
  const subscription = effectiveSubscription(tenant, subscriptions);
  const plan = plans.find((pl) => pl.id === (subscription?.plan_id ?? tenant.plan_id));
  const planName = plan?.name ?? "Unassigned";
  const activeSupport = tenantSupportSessions.find((s) => isSupportSessionActive(s));
  const onboardingPct = onboardingPercent(tenant);
  const completedSteps = new Set(tenant.onboarding_completed_steps);

  const planOptions = [
    { value: "", label: "Unassigned" },
    ...plans
      .filter((pl) => pl.active || pl.id === plan?.id)
      .map((pl) => ({
        value: pl.id,
        label:
          pl.price_cents === null
            ? `${pl.name} — custom pricing`
            : `${pl.name} — ${formatCents(pl.price_cents)}/mo`,
      })),
  ];

  const applyPlanChange = () => {
    if (planDraft) setTenantPlan(tenant.id, planDraft);
    updateTenant(tenant.id, { plan_id: planDraft || undefined });
    logAudit({
      action: "tenant.plan_changed",
      tenant_id: tenant.id,
      entity_type: "tenant",
      entity_id: tenant.id,
      metadata: { plan_id: planDraft || "none" },
    });
    setPlanOpen(false);
  };

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
        description={`${tenant.slug} · ${TENANT_STATUS_LABELS[tenant.status]} · ${planName}`}
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
            {tenant.status === "suspended" ? (
              <Button
                variant="outline"
                onClick={() => {
                  setLifecycleReason("");
                  setLifecycleOpen("reactivate");
                }}
              >
                Reactivate
              </Button>
            ) : (
              <Button
                variant="destructive"
                onClick={() => {
                  setLifecycleReason("");
                  setLifecycleOpen("suspend");
                }}
              >
                Suspend
              </Button>
            )}
          </>
        }
      />

      {activeSupport && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <span>
            A {activeSupport.mode === "read_only" ? "read-only" : "impersonation"} support session is
            currently active on this tenant (expires {formatDateTime(activeSupport.expires_at)}).
          </span>
          {activeSupport.id === activeSupportSessionId && (
            <Button size="sm" variant="outline" onClick={endSupport}>
              End session
            </Button>
          )}
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList className="flex h-auto flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
          <TabsTrigger value="subscription">Subscription</TabsTrigger>
          <TabsTrigger value="features">Features</TabsTrigger>
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
              <Field label="Plan" value={planName} />
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
                label="Logo"
                value={
                  tenant.logo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={tenant.logo_url}
                      alt={`${tenant.name} logo`}
                      className="h-8 w-auto max-w-[140px] object-contain"
                    />
                  ) : (
                    "—"
                  )
                }
              />
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardHeader>
              <CardTitle className="text-base">Onboarding progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                  <div className="h-full bg-brand-blue" style={{ width: onboardingPct + "%" }} />
                </div>
                <span className="text-sm font-semibold tabular-nums">{onboardingPct}%</span>
              </div>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ONBOARDING_STEPS.map((step) => {
                  const done = completedSteps.has(step);
                  return (
                    <li key={step} className="flex items-center gap-2 text-sm">
                      {done ? (
                        <Check className="h-4 w-4 shrink-0 text-green-600" />
                      ) : (
                        <Circle className="h-4 w-4 shrink-0 text-slate-300" />
                      )}
                      <span className={done ? "" : "text-muted-foreground"}>
                        {ONBOARDING_STEP_LABELS[step]}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Users ────────────────────────────────────────────── */}
        <TabsContent value="users">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {canManageMembers
                ? "You are inside an impersonation session — member changes are audited against your platform account."
                : "Member changes require an active impersonation support session; start one from the header."}
            </p>
            <Button
              size="sm"
              disabled={!canManageMembers}
              onClick={() => {
                setInviteEmail("");
                setInviteResult(null);
                setMemberError(null);
                setInviteOpen(true);
              }}
            >
              <UserPlus className="mr-2 h-4 w-4" />
              Invite member
            </Button>
          </div>
          {memberError && <p className="mb-3 text-xs text-red-600">{memberError}</p>}
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
                {
                  key: "manage",
                  header: "Manage",
                  className: "w-64",
                  render: (m) => (
                    <div className="flex items-center gap-2">
                      <SelectField
                        aria-label={`Role for ${m.id}`}
                        value={m.role}
                        options={TENANT_ROLES.map((r) => ({
                          value: r,
                          label: TENANT_ROLE_LABELS[r],
                        }))}
                        disabled={!canManageMembers || m.role === "tenant_owner"}
                        onChange={(v) => {
                          const res = updateMembership(m.id, { role: v as TenantRole });
                          setMemberError(res.ok ? null : (res.reason ?? "Change rejected"));
                        }}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canManageMembers || !m.active || m.role === "tenant_owner"}
                        onClick={() => deactivateMembership(m.id)}
                      >
                        Deactivate
                      </Button>
                    </div>
                  ),
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
              data={tenantAudit.slice(0, 20)}
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
          {tenantAudit.length > 20 && (
            <p className="mt-3 text-xs text-muted-foreground">
              Showing the latest 20 of {tenantAudit.length} entries.{" "}
              <Link href="/platform-admin/audit" className="text-brand-blue hover:underline">
                Open the full audit log
              </Link>
              .
            </p>
          )}
        </TabsContent>

        {/* ── Subscription ─────────────────────────────────────── */}
        <TabsContent value="subscription">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3">
              <CardTitle className="text-base">Subscription</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setPlanDraft(plan?.id ?? "");
                  setPlanOpen(true);
                }}
              >
                Change plan
              </Button>
            </CardHeader>
            <CardContent className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Plan" value={planName} />
              <Field
                label="Monthly price"
                value={
                  !plan
                    ? "—"
                    : plan.price_cents === null
                      ? "Custom pricing"
                      : `${formatCents(plan.price_cents)}/mo`
                }
              />
              <Field
                label="Billing status"
                value={
                  subscription ? (
                    <Badge variant={subscription.status === "active" ? "success" : "warning"}>
                      {subscription.status.replace(/_/g, " ")}
                    </Badge>
                  ) : (
                    "No subscription"
                  )
                }
              />
              <Field
                label="Source"
                value={
                  subscription
                    ? subscription.derived
                      ? "Derived from the company's plan (no billing record yet)"
                      : "Explicit billing record"
                    : "—"
                }
              />
              <Field
                label="Period end"
                value={
                  subscriptions.find((x) => x.tenant_id === tenant.id)?.current_period_end
                    ? formatDate(
                        subscriptions.find((x) => x.tenant_id === tenant.id)!.current_period_end!
                      )
                    : "—"
                }
              />
              <Field label="Lifecycle status" value={TENANT_STATUS_LABELS[tenant.status]} />
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

          {subscriptions.some((x) => x.tenant_id === tenant.id) && (
            <Card className="mt-4">
              <CardHeader>
                <CardTitle className="text-base">Billing status</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {(["trialing", "active", "past_due", "cancelled"] as const).map((st) => (
                  <Button
                    key={st}
                    size="sm"
                    variant={subscription?.status === st ? "default" : "outline"}
                    onClick={() => setSubscriptionStatus(tenant.id, st)}
                  >
                    {st.replace(/_/g, " ")}
                  </Button>
                ))}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── Feature entitlements ─────────────────────────────── */}
        <TabsContent value="features">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ToggleRight className="h-4 w-4" />
                Feature entitlements
              </CardTitle>
            </CardHeader>
            <CardContent>
              {featureFlags.length === 0 ? (
                <EmptyState
                  icon={ToggleRight}
                  title="No features defined"
                  description="Feature flags are managed under Platform → Feature Flags."
                />
              ) : (
                <div className="space-y-2">
                  {featureFlags.map((f) => {
                    const override = entitlements.find(
                      (e) => e.tenant_id === tenant.id && e.feature_key === f.key
                    );
                    const enabled = isFeatureEnabled(f.key, tenant.id, featureFlags, entitlements);
                    return (
                      <div
                        key={f.key}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{f.key}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {f.description || "No description"} ·{" "}
                            {override
                              ? "company override"
                              : f.enabled_globally
                                ? "global default: on"
                                : "global default: off"}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant={enabled ? "success" : "secondary"}>
                            {enabled ? "Enabled" : "Disabled"}
                          </Badge>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEntitlement(tenant.id, f.key, !enabled)}
                          >
                            {enabled ? "Disable" : "Enable"}
                          </Button>
                          {override && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => clearEntitlement(tenant.id, f.key)}
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

      {/* Change plan. */}
      <Dialog open={planOpen} onOpenChange={setPlanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change plan for {tenant.name}</DialogTitle>
            <DialogDescription>
              The change is written to the company&apos;s subscription and recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <SelectField
            label="Plan"
            value={planDraft}
            options={planOptions}
            onChange={setPlanDraft}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>
              Cancel
            </Button>
            <Button onClick={applyPlanChange}>Save plan</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Suspend / reactivate — reason required on suspension. */}
      <Dialog
        open={lifecycleOpen !== null}
        onOpenChange={(open) => {
          if (!open) setLifecycleOpen(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {lifecycleOpen === "suspend" ? "Suspend" : "Reactivate"} {tenant.name}?
            </DialogTitle>
            <DialogDescription>
              {lifecycleOpen === "suspend"
                ? "Every user of this company immediately loses access. The reason is stored on the audit entry."
                : "Access is restored for all active members. The change is audited."}
            </DialogDescription>
          </DialogHeader>
          {lifecycleOpen === "suspend" && (
            <div className="space-y-1.5">
              <Label htmlFor="lifecycle-reason">Reason</Label>
              <Textarea
                id="lifecycle-reason"
                value={lifecycleReason}
                onChange={(e) => setLifecycleReason(e.target.value)}
                placeholder="e.g. Non-payment after 3 reminders (ticket #1420)"
              />
              {error && <p className="text-xs text-red-600">{error}</p>}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setLifecycleOpen(null)}>
              Cancel
            </Button>
            <Button
              variant={lifecycleOpen === "suspend" ? "destructive" : "default"}
              onClick={() => {
                if (lifecycleOpen === "suspend") {
                  if (lifecycleReason.trim().length < 5) {
                    setError("A reason of at least 5 characters is required.");
                    return;
                  }
                  suspendTenant(tenant.id, lifecycleReason.trim());
                } else {
                  reactivateTenant(tenant.id);
                }
                setError(null);
                setLifecycleOpen(null);
              }}
            >
              {lifecycleOpen === "suspend" ? "Suspend company" : "Reactivate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Invite a member (requires an active impersonation session). */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite a member to {tenant.name}</DialogTitle>
            <DialogDescription>
              Only the invitation token HASH is stored. The single-use link below is shown once and
              is never recoverable afterwards.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="name@company.com"
              />
            </div>
            <SelectField
              label="Role"
              value={inviteRole}
              options={TENANT_ROLES.filter((r) => r !== "tenant_owner").map((r) => ({
                value: r,
                label: TENANT_ROLE_LABELS[r],
              }))}
              onChange={(v) => setInviteRole(v as TenantRole)}
            />
            {inviteResult && (
              <p className="break-all rounded-lg bg-slate-100 p-3 text-xs">{inviteResult}</p>
            )}
            {memberError && <p className="text-xs text-red-600">{memberError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Close
            </Button>
            <Button
              onClick={() => {
                if (!/.+@.+\..+/.test(inviteEmail.trim())) {
                  setMemberError("Enter a valid email address.");
                  return;
                }
                const res = inviteMember(inviteEmail.trim(), inviteRole);
                if (!res) {
                  setMemberError(
                    "Invitation rejected — an active impersonation session with owner/admin rights is required."
                  );
                  return;
                }
                setMemberError(null);
                setInviteResult(`Invite link: /invite/${res.token}`);
              }}
            >
              Send invitation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
