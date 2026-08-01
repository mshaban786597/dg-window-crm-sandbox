"use client";

import { useState } from "react";
import { Plus, X, Pencil, UserX, Eye, Users, ShieldAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SandboxBadge } from "@/components/layout/sandbox-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WebsiteLeadSimulator } from "@/components/settings/website-lead-simulator";
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import {
  ROLE_LABELS,
  SANDBOX_MODE,
  TEAM_ROLES,
  TEAM_ROLE_LABELS,
  ASSIGNMENT_MODES,
  ASSIGNMENT_MODE_LABELS,
} from "@/lib/domain";
import {
  canManageTeam,
  canPromoteToAdmin,
  activeManagers,
  wouldCreateManagerCycle,
} from "@/lib/permissions";
import type { TeamMember, NotificationRecord } from "@/types/database";

function TagList({
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
}) {
  const [val, setVal] = useState("");
  const add = () => {
    if (val.trim()) {
      onAdd(val);
      setVal("");
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={val} placeholder={placeholder} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <Button type="button" variant="outline" onClick={add} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None configured yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <span key={it} className="inline-flex items-center gap-1 rounded-full bg-brand-blue-light px-3 py-1 text-sm text-brand-blue-dark">
              {it}
              <button type="button" onClick={() => onRemove(it)} className="text-brand-blue-dark/70 hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Small reusable switch (matches the existing blue toggle style) ──
function Switch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className={`relative inline-flex items-center ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} className="sr-only peer" />
      <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-brand-blue after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
    </label>
  );
}

const NOTIF_KIND_LABELS: Record<string, string> = {
  lead_assignment: "Lead Assignment",
  manager_assignment: "Manager Assignment",
  website_manager: "Website Manager",
  admin_unassigned: "Unassigned Alert",
};

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; variant: "success" | "warning" | "danger" | "secondary" | "outline" }> = {
    sent: { label: "Sent", variant: "success" },
    failed: { label: "Failed", variant: "danger" },
    sandbox: { label: "Sandbox", variant: "secondary" },
    queued: { label: "Queued", variant: "outline" },
    confirmed: { label: "Confirmed", variant: "success" },
    pending: { label: "Pending", variant: "warning" },
    expired: { label: "Expired", variant: "outline" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

// ── §7 Team member add/edit dialog (admin-only) ────────────────────
function MemberFormDialog({
  open,
  onOpenChange,
  editing,
  team,
  canAdmin,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: TeamMember | null;
  team: TeamMember[];
  canAdmin: boolean;
}) {
  const addTeamMember = useCRMStore((s) => s.addTeamMember);
  const updateTeamMember = useCRMStore((s) => s.updateTeamMember);
  const showToast = useCRMStore((s) => s.showToast);

  const [firstName, setFirstName] = useState(editing?.first_name ?? "");
  const [lastName, setLastName] = useState(editing?.last_name ?? "");
  const [email, setEmail] = useState(editing?.email ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [role, setRole] = useState<TeamMember["role"]>(editing?.role ?? "sales_representative");
  const [active, setActive] = useState(editing?.active ?? true);
  const [managerId, setManagerId] = useState(editing?.manager_id ?? "");
  const [emailAssignment, setEmailAssignment] = useState(
    editing?.notification_preferences.email_assignment ?? true
  );
  const [emailConfirmation, setEmailConfirmation] = useState(
    editing?.notification_preferences.email_confirmation ?? true
  );

  // Role options — hide Administrator unless the acting user may promote (§7).
  const roleOptions = TEAM_ROLES.filter((r) => r !== "administrator" || canAdmin || editing?.role === "administrator").map(
    (r) => ({ value: r, label: TEAM_ROLE_LABELS[r] ?? r })
  );

  // Manager candidates: active managers, excluding the member being edited.
  const managerCandidates = activeManagers(team).filter((m) => m.id !== editing?.id);
  // Ensure a currently-set (possibly inactive) manager stays selectable.
  if (editing?.manager_id && !managerCandidates.some((m) => m.id === editing.manager_id)) {
    const current = team.find((m) => m.id === editing.manager_id);
    if (current) managerCandidates.unshift(current);
  }
  const managerOptions = [
    { value: "", label: "No manager" },
    ...managerCandidates.map((m) => ({
      value: m.id,
      label: `${m.first_name} ${m.last_name}`.trim() + (m.active ? "" : " (inactive)"),
    })),
  ];

  const save = () => {
    if (!firstName.trim() || !lastName.trim()) {
      showToast("error", "First and last name are required");
      return;
    }
    if (!email.trim()) {
      showToast("error", "Email is required");
      return;
    }
    const nextManager = managerId || undefined;
    // Cycle / self-management guard (§7) — refuse the save.
    const memberId = editing?.id ?? "__new__";
    if (nextManager && wouldCreateManagerCycle(team, memberId, nextManager)) {
      showToast("error", "That manager selection would create a management cycle");
      return;
    }
    const payload = {
      first_name: firstName.trim(),
      last_name: lastName.trim(),
      email: email.trim(),
      phone: phone.trim() || undefined,
      role,
      active,
      manager_id: nextManager,
      notification_preferences: {
        email_assignment: emailAssignment,
        email_confirmation: emailConfirmation,
      },
    };
    if (editing) updateTeamMember(editing.id, payload);
    else addTeamMember(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit Team Member" : "Add Team Member"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>First Name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <SelectField
            label="Role"
            options={roleOptions}
            value={role}
            onChange={(v) => setRole(v as TeamMember["role"])}
          />
          <SelectField
            label="Manager"
            options={managerOptions}
            value={managerId}
            onChange={(v) => setManagerId(v)}
          />
          <div className="flex items-center justify-between rounded-lg border px-3 py-2 sm:col-span-2">
            <div>
              <p className="text-sm font-medium">Active</p>
              <p className="text-xs text-muted-foreground">Inactive members cannot be assigned new leads.</p>
            </div>
            <Switch checked={active} onChange={() => setActive((v) => !v)} />
          </div>
          <div className="sm:col-span-2 space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Notification Preferences</p>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={emailAssignment} onChange={() => setEmailAssignment((v) => !v)} />
              Email me on lead assignment
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={emailConfirmation} onChange={() => setEmailConfirmation((v) => !v)} />
              Email me appointment confirmations
            </label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={save}>
            {editing ? "Save Changes" : "Add Member"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── §7 Team tab ────────────────────────────────────────────────────
function TeamTab() {
  const hasHydrated = useCRMStore((s) => s._hasHydrated);
  const team = useCRMStore((s) => s.teamMembers);
  const actingUser = useCRMStore((s) => s.teamMembers.find((m) => m.id === s.currentTeamMemberId));
  const deactivateTeamMember = useCRMStore((s) => s.deactivateTeamMember);

  const canManage = canManageTeam(actingUser);
  const canAdmin = canPromoteToAdmin(actingUser);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);

  const nameOf = (id?: string) => {
    const m = team.find((x) => x.id === id);
    return m ? `${m.first_name} ${m.last_name}`.trim() : "—";
  };

  const openAdd = () => {
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">Team Members</CardTitle>
          {canManage && (
            <Button className="gap-1.5 bg-brand-blue hover:bg-brand-blue-dark" onClick={openAdd}>
              <Plus className="h-4 w-4" /> Add Member
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          {!canManage && (
            <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              <ShieldAlert className="h-4 w-4 shrink-0" />
              You have read-only access. Only administrators can add, edit, or deactivate team members.
            </div>
          )}
          {!hasHydrated ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : team.length === 0 ? (
            <EmptyState icon={Users} title="No team members yet" description="Add your first administrator, manager, or sales rep." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Email</th>
                    <th className="px-4 py-2 font-medium">Role</th>
                    <th className="px-4 py-2 font-medium">Manager</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    {canManage && <th className="px-4 py-2 font-medium text-right">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {team.map((m) => (
                    <tr key={m.id}>
                      <td className="px-4 py-2 font-medium">{`${m.first_name} ${m.last_name}`.trim()}</td>
                      <td className="px-4 py-2 text-muted-foreground">{m.email}</td>
                      <td className="px-4 py-2">{TEAM_ROLE_LABELS[m.role] ?? m.role}</td>
                      <td className="px-4 py-2 text-muted-foreground">{nameOf(m.manager_id)}</td>
                      <td className="px-4 py-2">
                        <Badge variant={m.active ? "success" : "outline"}>{m.active ? "Active" : "Inactive"}</Badge>
                      </td>
                      {canManage && (
                        <td className="px-4 py-2">
                          <div className="flex items-center justify-end gap-1">
                            <Button variant="ghost" size="icon" title="Edit" onClick={() => openEdit(m)}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              title="Deactivate"
                              disabled={!m.active}
                              onClick={() => deactivateTeamMember(m.id)}
                            >
                              <UserX className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {canManage && dialogOpen && (
        <MemberFormDialog
          key={editing?.id ?? "new"}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          editing={editing}
          team={team}
          canAdmin={canAdmin}
        />
      )}
    </div>
  );
}

// ── §10/§12/§20 Access & Website tab ───────────────────────────────
function AccessTab() {
  const s = useSettingsStore();
  const team = useCRMStore((cs) => cs.teamMembers);
  const managers = activeManagers(team);

  const managerOptions = [
    { value: "", label: "— None —" },
    ...managers.map((m) => ({ value: m.id, label: `${m.first_name} ${m.last_name}`.trim() })),
  ];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Access Control</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-3xl">
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Managers can view cost</p>
              <p className="text-xs text-muted-foreground">
                When on, managers see internal cost figures. Administrators always can; reps and marketing never do.
              </p>
            </div>
            <Switch
              checked={s.manager_cost_visible}
              onChange={() => s.setField("manager_cost_visible", !s.manager_cost_visible)}
            />
          </div>
          <div className="max-w-xs">
            <Label>Confirmation Expiry (days)</Label>
            <Input
              type="number"
              min={1}
              value={s.confirmation_expiry_days}
              onChange={(e) => s.setField("confirmation_expiry_days", Number(e.target.value) || 0)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              How long an appointment-confirmation link stays valid.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Website Lead Assignment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 max-w-3xl">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Assignment Mode"
              options={ASSIGNMENT_MODES.map((m) => ({ value: m, label: ASSIGNMENT_MODE_LABELS[m] ?? m }))}
              value={s.website_assignment_mode}
              onChange={(v) => s.setField("website_assignment_mode", v as "default_manager" | "round_robin")}
            />
            <SelectField
              label="Default Website Manager"
              options={managerOptions}
              value={s.default_website_manager_id}
              onChange={(v) => s.setField("default_website_manager_id", v)}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border px-4 py-3">
            <div>
              <p className="text-sm font-medium">Round-robin enabled</p>
              <p className="text-xs text-muted-foreground">
                Rotate new website leads across active managers (used when mode is Round Robin).
              </p>
            </div>
            <Switch
              checked={s.round_robin_enabled}
              onChange={() => s.setField("round_robin_enabled", !s.round_robin_enabled)}
            />
          </div>
          {managers.length === 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
              No active managers configured. Website leads will be flagged as needing assignment.
            </div>
          )}
        </CardContent>
      </Card>

      <WebsiteLeadSimulator />
    </div>
  );
}

// ── §8/§10/§28 Notifications outbox tab ────────────────────────────
function NotificationsTab() {
  const hasHydrated = useCRMStore((s) => s._hasHydrated);
  const notifications = useCRMStore((s) => s.notifications);
  const confirmations = useCRMStore((s) => s.appointmentConfirmations);
  const leads = useCRMStore((s) => s.leads);
  const retryNotification = useCRMStore((s) => s.retryNotification);

  const [preview, setPreview] = useState<NotificationRecord | null>(null);

  const leadName = (leadId: string) => {
    const l = leads.find((x) => x.id === leadId);
    return l ? l.full_name || l.id : leadId;
  };

  const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString() : "—");

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Outbox</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-lg border border-brand-blue/30 bg-brand-blue-light/50 p-3 text-sm text-brand-blue-dark">
            Emails marked <strong>Sandbox</strong> were generated and recorded but never sent to a real inbox.
          </div>
          {!hasHydrated ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : notifications.length === 0 ? (
            <EmptyState title="No notifications yet" description="Assignment and confirmation emails will appear here as they are generated." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Kind</th>
                    <th className="px-4 py-2 font-medium">Recipient</th>
                    <th className="px-4 py-2 font-medium">Subject</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Created</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {notifications.map((n) => (
                    <tr key={n.id}>
                      <td className="px-4 py-2">{NOTIF_KIND_LABELS[n.kind] ?? n.kind}</td>
                      <td className="px-4 py-2 text-muted-foreground">{n.to_email}</td>
                      <td className="px-4 py-2 max-w-[18rem] truncate">{n.subject}</td>
                      <td className="px-4 py-2"><StatusPill status={n.status} /></td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{fmt(n.created_at)}</td>
                      <td className="px-4 py-2">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Preview" onClick={() => setPreview(n)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {n.status === "failed" && (
                            <Button variant="outline" size="sm" onClick={() => retryNotification(n.id)}>
                              Retry
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appointment Confirmations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!hasHydrated ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : confirmations.length === 0 ? (
            <EmptyState title="No confirmations yet" description="Confirmation requests are created when a lead is assigned." />
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">Lead</th>
                    <th className="px-4 py-2 font-medium">Recipient Role</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium">Expires</th>
                    <th className="px-4 py-2 font-medium">Confirmed</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {confirmations.map((c) => (
                    <tr key={c.id}>
                      <td className="px-4 py-2 font-medium">{leadName(c.lead_id)}</td>
                      <td className="px-4 py-2 text-muted-foreground">
                        {c.recipient_role ? TEAM_ROLE_LABELS[c.recipient_role] ?? c.recipient_role : "—"}
                      </td>
                      <td className="px-4 py-2"><StatusPill status={c.status} /></td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{fmt(c.expires_at)}</td>
                      <td className="px-4 py-2 text-muted-foreground whitespace-nowrap">{fmt(c.confirmed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!preview} onOpenChange={(v) => !v && setPreview(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="pr-6">{preview?.subject}</DialogTitle>
          </DialogHeader>
          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <StatusPill status={preview.status} />
                <span>To: {preview.to_email}</span>
                <span>·</span>
                <span>{NOTIF_KIND_LABELS[preview.kind] ?? preview.kind}</span>
              </div>
              {preview.error && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-2 text-xs text-red-700">
                  Error: {preview.error}
                </div>
              )}
              {/* Rendered inside a sandboxed iframe — no scripts, no same-origin. */}
              <iframe
                title="Email preview"
                sandbox=""
                srcDoc={preview.body_html}
                className="h-80 w-full rounded-lg border bg-white"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function SettingsPage() {
  const currentUser = useCRMStore((s) => s.currentUser);
  const showToast = useCRMStore((s) => s.showToast);
  const s = useSettingsStore();

  const [newService, setNewService] = useState("");
  const [newSource, setNewSource] = useState("");

  const save = () => showToast("success", "Settings saved");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Company profile, taxonomy, users, integrations & automations"
        actions={<SandboxBadge />}
      />

      <Tabs defaultValue="company">
        <TabsList className="flex-wrap">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline & Sources</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="users">Users & Roles</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="access">Access & Website</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
        </TabsList>

        {/* Company */}
        <TabsContent value="company" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Company Profile</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 max-w-3xl">
              <div><Label>Company Name</Label><Input value={s.company.name} placeholder="Your window company" onChange={(e) => s.updateCompany({ name: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={s.company.phone} onChange={(e) => s.updateCompany({ phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={s.company.email} onChange={(e) => s.updateCompany({ email: e.target.value })} /></div>
              <div><Label>Website</Label><Input value={s.company.website} onChange={(e) => s.updateCompany({ website: e.target.value })} /></div>
              <div><Label>Logo URL (placeholder)</Label><Input value={s.company.logo_url} placeholder="https://…/logo.png" onChange={(e) => s.updateCompany({ logo_url: e.target.value })} /></div>
              <div><Label>Primary Service Area</Label><Input value={s.company.service_area} onChange={(e) => s.updateCompany({ service_area: e.target.value })} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Defaults</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 max-w-3xl">
              <div><Label>Default Tax Rate (%)</Label><Input type="number" step={0.01} value={s.tax_rate} onChange={(e) => s.setField("tax_rate", Number(e.target.value) || 0)} /></div>
              <div><Label>Currency</Label><Input value={s.currency} onChange={(e) => s.setField("currency", e.target.value || "USD")} /></div>
              <div><Label>Timezone</Label><Input value={s.timezone} onChange={(e) => s.setField("timezone", e.target.value)} /></div>
              <div><Label>Proposal Validity (days)</Label><Input type="number" value={s.proposal_validity_days} onChange={(e) => s.setField("proposal_validity_days", Number(e.target.value) || 0)} /></div>
              <div><Label>Default Deposit (%)</Label><Input type="number" value={s.default_deposit_percent} onChange={(e) => s.setField("default_deposit_percent", Number(e.target.value) || 0)} /></div>
              <div><Label>Review Link</Label><Input value={s.review_link} placeholder="https://…/review" onChange={(e) => s.setField("review_link", e.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Review Message Template</Label><Input value={s.review_message_template} onChange={(e) => s.setField("review_message_template", e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Use {"{{name}}"}, {"{{service}}"}, {"{{link}}"} placeholders.</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Service Areas</CardTitle></CardHeader>
            <CardContent>
              <TagList items={s.service_areas} onAdd={s.addServiceArea} onRemove={s.removeServiceArea} placeholder="Add a city or region" />
            </CardContent>
          </Card>

          <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={save}>Save Changes</Button>
        </TabsContent>

        {/* Services */}
        <TabsContent value="services" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Service Taxonomy</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Enable, disable, add, or remove the window services your company offers. Forms use the enabled services.</p>
              <div className="flex gap-2 max-w-md">
                <Input value={newService} placeholder="Add a service (e.g. Bay & Bow Windows)" onChange={(e) => setNewService(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (s.addService(newService), setNewService("")))} />
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => { s.addService(newService); setNewService(""); }}><Plus className="h-4 w-4" /> Add</Button>
              </div>
              <div className="divide-y rounded-lg border">
                {s.services.map((svc) => (
                  <div key={svc.value} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{svc.label}</p>
                      <p className="text-xs text-muted-foreground">{svc.value}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input type="checkbox" checked={svc.enabled} onChange={() => s.toggleService(svc.value)} className="sr-only peer" />
                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-brand-blue after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                      </label>
                      <button type="button" onClick={() => s.removeService(svc.value)} className="text-muted-foreground hover:text-red-600"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline & sources */}
        <TabsContent value="pipeline" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Lead Stages</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {s.lead_stages.map((st, i) => (
                  <span key={st.value} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                    <span className="text-xs text-muted-foreground">{i + 1}</span>
                    {st.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Stage keys drive pipeline logic and are fixed; labels shown above.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Lead Sources</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 max-w-md">
                <Input value={newSource} placeholder="Add a lead source" onChange={(e) => setNewSource(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (s.addLeadSource(newSource), setNewSource("")))} />
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => { s.addLeadSource(newSource); setNewSource(""); }}><Plus className="h-4 w-4" /> Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.lead_sources.map((src) => (
                  <span key={src.value} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                    {src.label}
                    <button type="button" onClick={() => s.removeLeadSource(src.value)} className="text-muted-foreground hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products */}
        <TabsContent value="products" className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Window Manufacturers</CardTitle></CardHeader>
            <CardContent><TagList items={s.manufacturers} onAdd={s.addManufacturer} onRemove={s.removeManufacturer} placeholder="Add a manufacturer" /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Product Lines</CardTitle></CardHeader>
            <CardContent><TagList items={s.product_lines} onAdd={s.addProductLine} onRemove={s.removeProductLine} placeholder="Add a product line" /></CardContent>
          </Card>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Team Members</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {currentUser && (
                <div className="rounded-lg border p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{currentUser.full_name}</p>
                    <p className="text-sm text-muted-foreground">{currentUser.email}</p>
                  </div>
                  <span className="text-sm rounded-full bg-brand-blue-light text-brand-blue-dark px-3 py-1">
                    {ROLE_LABELS[currentUser.role]}
                  </span>
                </div>
              )}
              <div>
                <p className="text-sm font-medium">Available Roles</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.user_roles.map((r) => (
                    <span key={r.value} className="rounded-full border px-3 py-1 text-sm">{r.label}</span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Team (§7) */}
        <TabsContent value="team" className="mt-4">
          <TeamTab />
        </TabsContent>

        {/* Access & Website (§10, §12, §20) */}
        <TabsContent value="access" className="mt-4">
          <AccessTab />
        </TabsContent>

        {/* Notifications outbox (§8, §28) */}
        <TabsContent value="notifications" className="mt-4">
          <NotificationsTab />
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <div className="rounded-lg border border-brand-blue/30 bg-brand-blue-light/50 p-3 text-sm text-brand-blue-dark">
            {SANDBOX_MODE
              ? "Sandbox mode is ON. All integrations are disabled and no external services will run, even if toggled on here."
              : "Integrations are disabled by default. Enable one only after configuring its credentials."}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {s.integrations.map((int) => (
              <Card key={int.id}>
                <CardContent className="pt-6 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{int.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">{int.description}</p>
                    <p className="text-xs mt-2 text-muted-foreground">{int.enabled ? "Enabled (inactive in sandbox)" : "Disabled"}</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center pt-1">
                    <input type="checkbox" checked={int.enabled} onChange={() => s.toggleIntegration(int.id)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-brand-blue after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Automations */}
        <TabsContent value="automations" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Follow-Up Automations</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Suggested automation templates. These are disabled by default and never execute in sandbox mode.</p>
              {s.automations.map((auto) => (
                <div key={auto.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium text-sm">{auto.name}</p>
                    <p className="text-xs text-muted-foreground">{auto.trigger} → {auto.action} ({auto.delay})</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" checked={auto.enabled} onChange={() => s.toggleAutomation(auto.id)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-brand-blue after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
