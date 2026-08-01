"use client";

/**
 * Tenant Team Management (§8, §13).
 *
 * TENANT ISOLATION: every list on this page is derived from
 * `memberships.filter(m => m.tenant_id === session.tenant.id)`. No other
 * tenant's membership, user or invitation is ever read, rendered or offered as
 * a manager/assignee option.
 *
 * Capability gates (`can(session, cap)`) hide UI only. The sandbox store and
 * the server guards re-check every mutation, and `updateMembership` returns
 * `{ ok:false, reason }` which is surfaced inline (notably the manager-cycle
 * rejection).
 *
 * Invitations are sandbox-only: no email is sent, so the generated accept link
 * is displayed for copy/paste and clearly labeled.
 */

import { useMemo, useState } from "react";
import {
  Users2,
  UserPlus,
  Pencil,
  UserMinus,
  ShieldAlert,
  MailPlus,
  Copy,
  Check,
  RotateCw,
  Ban,
} from "lucide-react";

import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { useTenancySession } from "@/lib/tenancy/use-tenancy-session";
import { assignableMemberships, can } from "@/lib/tenancy/authz";
import {
  DEFAULT_MEMBERSHIP_NOTIFICATIONS,
  TENANT_ROLES,
  TENANT_ROLE_LABELS,
} from "@/lib/tenancy/types";
import type {
  ActiveSession,
  MembershipNotificationPreferences,
  PlatformUser,
  TenantInvitation,
  TenantMembership,
  TenantRole,
} from "@/lib/tenancy/types";
import { formatDateTime } from "@/lib/utils";

// ── Row shape ─────────────────────────────────────────────────────
interface TeamRow {
  /** Membership id — the tenant-scoped identity used everywhere in §8/§14. */
  id: string;
  membership: TenantMembership;
  name: string;
  email: string;
  managerName: string;
}

const displayName = (user: PlatformUser | undefined, fallback: string): string => {
  if (!user) return fallback;
  const full = `${user.first_name} ${user.last_name}`.trim();
  return full || user.email || fallback;
};

const INVITATION_BADGE: Record<
  TenantMembership["invitation_status"],
  { label: string; variant: "success" | "warning" | "danger" | "secondary" }
> = {
  accepted: { label: "Accepted", variant: "success" },
  pending: { label: "Pending", variant: "warning" },
  revoked: { label: "Revoked", variant: "danger" },
  expired: { label: "Expired", variant: "secondary" },
};

// ══════════════════════════════════════════════════════════════════
// Invite dialog
// ══════════════════════════════════════════════════════════════════
interface InviteDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  session: ActiveSession | null;
  tenantMemberships: TenantMembership[];
  usersById: Map<string, PlatformUser>;
}

function InviteMemberDialog({
  open,
  onOpenChange,
  session,
  tenantMemberships,
  usersById,
}: InviteDialogProps) {
  const inviteMember = useTenancyStore((s) => s.inviteMember);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<TenantRole>("sales_representative");
  const [managerId, setManagerId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Owner seat is granted by ownership transfer, never by invitation.
  const roleOptions = TENANT_ROLES.filter(
    (r) => r !== "tenant_owner" || can(session, "tenant.transfer_ownership")
  ).map((r) => ({ value: r, label: TENANT_ROLE_LABELS[r] }));

  // Only ACTIVE + ACCEPTED members of THIS tenant may be picked as manager.
  const managerOptions = [
    { value: "", label: "No manager" },
    ...assignableMemberships(tenantMemberships).map((m) => ({
      value: m.id,
      label: `${displayName(usersById.get(m.user_id), "Pending member")} — ${
        TENANT_ROLE_LABELS[m.role]
      }`,
    })),
  ];

  const reset = () => {
    setEmail("");
    setRole("sales_representative");
    setManagerId("");
    setError(null);
    setInviteLink(null);
    setCopied(false);
  };

  const submit = () => {
    setError(null);
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }
    const result = inviteMember(trimmed, role, managerId || undefined);
    if (!result) {
      setError("You are not permitted to invite members to this workspace.");
      return;
    }
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    setInviteLink(`${origin}/accept-invite/${result.token}`);
  };

  const copyLink = () => {
    if (!inviteLink) return;
    void navigator.clipboard?.writeText(inviteLink).then(
      () => setCopied(true),
      () => setError("Clipboard unavailable — select and copy the link manually.")
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Team Member</DialogTitle>
          <DialogDescription>
            The invitee joins {session?.tenant?.name ?? "this workspace"} only. Roles decide what
            they can see and do.
          </DialogDescription>
        </DialogHeader>

        {inviteLink ? (
          <div className="space-y-3">
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                Sandbox mode — no email is sent
              </p>
              <p className="mt-1 text-xs text-amber-800">
                Copy this single-use invite link and open it in another browser profile to accept
                the invitation. It expires in 7 days.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Input readOnly value={inviteLink} className="font-mono text-xs" />
              <Button type="button" variant="outline" onClick={copyLink}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy"}
              </Button>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={reset}>
                Invite another
              </Button>
              <Button
                className="bg-primary hover:bg-brand-blue-dark"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Email</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="teammate@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <SelectField
              label="Role"
              options={roleOptions}
              value={role}
              onChange={(v) => setRole(v as TenantRole)}
            />
            <SelectField
              label="Manager (optional)"
              options={managerOptions}
              value={managerId}
              onChange={setManagerId}
            />
            <p className="text-xs text-muted-foreground">
              Only active members who have accepted their invitation can be chosen as a manager.
            </p>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button className="bg-primary hover:bg-brand-blue-dark" onClick={submit}>
                <MailPlus className="h-4 w-4" />
                Send Invitation
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════
// Edit member dialog
// ══════════════════════════════════════════════════════════════════
interface EditDialogProps {
  membership: TenantMembership;
  memberName: string;
  session: ActiveSession | null;
  tenantMemberships: TenantMembership[];
  usersById: Map<string, PlatformUser>;
  onOpenChange: (v: boolean) => void;
}

function EditMemberDialog({
  membership,
  memberName,
  session,
  tenantMemberships,
  usersById,
  onOpenChange,
}: EditDialogProps) {
  const updateMembership = useTenancyStore((s) => s.updateMembership);

  const [role, setRole] = useState<TenantRole>(membership.role);
  const [jobTitle, setJobTitle] = useState(membership.job_title ?? "");
  const [department, setDepartment] = useState(membership.department ?? "");
  const [managerId, setManagerId] = useState(membership.manager_membership_id ?? "");
  const [active, setActive] = useState(membership.active);
  const [prefs, setPrefs] = useState<MembershipNotificationPreferences>(
    membership.notification_preferences ?? DEFAULT_MEMBERSHIP_NOTIFICATIONS
  );
  const [error, setError] = useState<string | null>(null);

  const roleOptions = TENANT_ROLES.filter(
    (r) =>
      r !== "tenant_owner" ||
      membership.role === "tenant_owner" ||
      can(session, "tenant.transfer_ownership")
  ).map((r) => ({ value: r, label: TENANT_ROLE_LABELS[r] }));

  // New manager choices are restricted to active + accepted members (§8).
  const candidates = assignableMemberships(tenantMemberships).filter((m) => m.id !== membership.id);
  const managerOptions = [
    { value: "", label: "No manager" },
    ...candidates.map((m) => ({
      value: m.id,
      label: `${displayName(usersById.get(m.user_id), "Pending member")} — ${
        TENANT_ROLE_LABELS[m.role]
      }`,
    })),
  ];
  // Keep an already-assigned (possibly now inactive) manager selectable so the
  // form can be saved without silently clearing it.
  const current = membership.manager_membership_id
    ? tenantMemberships.find((m) => m.id === membership.manager_membership_id)
    : undefined;
  if (current && !candidates.some((m) => m.id === current.id)) {
    managerOptions.splice(1, 0, {
      value: current.id,
      label: `${displayName(usersById.get(current.user_id), "Member")} (inactive — current)`,
    });
  }

  const togglePref = (key: keyof MembershipNotificationPreferences) =>
    setPrefs((p) => ({ ...p, [key]: !p[key] }));

  const save = () => {
    setError(null);
    const result = updateMembership(membership.id, {
      role,
      job_title: jobTitle.trim() || undefined,
      department: department.trim() || undefined,
      manager_membership_id: managerId || undefined,
      active,
      notification_preferences: prefs,
    });
    if (!result.ok) {
      setError(result.reason ?? "That change was rejected.");
      return;
    }
    onOpenChange(false);
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit {memberName}</DialogTitle>
          <DialogDescription>
            Role, reporting line and notification preferences for this workspace.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField
            label="Role"
            options={roleOptions}
            value={role}
            onChange={(v) => setRole(v as TenantRole)}
          />
          <SelectField
            label="Manager"
            options={managerOptions}
            value={managerId}
            onChange={setManagerId}
          />
          <div className="space-y-1.5">
            <Label htmlFor="edit-job-title">Job Title</Label>
            <Input
              id="edit-job-title"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Installation Lead"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-department">Department</Label>
            <Input
              id="edit-department"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="Operations"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">
                Inactive members keep their history but cannot sign in or receive new work.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => setActive((v) => !v)}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                active ? "bg-primary" : "bg-muted-foreground/30"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
                  active ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
          </div>

          <div className="space-y-2 rounded-lg border p-3 sm:col-span-2">
            <p className="text-sm font-medium">Notification Preferences</p>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.email_assignment}
                onChange={() => togglePref("email_assignment")}
              />
              Email on new assignment
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.email_confirmation}
                onChange={() => togglePref("email_confirmation")}
              />
              Email on appointment confirmation
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={prefs.email_daily_digest}
                onChange={() => togglePref("email_daily_digest")}
              />
              Daily digest
            </label>
          </div>
        </div>

        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-primary hover:bg-brand-blue-dark" onClick={save}>
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════
// Deactivate confirmation
// ══════════════════════════════════════════════════════════════════
function DeactivateDialog({
  memberName,
  onConfirm,
  onOpenChange,
}: {
  memberName: string;
  onConfirm: () => void;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Deactivate {memberName}?</DialogTitle>
          <DialogDescription>
            Their historical records stay intact and attributed to them.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Reassign their open work first.</p>
          <p className="mt-1 text-xs text-amber-800">
            Deactivation blocks sign-in and removes them from every assignment picker, but it does
            not move their open leads, quotes or jobs. Anything still assigned to them will stay
            assigned until you reassign it.
          </p>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            <UserMinus className="h-4 w-4" />
            Deactivate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════
// Page
// ══════════════════════════════════════════════════════════════════
export default function TeamPage() {
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const session = useTenancySession();
  const allMemberships = useTenancyStore((s) => s.memberships);
  const allInvitations = useTenancyStore((s) => s.invitations);
  const users = useTenancyStore((s) => s.users);
  const inviteMember = useTenancyStore((s) => s.inviteMember);
  const revokeInvitation = useTenancyStore((s) => s.revokeInvitation);
  const deactivateMembership = useTenancyStore((s) => s.deactivateMembership);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [resendLink, setResendLink] = useState<string | null>(null);

  const tenantId = session?.tenant?.id;

  const usersById = useMemo(
    () => new Map(users.map((u) => [u.id, u] as const)),
    [users]
  );

  // ── Tenant-scoped slices. Nothing outside the active tenant is read. ──
  const tenantMemberships = useMemo(
    () => (tenantId ? allMemberships.filter((m) => m.tenant_id === tenantId) : []),
    [allMemberships, tenantId]
  );

  const pendingInvitations = useMemo<TenantInvitation[]>(
    () =>
      tenantId
        ? allInvitations.filter((i) => i.tenant_id === tenantId && i.status === "pending")
        : [],
    [allInvitations, tenantId]
  );

  const rows = useMemo<TeamRow[]>(() => {
    const byId = new Map(tenantMemberships.map((m) => [m.id, m] as const));
    return tenantMemberships.map((m) => {
      const user = usersById.get(m.user_id);
      const manager = m.manager_membership_id ? byId.get(m.manager_membership_id) : undefined;
      return {
        id: m.id,
        membership: m,
        name: displayName(user, "Invited user"),
        email: user?.email ?? "—",
        managerName: manager
          ? displayName(usersById.get(manager.user_id), "Member")
          : "—",
      };
    });
  }, [tenantMemberships, usersById]);

  const canView = can(session, "team.view");
  const canInvite = can(session, "team.invite");
  const canManageRoles = can(session, "team.manage_roles");
  const canDeactivate = can(session, "team.deactivate");

  const editing = editingId ? tenantMemberships.find((m) => m.id === editingId) : undefined;
  const deactivating = deactivatingId
    ? rows.find((r) => r.id === deactivatingId)
    : undefined;

  if (!hasHydrated) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading workspace...
      </div>
    );
  }

  // ── Access denied (§13) ──────────────────────────────────────────
  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title="Team" description="Manage the people in this workspace" />
        <Card className="border-red-200">
          <CardHeader className="flex flex-row items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100 text-red-600">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base">Access denied</CardTitle>
              <p className="text-sm text-muted-foreground">
                {session?.tenant
                  ? "Your role does not include team management for this workspace."
                  : "No active workspace. Register or accept an invitation to manage a team."}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">
              Team visibility requires the <code className="font-mono">team.view</code> capability
              (Owner, Administrator or Manager).
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const resend = (invitation: TenantInvitation) => {
    const result = inviteMember(
      invitation.email,
      invitation.role,
      invitation.manager_membership_id
    );
    if (!result) return;
    // Supersede the old token so only one link is ever live per invitee.
    revokeInvitation(invitation.id);
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    setResendLink(`${origin}/accept-invite/${result.token}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Team"
        description={`Members of ${session?.tenant?.name ?? "this workspace"}`}
        actions={
          canInvite ? (
            <Button
              className="bg-primary hover:bg-brand-blue-dark"
              onClick={() => setInviteOpen(true)}
            >
              <UserPlus className="h-4 w-4" />
              Invite Member
            </Button>
          ) : undefined
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={Users2}
          title="No team members yet"
          description="Invite your first teammate to give them scoped access to this workspace."
          action={
            canInvite ? (
              <Button
                className="bg-primary hover:bg-brand-blue-dark"
                onClick={() => setInviteOpen(true)}
              >
                Invite First Member
              </Button>
            ) : undefined
          }
        />
      ) : (
        <DataTable<TeamRow>
          data={rows}
          emptyMessage="No team members in this workspace."
          columns={[
            {
              key: "name",
              header: "Name",
              render: (r) => (
                <div className="font-medium">
                  {r.name}
                  {r.membership.user_id === session?.user.id && (
                    <span className="ml-2 text-xs text-muted-foreground">(you)</span>
                  )}
                </div>
              ),
            },
            { key: "email", header: "Email", render: (r) => r.email },
            {
              key: "role",
              header: "Role",
              render: (r) => (
                <Badge variant="secondary">{TENANT_ROLE_LABELS[r.membership.role]}</Badge>
              ),
            },
            { key: "job_title", header: "Job Title", render: (r) => r.membership.job_title || "—" },
            {
              key: "department",
              header: "Department",
              render: (r) => r.membership.department || "—",
            },
            { key: "manager", header: "Manager", render: (r) => r.managerName },
            {
              key: "status",
              header: "Status",
              render: (r) =>
                r.membership.active ? (
                  <Badge variant="success">Active</Badge>
                ) : (
                  <Badge variant="danger">Inactive</Badge>
                ),
            },
            {
              key: "invitation",
              header: "Invitation",
              render: (r) => {
                const cfg = INVITATION_BADGE[r.membership.invitation_status];
                return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
              },
            },
            {
              key: "last_accessed",
              header: "Last Accessed",
              render: (r) =>
                r.membership.last_accessed_at ? (
                  formatDateTime(r.membership.last_accessed_at)
                ) : (
                  <span className="text-muted-foreground">Never</span>
                ),
            },
            {
              key: "actions",
              header: "",
              className: "text-right",
              render: (r) => (
                <div className="flex justify-end gap-2">
                  {canManageRoles && (
                    <Button size="sm" variant="outline" onClick={() => setEditingId(r.id)}>
                      <Pencil className="h-3 w-3" />
                      Edit
                    </Button>
                  )}
                  {canDeactivate && r.membership.active && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600"
                      disabled={
                        r.membership.role === "tenant_owner" ||
                        r.membership.user_id === session?.user.id
                      }
                      title={
                        r.membership.role === "tenant_owner"
                          ? "Transfer ownership before deactivating the owner"
                          : undefined
                      }
                      onClick={() => setDeactivatingId(r.id)}
                    >
                      <UserMinus className="h-3 w-3" />
                      Deactivate
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      )}

      {/* ── Pending invitations (§9) ───────────────────────────────── */}
      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {resendLink && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                  Sandbox mode — no email is sent
                </p>
                <p className="mt-1 break-all font-mono text-xs text-amber-900">{resendLink}</p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-2 border-amber-400 bg-white text-amber-900 hover:bg-amber-100"
                  onClick={() => setResendLink(null)}
                >
                  Dismiss
                </Button>
              </div>
            )}
            {pendingInvitations.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No pending invitations.
              </p>
            ) : (
              pendingInvitations.map((inv) => (
                <div
                  key={inv.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{inv.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {TENANT_ROLE_LABELS[inv.role]} · invited {formatDateTime(inv.created_at)} ·
                      expires {formatDateTime(inv.expires_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={() => resend(inv)}>
                      <RotateCw className="h-3 w-3" />
                      Resend
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600"
                      onClick={() => revokeInvitation(inv.id)}
                    >
                      <Ban className="h-3 w-3" />
                      Revoke
                    </Button>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {canInvite && (
        <InviteMemberDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          session={session}
          tenantMemberships={tenantMemberships}
          usersById={usersById}
        />
      )}

      {canManageRoles && editing && (
        <EditMemberDialog
          key={editing.id}
          membership={editing}
          memberName={rows.find((r) => r.id === editing.id)?.name ?? "member"}
          session={session}
          tenantMemberships={tenantMemberships}
          usersById={usersById}
          onOpenChange={(v) => {
            if (!v) setEditingId(null);
          }}
        />
      )}

      {canDeactivate && deactivating && (
        <DeactivateDialog
          memberName={deactivating.name}
          onOpenChange={(v) => {
            if (!v) setDeactivatingId(null);
          }}
          onConfirm={() => {
            deactivateMembership(deactivating.id);
            setDeactivatingId(null);
          }}
        />
      )}
    </div>
  );
}
