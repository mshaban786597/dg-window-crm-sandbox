"use client";

/**
 * NON-PRODUCTION fallback gate for `/platform-admin`.
 *
 * ⚠️ This path runs ONLY when Supabase is not configured (`supabaseConfigured()
 * === false`), i.e. local development against the browser sandbox store. There
 * is no server session to check, so access is decided in the browser — which is
 * fully readable and writable by the end user and is therefore NOT a security
 * boundary. The shell labels itself accordingly.
 *
 * With Supabase configured, the server layout never renders this component; it
 * uses `requirePlatformAdmin()` instead.
 */

import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { useTenancySession } from "@/lib/tenancy/use-tenancy-session";
import { isPlatformAdmin } from "@/lib/tenancy/authz";
import { PlatformAccessDenied } from "./access-denied";
import { PlatformAdminShell } from "./platform-admin-shell";

export function PlatformAdminSandboxGate({ children }: { children: React.ReactNode }) {
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const sandboxSignOut = useTenancyStore((s) => s.signOut);
  const session = useTenancySession();

  // Avoid flashing either the shell or the denial screen before rehydration.
  if (!hasHydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <p className="text-sm text-slate-400">Loading platform console…</p>
      </div>
    );
  }

  const user = session?.user;
  if (!user || !isPlatformAdmin(user)) {
    return <PlatformAccessDenied />;
  }

  return (
    <PlatformAdminShell
      mode="sandbox"
      user={{ first_name: user.first_name, last_name: user.last_name, email: user.email }}
      onSandboxSignOut={sandboxSignOut}
    >
      {children}
    </PlatformAdminShell>
  );
}
