"use client";

/**
 * NON-PRODUCTION local entry to the platform console.
 *
 * ⚠️  NOT A SECURITY BOUNDARY, and deliberately hard to switch on.
 *
 * The real sign-in flow (password → TOTP → `requirePlatformAdmin()`) needs
 * Supabase. With no Supabase project configured there is no server session to
 * create, so `/platform-admin` falls back to the browser-side sandbox gate —
 * which reads `currentUserId` from the local store. Nothing in the UI could set
 * that, which left the console unreachable for local development and testing.
 * This button sets it, and nothing else.
 *
 * It renders ONLY when BOTH are true:
 *   1. `NEXT_PUBLIC_SANDBOX_MODE === "true"` — an explicit operator opt-in, and
 *   2. Supabase is not configured — so a real deployment never reaches it.
 *
 * A production build with sandbox mode off does not render this component at
 * all, and the layout uses `requirePlatformAdmin()` instead of the sandbox gate.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";

const SANDBOX_ENABLED = process.env.NEXT_PUBLIC_SANDBOX_MODE === "true";

export interface PlatformSandboxEntryProps {
  /**
   * Whether the layout is falling back to the browser-side sandbox gate.
   * Decided on the SERVER by `supabaseConfigured()` and passed down, so this
   * component can never disagree with the guard that is actually in force.
   */
  sandboxFallback: boolean;
}

export function PlatformSandboxEntry({ sandboxFallback }: PlatformSandboxEntryProps) {
  const router = useRouter();
  const users = useTenancyStore((s) => s.users);
  const signInAs = useTenancyStore((s) => s.signInAs);
  const [error, setError] = useState<string | null>(null);

  // Both gates must hold: the operator opted into sandbox mode, AND the server
  // has actually fallen back to the sandbox guard.
  if (!SANDBOX_ENABLED || !sandboxFallback) return null;

  const admin = users.find((u) => u.platform_role === "platform_super_admin");

  const enter = () => {
    if (!admin) {
      setError("No platform administrator exists in the local store.");
      return;
    }
    signInAs(admin.id);
    router.replace("/platform-admin");
    router.refresh();
  };

  return (
    <div className="mt-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-amber-300">
        <FlaskConical className="h-3.5 w-3.5" />
        Non-production sandbox
      </p>
      <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
        Supabase is not configured, so there is no real session to create. This opens the console
        against browser storage only — no password, no MFA, and no security boundary. It exists for
        local testing and never renders in a configured deployment.
      </p>
      <Button
        type="button"
        onClick={enter}
        className="mt-3 w-full bg-amber-500 text-amber-950 hover:bg-amber-400"
      >
        Enter sandbox console
        {admin ? ` as ${admin.email}` : ""}
      </Button>
      {error && <p className="mt-2 text-xs text-red-300">{error}</p>}
    </div>
  );
}
