"use client";

/**
 * Global audit log viewer (§18).
 *
 * Cross-tenant, newest first. The actor column always shows the REAL
 * authenticated user; impersonated tenant users are shown separately so the
 * trail can never be mistaken for the tenant acting on its own.
 */
import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ScrollText, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { DataTable } from "@/components/shared/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import type { AuditLogEntry } from "@/lib/tenancy/types";
import { formatDateTime } from "@/lib/utils";

export default function PlatformAuditPage() {
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const auditLogs = useTenancyStore((s) => s.auditLogs);
  const tenants = useTenancyStore((s) => s.tenants);
  const users = useTenancyStore((s) => s.users);

  const [tenantFilter, setTenantFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [actorFilter, setActorFilter] = useState("");

  const tenantOptions = useMemo(
    () => [
      { value: "all", label: "All tenants" },
      { value: "platform", label: "Platform-only events" },
      ...tenants.map((t) => ({ value: t.id, label: t.name })),
    ],
    [tenants]
  );

  // Only actions that actually occurred are offered as filters.
  const actionOptions = useMemo(() => {
    const seen = Array.from(new Set(auditLogs.map((l) => l.action))).sort();
    return [{ value: "all", label: "All actions" }, ...seen.map((a) => ({ value: a, label: a }))];
  }, [auditLogs]);

  const labelForUser = useCallback(
    (userId: string | undefined): string => {
      if (!userId) return "—";
      const u = users.find((x) => x.id === userId);
      if (!u) return userId;
      const name = `${u.first_name} ${u.last_name}`.trim();
      return name ? `${name} (${u.email})` : u.email;
    },
    [users]
  );

  const tenantName = (tenantId: string | null): React.ReactNode => {
    if (!tenantId) return <span className="text-muted-foreground">Platform</span>;
    const t = tenants.find((x) => x.id === tenantId);
    if (!t) return tenantId;
    return (
      <Link href={`/platform-admin/companies/${t.id}`} className="text-brand-blue hover:underline">
        {t.name}
      </Link>
    );
  };

  const rows = useMemo<AuditLogEntry[]>(() => {
    const actor = actorFilter.trim().toLowerCase();
    return auditLogs
      .filter((l) => {
        if (tenantFilter === "platform" && l.tenant_id !== null) return false;
        if (tenantFilter !== "all" && tenantFilter !== "platform" && l.tenant_id !== tenantFilter) {
          return false;
        }
        if (actionFilter !== "all" && l.action !== actionFilter) return false;
        if (actor) {
          const haystack =
            `${labelForUser(l.actor_user_id)} ${labelForUser(l.impersonated_user_id)} ${l.actor_role}`.toLowerCase();
          if (!haystack.includes(actor)) return false;
        }
        return true;
      })
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [auditLogs, labelForUser, tenantFilter, actionFilter, actorFilter]);

  const filtersActive = tenantFilter !== "all" || actionFilter !== "all" || actorFilter !== "";

  if (!hasHydrated) {
    return <p className="text-sm text-muted-foreground">Loading audit log…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Audit Logs"
        description="Immutable record of tenant and platform activity across the deployment."
      />

      <Card className="mb-6">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <SelectField
            label="Tenant"
            value={tenantFilter}
            options={tenantOptions}
            onChange={setTenantFilter}
          />
          <SelectField
            label="Action"
            value={actionFilter}
            options={actionOptions}
            onChange={setActionFilter}
          />
          <div className="space-y-1.5">
            <Label htmlFor="actor">Actor</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="actor"
                className="pl-9"
                placeholder="Name, email or role"
                value={actorFilter}
                onChange={(e) => setActorFilter(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-end">
            <Button
              variant="outline"
              className="w-full"
              disabled={!filtersActive}
              onClick={() => {
                setTenantFilter("all");
                setActionFilter("all");
                setActorFilter("");
              }}
            >
              Clear filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {auditLogs.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title="No audit entries yet"
          description="Registrations, role changes, suspensions and support sessions all appear here."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No entries match your filters"
          description="Try widening the tenant, action or actor filter."
        />
      ) : (
        <DataTable<AuditLogEntry>
          data={rows}
          columns={[
            { key: "when", header: "Timestamp", render: (l) => formatDateTime(l.created_at) },
            { key: "tenant", header: "Tenant", render: (l) => tenantName(l.tenant_id) },
            {
              key: "actor",
              header: "Actor (real)",
              render: (l) => (
                <div>
                  <p>{labelForUser(l.actor_user_id)}</p>
                  <p className="text-xs text-muted-foreground">{l.actor_role}</p>
                </div>
              ),
            },
            {
              key: "acting_as",
              header: "Acting as",
              render: (l) =>
                l.impersonated_user_id ? (
                  <Badge variant="warning">{labelForUser(l.impersonated_user_id)}</Badge>
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
    </div>
  );
}
