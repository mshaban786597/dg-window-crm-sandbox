"use client";

/**
 * Workspace switcher (§10).
 *
 * Lists only the tenants the signed-in user has an ACTIVE, ACCEPTED membership
 * in (`listWorkspaces`), and switching goes through `switchWorkspace`, which
 * re-verifies that membership before the active tenant changes — a proposed
 * tenant id is never trusted on its own. Renders nothing for single-workspace
 * users so the header is unchanged for the common case.
 *
 * UX only: the server re-resolves the active tenant on every request.
 */

import { useRouter } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { Building2, Check, ChevronsUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { TENANT_ROLE_LABELS } from "@/lib/tenancy/types";

export function WorkspaceSwitcher() {
  const router = useRouter();
  // Subscribe to the slices `listWorkspaces` reads so the list stays live
  // without using a snapshot-returning selector (see use-tenancy-session).
  const store = useTenancyStore(
    useShallow((s) => ({
      listWorkspaces: s.listWorkspaces,
      switchWorkspace: s.switchWorkspace,
      tenants: s.tenants,
      memberships: s.memberships,
      currentUserId: s.currentUserId,
      activeTenantId: s.activeTenantId,
      hasHydrated: s._hasHydrated,
    }))
  );

  if (!store.hasHydrated) return null;

  const workspaces = store.listWorkspaces();
  if (workspaces.length < 2) return null;

  const active = workspaces.find((w) => w.tenant.id === store.activeTenantId);

  const select = (tenantId: string) => {
    if (tenantId === store.activeTenantId) return;
    if (!store.switchWorkspace(tenantId)) return;
    router.push("/app/dashboard");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex max-w-[220px] items-center gap-2 rounded-lg border border-border px-2.5 py-1.5 text-sm hover:bg-muted"
          aria-label="Switch workspace"
        >
          <Building2 className="h-4 w-4 shrink-0 text-brand-blue" />
          <span className="hidden truncate font-medium md:inline">
            {active ? active.tenant.name : "Select workspace"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Workspaces</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {workspaces.map(({ tenant, membership }) => (
          <DropdownMenuItem
            key={tenant.id}
            onSelect={() => select(tenant.id)}
            className="flex items-start gap-2"
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{tenant.name}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {TENANT_ROLE_LABELS[membership.role]}
              </span>
            </span>
            {tenant.id === store.activeTenantId && (
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-blue" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
