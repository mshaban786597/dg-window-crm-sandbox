"use client";

/**
 * Reusable work-assignment dialog (§14).
 *
 * Assignment is a TENANT-SCOPED operation:
 *   - candidates come only from the ACTIVE tenant's memberships
 *   - candidates are further narrowed to `assignableMemberships()`
 *     (active + accepted) so deactivated or still-pending users can never
 *     receive new work
 *   - `canAssignWorkTo()` is the authority on whether the acting session may
 *     assign to the selected member (managers are limited to themselves and
 *     their direct reports); its rejection reason is shown inline
 *
 * This component OWNS the audit trail for the assignment, but not the
 * persistence: the caller receives `onAssigned(membershipId)` and writes the
 * assignment into its own module (leads store, jobs store, API, ...).
 */

import { useMemo, useState } from "react";
import { UserCheck, ShieldAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";

import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { useTenancySession } from "@/lib/tenancy/use-tenancy-session";
import { assignableMemberships, canAssignWorkTo } from "@/lib/tenancy/authz";
import { TENANT_ROLE_LABELS } from "@/lib/tenancy/types";
import type { AuditAction, PlatformUser, TenantMembership } from "@/lib/tenancy/types";

/** Entity kinds that have a dedicated `*.assigned` audit action. */
export type AssignableEntityType = "lead" | "job";

const AUDIT_ACTION: Record<AssignableEntityType, Extract<AuditAction, "lead.assigned" | "job.assigned">> = {
  lead: "lead.assigned",
  job: "job.assigned",
};

const ENTITY_LABEL: Record<AssignableEntityType, string> = {
  lead: "Lead",
  job: "Job",
};

export interface AssignWorkDialogProps {
  entityType: AssignableEntityType;
  entityId: string;
  /** Membership id of the current assignee, if any. */
  currentAssigneeId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Persist the assignment in the caller's own module. */
  onAssigned: (membershipId: string) => void;
}

const memberLabel = (
  membership: TenantMembership,
  user: PlatformUser | undefined
): string => {
  const name = user ? `${user.first_name} ${user.last_name}`.trim() || user.email : "Member";
  return `${name} — ${TENANT_ROLE_LABELS[membership.role]}`;
};

export function AssignWorkDialog({
  entityType,
  entityId,
  currentAssigneeId,
  open,
  onOpenChange,
  onAssigned,
}: AssignWorkDialogProps) {
  const session = useTenancySession();
  const allMemberships = useTenancyStore((s) => s.memberships);
  const users = useTenancyStore((s) => s.users);

  // Seeded once from the current assignee. Callers that reuse a single mounted
  // instance across entities should pass `key={entityId}` to reset the picker.
  const [selectedId, setSelectedId] = useState<string>(currentAssigneeId ?? "");

  const tenantId = session?.tenant?.id;

  const usersById = useMemo(() => new Map(users.map((u) => [u.id, u] as const)), [users]);

  // Same-tenant candidates only — cross-tenant assignment is impossible here.
  const tenantMemberships = useMemo(
    () => (tenantId ? allMemberships.filter((m) => m.tenant_id === tenantId) : []),
    [allMemberships, tenantId]
  );

  const candidates = useMemo(
    () => assignableMemberships(tenantMemberships),
    [tenantMemberships]
  );

  const target = candidates.find((m) => m.id === selectedId);
  const check = canAssignWorkTo(session, target, tenantMemberships);

  const options = [
    { value: "", label: "Select a team member..." },
    ...candidates.map((m) => ({
      value: m.id,
      label: memberLabel(m, usersById.get(m.user_id)),
    })),
  ];

  const assign = () => {
    if (!target || !check.ok || !tenantId) return;
    useTenancyStore.getState().logAudit({
      action: AUDIT_ACTION[entityType],
      tenant_id: tenantId,
      entity_type: entityType,
      entity_id: entityId,
      metadata: { assigned_to: target.id },
    });
    onAssigned(target.id);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Assign {ENTITY_LABEL[entityType]}</DialogTitle>
          <DialogDescription>
            Only active members of {session?.tenant?.name ?? "this workspace"} can receive new work.
          </DialogDescription>
        </DialogHeader>

        {!tenantId ? (
          <EmptyState
            icon={ShieldAlert}
            title="No active workspace"
            description="Assignment requires an active tenant membership."
          />
        ) : candidates.length === 0 ? (
          <EmptyState
            icon={UserCheck}
            title="No assignable members"
            description="Invite a teammate, or reactivate a member, before assigning work."
          />
        ) : (
          <div className="space-y-3">
            <SelectField
              label="Assign to"
              options={options}
              value={selectedId}
              onChange={setSelectedId}
            />
            {selectedId && !check.ok && (
              <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {check.reason ?? "You are not permitted to assign this work."}
              </p>
            )}
            {currentAssigneeId && (
              <p className="text-xs text-muted-foreground">
                Currently assigned to{" "}
                {(() => {
                  const cur = tenantMemberships.find((m) => m.id === currentAssigneeId);
                  return cur ? memberLabel(cur, usersById.get(cur.user_id)) : "an unknown member";
                })()}
                .
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            className="bg-primary hover:bg-brand-blue-dark"
            disabled={!selectedId || !check.ok}
            onClick={assign}
          >
            <UserCheck className="h-4 w-4" />
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
