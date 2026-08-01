/**
 * Server-side session + tenant resolution (§2, §10, §24).
 *
 * The active tenant is NEVER taken from localStorage or a raw client value.
 * A client may *propose* a tenant id (cookie/header), but it is only accepted
 * after the server re-verifies an ACTIVE, ACCEPTED membership for the
 * authenticated user in a non-suspended tenant.
 */
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { supabaseConfigured as supabaseEnvConfigured } from "@/lib/supabase/env";
import type {
  ActiveSession,
  PlatformUser,
  SupportSession,
  Tenant,
  TenantMembership,
} from "./types";
import { isSupportSessionActive } from "./audit";

export const ACTIVE_TENANT_COOKIE = "dg_active_tenant";
export const SUPPORT_SESSION_COOKIE = "dg_support_session";

function supabaseConfigured(): boolean {
  return supabaseEnvConfigured();
}

/**
 * Resolve the caller's session server-side.
 * Returns null when unauthenticated or when Supabase is not configured
 * (local sandbox mode — see SANDBOX note in tenancy/types.ts).
 */
export async function getServerSession(): Promise<ActiveSession | null> {
  if (!supabaseConfigured()) return null;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return null;

  const { data: profile } = await supabase
    .from("app_users")
    .select("*")
    .eq("id", authUser.id)
    .maybeSingle();
  if (!profile) return null;
  const user = profile as PlatformUser;

  // Proposed tenant from cookie — untrusted until verified below.
  const jar = await cookies();
  const proposedTenantId = jar.get(ACTIVE_TENANT_COOKIE)?.value;

  // Only ACTIVE + ACCEPTED memberships count (RLS enforces this too).
  const { data: memberships } = await supabase
    .from("tenant_memberships")
    .select("*")
    .eq("user_id", authUser.id)
    .eq("active", true)
    .eq("invitation_status", "accepted");

  const list = (memberships ?? []) as TenantMembership[];
  const membership =
    list.find((m) => m.tenant_id === proposedTenantId) ?? (list.length === 1 ? list[0] : undefined);

  if (!membership) return { user };

  const { data: tenantRow } = await supabase
    .from("tenants")
    .select("*")
    .eq("id", membership.tenant_id)
    .maybeSingle();
  const tenant = (tenantRow ?? undefined) as Tenant | undefined;

  // Suspended/cancelled tenants lose workspace access entirely (§24).
  if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") {
    return { user };
  }

  // Optional platform-support session overlay (§26).
  let support: SupportSession | undefined;
  const supportId = jar.get(SUPPORT_SESSION_COOKIE)?.value;
  if (supportId && user.platform_role) {
    const { data: s } = await supabase
      .from("support_sessions")
      .select("*")
      .eq("id", supportId)
      .maybeSingle();
    const candidate = (s ?? undefined) as SupportSession | undefined;
    if (
      candidate &&
      candidate.tenant_id === tenant.id &&
      candidate.platform_user_id === user.id &&
      isSupportSessionActive(candidate)
    ) {
      support = candidate;
    }
  }

  return { user, tenant, membership, support };
}

/** All tenants the user may switch into (§10 workspace switcher). */
export async function getUserWorkspaces(
  userId: string
): Promise<{ tenant: Tenant; membership: TenantMembership }[]> {
  if (!supabaseConfigured()) return [];
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("tenant_memberships")
    .select("*, tenants(*)")
    .eq("user_id", userId)
    .eq("active", true)
    .eq("invitation_status", "accepted");

  return ((data ?? []) as unknown as (TenantMembership & { tenants: Tenant })[])
    .filter((row) => row.tenants && !["suspended", "cancelled"].includes(row.tenants.status))
    .map((row) => ({ tenant: row.tenants, membership: row }));
}

/**
 * Switch the active workspace. Verifies membership BEFORE writing the cookie —
 * a forged cookie can never grant access because getServerSession re-verifies.
 */
export async function setActiveTenant(userId: string, tenantId: string): Promise<boolean> {
  const workspaces = await getUserWorkspaces(userId);
  if (!workspaces.some((w) => w.tenant.id === tenantId)) return false;
  const jar = await cookies();
  jar.set(ACTIVE_TENANT_COOKIE, tenantId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return true;
}
