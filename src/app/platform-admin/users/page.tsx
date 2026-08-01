"use client";

/**
 * Platform users (admin panel Deliverable 4).
 *
 * Lists every account known to the platform with its memberships and platform
 * role. Promotion/demotion goes through `setPlatformRole`, which requires an
 * existing super admin and refuses self-demotion — this page introduces no new
 * privilege path of its own (hard rule 2).
 */
import { useMemo, useState } from "react";
import { Search, ShieldCheck, Users } from "lucide-react";
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
import { PLATFORM_ROLES, TENANT_ROLE_LABELS } from "@/lib/tenancy/types";
import type { PlatformRole, PlatformUser } from "@/lib/tenancy/types";
import {
  ExportCsvButton,
  PaginationBar,
  fmtDateTime,
  usePagination,
} from "../_components/admin-ui";

const PLATFORM_ROLE_LABELS: Record<PlatformRole, string> = {
  platform_super_admin: "Super Admin",
  platform_support: "Support",
};

const ROLE_FILTER_OPTIONS = [
  { value: "all", label: "All users" },
  { value: "platform", label: "Platform operators" },
  ...PLATFORM_ROLES.map((r) => ({ value: r, label: PLATFORM_ROLE_LABELS[r] })),
  { value: "none", label: "Tenant users only" },
];

const ROLE_ASSIGN_OPTIONS = [
  { value: "", label: "No platform role" },
  ...PLATFORM_ROLES.map((r) => ({ value: r, label: PLATFORM_ROLE_LABELS[r] })),
];

export default function PlatformUsersPage() {
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const users = useTenancyStore((s) => s.users);
  const tenants = useTenancyStore((s) => s.tenants);
  const memberships = useTenancyStore((s) => s.memberships);
  const currentUserId = useTenancyStore((s) => s.currentUserId);
  const setPlatformRole = useTenancyStore((s) => s.setPlatformRole);
  const setPlatformUserActive = useTenancyStore((s) => s.setPlatformUserActive);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");

  const isSuperAdmin =
    users.find((u) => u.id === currentUserId)?.platform_role === "platform_super_admin";

  const membershipsFor = (userId: string) =>
    memberships.filter((m) => m.user_id === userId && m.active);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      if (roleFilter === "platform" && !u.platform_role) return false;
      if (roleFilter === "none" && u.platform_role) return false;
      if (
        roleFilter !== "all" &&
        roleFilter !== "platform" &&
        roleFilter !== "none" &&
        u.platform_role !== roleFilter
      ) {
        return false;
      }
      if (!q) return true;
      return (
        u.email.toLowerCase().includes(q) ||
        `${u.first_name} ${u.last_name}`.toLowerCase().includes(q)
      );
    });
  }, [users, search, roleFilter]);

  const pager = usePagination(rows, 25);

  if (!hasHydrated) {
    return <p className="text-sm text-muted-foreground">Loading users…</p>;
  }

  return (
    <div>
      <PageHeader
        title="Platform Users"
        description="Every account on the platform, its company memberships and platform role."
      />

      <Card className="mb-4">
        <CardContent className="grid gap-4 p-4 sm:grid-cols-[1fr_240px]">
          <div className="space-y-1.5">
            <Label htmlFor="user-search">Search</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="user-search"
                className="pl-9"
                placeholder="Name or email"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  pager.setPage(1);
                }}
              />
            </div>
          </div>
          <SelectField
            label="Role"
            value={roleFilter}
            options={ROLE_FILTER_OPTIONS}
            onChange={(v) => {
              setRoleFilter(v);
              pager.setPage(1);
            }}
          />
        </CardContent>
      </Card>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Badge variant="outline">{rows.length} matching</Badge>
        <ExportCsvButton
          rows={rows}
          filenamePrefix="platform-users"
          columns={[
            { header: "Name", value: (u) => `${u.first_name} ${u.last_name}`.trim() },
            { header: "Email", value: (u) => u.email },
            { header: "Platform Role", value: (u) => u.platform_role ?? "" },
            { header: "Email Verified", value: (u) => (u.email_verified ? "yes" : "no") },
            { header: "Active", value: (u) => (u.active === false ? "no" : "yes") },
            { header: "Companies", value: (u) => membershipsFor(u.id).length },
            { header: "Last Login", value: (u) => u.last_login_at ?? "" },
            { header: "Created", value: (u) => u.created_at },
          ]}
        />
      </div>

      {!isSuperAdmin && (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900">
          Role changes require a platform super admin. You can view this page but the controls below
          will be rejected by the store.
        </p>
      )}

      {users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Accounts appear here once a company registers or a member accepts an invitation."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No users match your filters"
          description="Try a different search term or role."
        />
      ) : (
        <Card className="overflow-hidden">
          <DataTable<PlatformUser>
            data={pager.items}
            columns={[
              {
                key: "user",
                header: "User",
                render: (u) => (
                  <div>
                    <p className="font-medium">
                      {`${u.first_name} ${u.last_name}`.trim() || u.email}
                    </p>
                    <p className="text-xs text-muted-foreground">{u.email}</p>
                  </div>
                ),
              },
              {
                key: "platform_role",
                header: "Platform role",
                render: (u) =>
                  u.platform_role ? (
                    <Badge variant="default">
                      <ShieldCheck className="mr-1 h-3 w-3" />
                      {PLATFORM_ROLE_LABELS[u.platform_role]}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
              },
              {
                key: "memberships",
                header: "Companies",
                render: (u) => {
                  const mine = membershipsFor(u.id);
                  if (mine.length === 0) return <span className="text-muted-foreground">—</span>;
                  return (
                    <div className="space-y-0.5">
                      {mine.slice(0, 3).map((m) => (
                        <p key={m.id} className="text-xs">
                          {tenants.find((t) => t.id === m.tenant_id)?.name ?? m.tenant_id}
                          <span className="text-muted-foreground">
                            {" "}
                            · {TENANT_ROLE_LABELS[m.role]}
                          </span>
                        </p>
                      ))}
                      {mine.length > 3 && (
                        <p className="text-xs text-muted-foreground">
                          +{mine.length - 3} more
                        </p>
                      )}
                    </div>
                  );
                },
              },
              {
                key: "verified",
                header: "Verified",
                render: (u) => (
                  <Badge variant={u.email_verified ? "success" : "warning"}>
                    {u.email_verified ? "Yes" : "No"}
                  </Badge>
                ),
              },
              {
                key: "state",
                header: "Account",
                render: (u) => (
                  <Badge variant={u.active === false ? "danger" : "success"}>
                    {u.active === false ? "Deactivated" : "Active"}
                  </Badge>
                ),
              },
              {
                key: "last_login",
                header: "Last login",
                render: (u) => fmtDateTime(u.last_login_at),
              },
              { key: "created", header: "Created", render: (u) => fmtDateTime(u.created_at) },
              {
                key: "actions",
                header: "Manage",
                className: "w-72",
                render: (u) => {
                  const self = u.id === currentUserId;
                  return (
                    <div className="flex items-center gap-2">
                      <SelectField
                        aria-label={`Platform role for ${u.email}`}
                        value={u.platform_role ?? ""}
                        options={ROLE_ASSIGN_OPTIONS}
                        disabled={!isSuperAdmin || self}
                        onChange={(v) =>
                          setPlatformRole(u.id, v === "" ? undefined : (v as PlatformRole))
                        }
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!isSuperAdmin || self}
                        onClick={() => setPlatformUserActive(u.id, u.active === false)}
                      >
                        {u.active === false ? "Reactivate" : "Deactivate"}
                      </Button>
                    </div>
                  );
                },
              },
            ]}
          />
          <PaginationBar
            page={pager.page}
            totalPages={pager.totalPages}
            total={pager.total}
            perPage={pager.perPage}
            onPage={pager.setPage}
            onPerPage={pager.setPerPage}
            label="users"
          />
        </Card>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        You cannot change your own platform role or deactivate your own account — that would leave
        the console with no reachable administrator. Every change is written to the audit log.
      </p>
    </div>
  );
}
