"use client";

/**
 * Tenant directory (§16).
 *
 * Lists every company on the platform with lifecycle controls. Suspend and
 * reactivate are state-changing and therefore always confirmed; suspension also
 * requires a written reason which is persisted on the audit entry.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Building2, MoreHorizontal, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { useTenantUsageLookup } from "@/lib/tenancy/platform-usage";
import { planLabel } from "@/lib/tenancy/platform-settings-store";
import { TENANT_STATUSES, TENANT_STATUS_LABELS } from "@/lib/tenancy/types";
import type { Tenant, TenantStatus } from "@/lib/tenancy/types";
import { formatDate, formatDateTime } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline" | "success" | "warning" | "danger";

const STATUS_VARIANT: Record<TenantStatus, BadgeVariant> = {
  trial: "warning",
  active: "success",
  suspended: "danger",
  cancelled: "secondary",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  ...TENANT_STATUSES.map((s) => ({ value: s, label: TENANT_STATUS_LABELS[s] })),
];

export default function PlatformCompaniesPage() {
  const router = useRouter();
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const tenants = useTenancyStore((s) => s.tenants);
  const users = useTenancyStore((s) => s.users);
  const suspendTenant = useTenancyStore((s) => s.suspendTenant);
  const reactivateTenant = useTenancyStore((s) => s.reactivateTenant);
  const startSupport = useTenancyStore((s) => s.startSupport);
  const usageFor = useTenantUsageLookup();

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  const [suspendTarget, setSuspendTarget] = useState<Tenant | null>(null);
  const [suspendReason, setSuspendReason] = useState("");
  const [reactivateTarget, setReactivateTarget] = useState<Tenant | null>(null);
  const [supportTarget, setSupportTarget] = useState<Tenant | null>(null);
  const [supportReason, setSupportReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const ownerLabel = (tenant: Tenant): string => {
    const owner = users.find((u) => u.id === tenant.owner_user_id);
    if (!owner) return "—";
    const name = `${owner.first_name} ${owner.last_name}`.trim();
    return name || owner.email;
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tenants.filter((t) => {
      if (status !== "all" && t.status !== status) return false;
      if (!q) return true;
      const owner = users.find((u) => u.id === t.owner_user_id);
      return (
        t.name.toLowerCase().includes(q) ||
        t.slug.toLowerCase().includes(q) ||
        (owner?.email.toLowerCase().includes(q) ?? false) ||
        `${owner?.first_name ?? ""} ${owner?.last_name ?? ""}`.toLowerCase().includes(q)
      );
    });
  }, [tenants, users, search, status]);

  const openSupportView = () => {
    if (!supportTarget) return;
    if (supportReason.trim().length < 5) {
      setError("Please describe why you need access (at least 5 characters).");
      return;
    }
    const result = startSupport(supportTarget.id, "read_only", supportReason.trim());
    if (!result.ok) {
      setError(result.reason ?? "Unable to start the support session.");
      return;
    }
    setSupportTarget(null);
    setSupportReason("");
    setError(null);
    router.push("/app/dashboard");
  };

  if (!hasHydrated) {
    return <p className="text-sm text-muted-foreground">Loading tenants…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Companies"
        description="Every tenant on this deployment, with lifecycle and support controls."
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_220px]">
          <div className="space-y-1.5">
            <Label htmlFor="tenant-search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="tenant-search"
                className="pl-9"
                placeholder="Company, slug or owner"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <SelectField label="Status" value={status} options={STATUS_OPTIONS} onChange={setStatus} />
        </CardContent>
      </Card>

      {tenants.length === 0 ? (
        <EmptyState
          icon={Building2}
          title="No companies yet"
          description="Tenants appear here as soon as a company registers a workspace."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No companies match your filters"
          description="Try a different search term or status."
        />
      ) : (
        <DataTable<Tenant>
          data={rows}
          columns={[
            {
              key: "company",
              header: "Company",
              render: (t) => (
                <div>
                  <Link
                    href={`/platform-admin/companies/${t.id}`}
                    className="font-medium text-brand-blue hover:underline"
                  >
                    {t.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">{t.slug}</p>
                </div>
              ),
            },
            { key: "owner", header: "Owner", render: (t) => ownerLabel(t) },
            { key: "plan", header: "Plan", render: (t) => planLabel(t.plan_id) },
            {
              key: "status",
              header: "Status",
              render: (t) => (
                <Badge variant={STATUS_VARIANT[t.status]}>{TENANT_STATUS_LABELS[t.status]}</Badge>
              ),
            },
            { key: "users", header: "Users", render: (t) => usageFor(t.id).users },
            { key: "leads", header: "Leads", render: (t) => usageFor(t.id).leads },
            { key: "quotes", header: "Quotes", render: (t) => usageFor(t.id).quotes },
            { key: "jobs", header: "Jobs", render: (t) => usageFor(t.id).jobs },
            {
              key: "last_activity",
              header: "Last Activity",
              render: (t) => {
                const last = usageFor(t.id).lastActivity;
                return last ? formatDateTime(last) : "—";
              },
            },
            { key: "created", header: "Created", render: (t) => formatDate(t.created_at) },
            {
              key: "actions",
              header: "",
              className: "w-12 text-right",
              render: (t) => (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label={`Actions for ${t.name}`}>
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onSelect={() => router.push(`/platform-admin/companies/${t.id}`)}>
                      View Tenant
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onSelect={() => {
                        setError(null);
                        setSupportReason("");
                        setSupportTarget(t);
                      }}
                    >
                      Open Support View
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {t.status === "suspended" ? (
                      <DropdownMenuItem onSelect={() => setReactivateTarget(t)}>
                        Reactivate
                      </DropdownMenuItem>
                    ) : (
                      <DropdownMenuItem
                        className="text-red-600 focus:text-red-600"
                        onSelect={() => {
                          setSuspendReason("");
                          setError(null);
                          setSuspendTarget(t);
                        }}
                      >
                        Suspend
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ),
            },
          ]}
        />
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        Leads, quotes and jobs are counted by record ownership (<code>tenant_id</code>). Records
        created before the multi-tenant migration are counted for no tenant rather than being
        attributed to one.
      </p>

      {/* Suspend — destructive, confirmation + reason required. */}
      <Dialog
        open={!!suspendTarget}
        onOpenChange={(open) => {
          if (!open) setSuspendTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Suspend {suspendTarget?.name}?</DialogTitle>
            <DialogDescription>
              Every user of this company immediately loses access to their workspace. The reason is
              recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="suspend-reason">Reason</Label>
            <Textarea
              id="suspend-reason"
              value={suspendReason}
              onChange={(e) => setSuspendReason(e.target.value)}
              placeholder="e.g. Non-payment after 3 reminders (ticket #1420)"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuspendTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (!suspendTarget) return;
                if (suspendReason.trim().length < 5) {
                  setError("A reason of at least 5 characters is required.");
                  return;
                }
                suspendTenant(suspendTarget.id, suspendReason.trim());
                setSuspendTarget(null);
                setSuspendReason("");
                setError(null);
              }}
            >
              Suspend company
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reactivate — confirmation. */}
      <Dialog
        open={!!reactivateTarget}
        onOpenChange={(open) => {
          if (!open) setReactivateTarget(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reactivate {reactivateTarget?.name}?</DialogTitle>
            <DialogDescription>
              Access is restored for all active members of this company. The change is audited.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setReactivateTarget(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!reactivateTarget) return;
                reactivateTenant(reactivateTarget.id);
                setReactivateTarget(null);
              }}
            >
              Reactivate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Read-only support view — reason required and audited. */}
      <Dialog
        open={!!supportTarget}
        onOpenChange={(open) => {
          if (!open) {
            setSupportTarget(null);
            setError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open read-only support view</DialogTitle>
            <DialogDescription>
              You will enter {supportTarget?.name} as Platform Support. Writes are blocked, a banner
              stays visible, and every action is audited against your platform account.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="support-reason">Reason</Label>
            <Textarea
              id="support-reason"
              value={supportReason}
              onChange={(e) => setSupportReason(e.target.value)}
              placeholder="e.g. Investigating missing quote totals (ticket #1420)"
            />
            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSupportTarget(null)}>
              Cancel
            </Button>
            <Button onClick={openSupportView}>Open support view</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
