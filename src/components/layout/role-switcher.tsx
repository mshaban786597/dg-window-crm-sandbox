"use client";

import { UserCog, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useCRMStore } from "@/lib/store/crm-store";
import { TEAM_ROLE_LABELS } from "@/lib/domain";

/**
 * "Acting as" role switcher — a SANDBOX testing aid only.
 *
 * Lets you impersonate any team member so role-based visibility (permissions,
 * cost fields, quote scope, team management) can be exercised end-to-end without
 * separate logins. Calls setActingUser(id) on the CRM store; the acting member
 * drives every `@/lib/permissions` check across the app.
 */
export function RoleSwitcher() {
  const hasHydrated = useCRMStore((s) => s._hasHydrated);
  const teamMembers = useCRMStore((s) => s.teamMembers);
  const currentId = useCRMStore((s) => s.currentTeamMemberId);
  const setActingUser = useCRMStore((s) => s.setActingUser);

  // Avoid an SSR/CSR mismatch: the acting id only exists after hydration.
  if (!hasHydrated) return null;

  const acting = teamMembers.find((m) => m.id === currentId);
  const actingName = acting ? `${acting.first_name} ${acting.last_name}`.trim() : "Select member";
  const actingRole = acting ? TEAM_ROLE_LABELS[acting.role] ?? acting.role : "—";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          title="Sandbox testing aid — switch the acting team member"
          className="flex items-center gap-2 rounded-lg border border-brand-blue/30 bg-brand-blue-light/50 px-2.5 py-1.5 text-left hover:bg-brand-blue-light"
        >
          <UserCog className="h-4 w-4 text-brand-blue" />
          <span className="hidden sm:flex sm:flex-col sm:leading-tight">
            <span className="text-[10px] uppercase tracking-wide text-brand-blue/70">Acting as</span>
            <span className="text-xs font-medium text-brand-blue-dark">
              {actingName} · {actingRole}
            </span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          <span>Acting as (sandbox)</span>
          <span className="text-xs font-normal text-muted-foreground">
            Impersonate a team member to test role-based access.
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {teamMembers.length === 0 ? (
          <DropdownMenuItem disabled>No team members</DropdownMenuItem>
        ) : (
          teamMembers.map((m) => {
            const isActive = m.id === currentId;
            return (
              <DropdownMenuItem
                key={m.id}
                onSelect={() => setActingUser(m.id)}
                className="flex items-center justify-between gap-2"
              >
                <span className="flex flex-col leading-tight">
                  <span className="text-sm">
                    {`${m.first_name} ${m.last_name}`.trim()}
                    {!m.active && <span className="ml-1 text-xs text-muted-foreground">(inactive)</span>}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {TEAM_ROLE_LABELS[m.role] ?? m.role}
                  </span>
                </span>
                {isActive && <Check className="h-4 w-4 text-brand-blue" />}
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
