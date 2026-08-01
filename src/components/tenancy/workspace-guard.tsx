"use client";

/**
 * Client workspace access guard (§24).
 *
 * Blocks the entire /app area when the signed-in user has no usable workspace:
 * suspended/cancelled tenant, deactivated membership, or an invitation that was
 * never accepted. Data is already scoped at the store boundary, but a suspended
 * user must be told they are blocked rather than shown an empty CRM.
 *
 * UX ONLY. The authoritative checks are `requireTenantSession()` on the server
 * and the RLS policies in Postgres.
 */
import Link from "next/link";
import { Ban, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { useTenancySession } from "@/lib/tenancy/use-tenancy-session";

export function WorkspaceGuard({ children }: { children: React.ReactNode }) {
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const tenants = useTenancyStore((s) => s.tenants);
  const memberships = useTenancyStore((s) => s.memberships);
  const activeTenantId = useTenancyStore((s) => s.activeTenantId);
  const session = useTenancySession();

  // Before hydration render nothing rather than flashing a denial.
  if (!hasHydrated) return null;

  // No tenancy set up at all → this is the pre-tenant local sandbox; let the
  // existing single-workspace CRM keep working (it is documented non-production).
  if (tenants.length === 0) return <>{children}</>;

  // Signed in with a usable workspace.
  if (session?.tenant && session.membership) return <>{children}</>;

  // A tenant was selected but the session did not validate → explain why.
  const attempted = tenants.find((t) => t.id === activeTenantId);
  const membership = memberships.find(
    (m) => m.tenant_id === activeTenantId && m.user_id === session?.user?.id
  );

  let title = "No workspace selected";
  let message = "Choose a workspace to continue, or sign in with an account that has one.";

  if (attempted?.status === "suspended") {
    title = "This workspace is suspended";
    message =
      "Access to this company's workspace has been suspended. Please contact your administrator or platform support.";
  } else if (attempted?.status === "cancelled") {
    title = "This workspace is closed";
    message = "This company's workspace has been closed and is no longer accessible.";
  } else if (membership && !membership.active) {
    title = "Your access was disabled";
    message = "Your membership in this workspace is inactive. Contact a workspace administrator.";
  } else if (membership && membership.invitation_status !== "accepted") {
    title = "Invitation not accepted";
    message = "Accept your invitation to join this workspace before continuing.";
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-50 text-red-600">
          <Ban className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-semibold text-foreground">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Button variant="outline" asChild>
            <Link href="/login">
              <Building2 className="mr-1 h-4 w-4" />
              Switch account
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
