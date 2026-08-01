"use client";

/**
 * Local sandbox tenancy store (§12 "local sandbox mode ... clearly label it
 * non-production").
 *
 * ⚠️  NOT A SECURITY BOUNDARY.
 * This store lives in browser localStorage, which the end user can read and
 * edit freely. It exists so the multi-tenant UX, roles, invitations, audit
 * trail and support sessions can be exercised without a database. Real tenant
 * isolation is enforced by Postgres RLS + server guards (see
 * supabase/migrations/0003_multi_tenant.sql, lib/tenancy/guards.ts).
 *
 * The selectors below mirror the RLS predicates exactly so behaviour is
 * identical once Supabase is connected.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  ActiveSession,
  AuditLogEntry,
  PlatformUser,
  SupportMode,
  SupportSession,
  SystemEvent,
  Tenant,
  TenantInvitation,
  TenantMembership,
  TenantRole,
  OnboardingStep,
} from "./types";
import { buildAuditEntry, endSupportSession, isSupportSessionActive, startSupportSession } from "./audit";
import type { AuditInput } from "./audit";
import { wouldCreateManagerCycle } from "./authz";

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
const now = () => new Date().toISOString();

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

/**
 * Derive the stored hash for an invitation token (§9 — only the hash is ever
 * persisted). Exported so the acceptance page cannot drift from the store's
 * derivation. Sandbox-grade only; the server uses SHA-256 via lib/tokens.ts.
 */
export function hashInviteToken(token: string): string | null {
  try {
    return `sha256:${btoa(token).slice(0, 44)}`;
  } catch {
    return null; // malformed / non-Latin1 token
  }
}

export interface RegisterTenantInput {
  first_name: string;
  last_name: string;
  email: string;
  company_name: string;
  phone?: string;
  website?: string;
  country?: string;
  state?: string;
  timezone?: string;
  accepted_terms: boolean;
}

interface TenancyState {
  _hasHydrated: boolean;
  users: PlatformUser[];
  tenants: Tenant[];
  memberships: TenantMembership[];
  invitations: TenantInvitation[];
  auditLogs: AuditLogEntry[];
  supportSessions: SupportSession[];
  systemEvents: SystemEvent[];
  /** Who is signed in (sandbox). */
  currentUserId: string | null;
  /** Proposed active tenant — always re-verified by resolveSession(). */
  activeTenantId: string | null;
  activeSupportSessionId: string | null;

  setHasHydrated: (v: boolean) => void;
  resolveSession: () => ActiveSession | null;
  signInAs: (userId: string) => void;
  signOut: () => void;
  switchWorkspace: (tenantId: string) => boolean;
  listWorkspaces: (userId?: string) => { tenant: Tenant; membership: TenantMembership }[];

  registerTenant: (input: RegisterTenantInput) => { tenant: Tenant; user: PlatformUser } | null;
  completeOnboardingStep: (step: OnboardingStep) => void;

  inviteMember: (email: string, role: TenantRole, managerMembershipId?: string) => { invitation: TenantInvitation; token: string } | null;
  acceptInvitation: (token: string, user: { first_name: string; last_name: string; email: string }) => { ok: boolean; reason?: string };
  revokeInvitation: (invitationId: string) => void;

  updateMembership: (membershipId: string, patch: Partial<TenantMembership>) => { ok: boolean; reason?: string };
  deactivateMembership: (membershipId: string) => void;

  suspendTenant: (tenantId: string, reason: string) => void;
  reactivateTenant: (tenantId: string) => void;

  startSupport: (tenantId: string, mode: SupportMode, reason: string) => { ok: boolean; reason?: string };
  endSupport: () => void;

  logAudit: (input: AuditInput) => void;
  bootstrapPlatformAdmin: (email: string) => boolean;
}

/** Deterministic sandbox seed: one platform admin, zero tenants (§5). */
const SEED_PLATFORM_ADMIN: PlatformUser = {
  id: "user-platform-admin",
  email: process.env.NEXT_PUBLIC_PLATFORM_ADMIN_EMAIL || "platform-admin@windowcrm.local",
  first_name: "Platform",
  last_name: "Admin",
  platform_role: "platform_super_admin",
  email_verified: true,
  created_at: "2024-01-01T00:00:00Z",
};

export const useTenancyStore = create<TenancyState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      users: [SEED_PLATFORM_ADMIN],
      tenants: [],
      memberships: [],
      invitations: [],
      auditLogs: [],
      supportSessions: [],
      systemEvents: [],
      currentUserId: null,
      activeTenantId: null,
      activeSupportSessionId: null,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      // ── Session resolution (mirrors server getServerSession) ──────
      resolveSession: () => {
        const s = get();
        const user = s.users.find((u) => u.id === s.currentUserId);
        if (!user) return null;

        const membership = s.memberships.find(
          (m) =>
            m.tenant_id === s.activeTenantId &&
            m.user_id === user.id &&
            m.active &&
            m.invitation_status === "accepted"
        );
        if (!membership) return { user };

        const tenant = s.tenants.find((t) => t.id === membership.tenant_id);
        // Suspended/cancelled tenants lose workspace access (§24).
        if (!tenant || tenant.status === "suspended" || tenant.status === "cancelled") {
          return { user };
        }

        let support: SupportSession | undefined;
        const candidate = s.supportSessions.find((x) => x.id === s.activeSupportSessionId);
        if (
          candidate &&
          user.platform_role &&
          candidate.tenant_id === tenant.id &&
          candidate.platform_user_id === user.id &&
          isSupportSessionActive(candidate)
        ) {
          support = candidate;
        }
        return { user, tenant, membership, support };
      },

      signInAs: (userId) => set({ currentUserId: userId, activeTenantId: null, activeSupportSessionId: null }),
      signOut: () => set({ currentUserId: null, activeTenantId: null, activeSupportSessionId: null }),

      listWorkspaces: (userId) => {
        const s = get();
        const id = userId ?? s.currentUserId;
        if (!id) return [];
        return s.memberships
          .filter((m) => m.user_id === id && m.active && m.invitation_status === "accepted")
          .map((m) => ({ tenant: s.tenants.find((t) => t.id === m.tenant_id)!, membership: m }))
          .filter((w) => w.tenant && !["suspended", "cancelled"].includes(w.tenant.status));
      },

      /** Verifies membership BEFORE accepting the proposed tenant (§10). */
      switchWorkspace: (tenantId) => {
        const allowed = get().listWorkspaces().some((w) => w.tenant.id === tenantId);
        if (!allowed) return false;
        set({ activeTenantId: tenantId, activeSupportSessionId: null });
        return true;
      },

      // ── §5 Registration ──────────────────────────────────────────
      registerTenant: (input) => {
        if (!input.accepted_terms) return null;
        const email = input.email.trim().toLowerCase();
        const s = get();
        let user = s.users.find((u) => u.email.toLowerCase() === email);
        if (!user) {
          user = {
            id: uid("user"),
            email,
            first_name: input.first_name,
            last_name: input.last_name,
            phone: input.phone,
            email_verified: true, // sandbox: verification simulated
            created_at: now(),
          };
        }
        // Never allow a registration payload to grant a platform role (§3).
        const safeUser: PlatformUser = { ...user, platform_role: user.platform_role };

        let slug = slugify(input.company_name) || "workspace";
        if (s.tenants.some((t) => t.slug === slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;

        const tenant: Tenant = {
          id: uid("tenant"),
          name: input.company_name.trim(),
          slug,
          status: "trial",
          owner_user_id: safeUser.id,
          timezone: input.timezone || "America/New_York",
          currency: "USD",
          country: input.country,
          state: input.state,
          phone: input.phone,
          website: input.website,
          onboarding_status: "not_started",
          onboarding_completed_steps: [],
          trial_ends_at: new Date(Date.now() + 14 * 86400_000).toISOString(),
          created_at: now(),
        };

        const membership: TenantMembership = {
          id: uid("mem"),
          tenant_id: tenant.id,
          user_id: safeUser.id,
          role: "tenant_owner",
          active: true,
          invitation_status: "accepted",
          accepted_at: now(),
          created_at: now(),
        };

        set((st) => ({
          users: st.users.some((u) => u.id === safeUser.id) ? st.users : [...st.users, safeUser],
          tenants: [...st.tenants, tenant],
          memberships: [...st.memberships, membership],
          currentUserId: safeUser.id,
          activeTenantId: tenant.id,
        }));

        get().logAudit({
          action: "tenant.registered",
          tenant_id: tenant.id,
          entity_type: "tenant",
          entity_id: tenant.id,
          metadata: { company: tenant.name },
        });
        return { tenant, user: safeUser };
      },

      completeOnboardingStep: (step) => {
        const session = get().resolveSession();
        if (!session?.tenant) return;
        set((st) => ({
          tenants: st.tenants.map((t) => {
            if (t.id !== session.tenant!.id) return t;
            const steps = Array.from(new Set([...t.onboarding_completed_steps, step]));
            return {
              ...t,
              onboarding_completed_steps: steps,
              onboarding_status: steps.includes("review") ? "completed" : "in_progress",
              updated_at: now(),
            };
          }),
        }));
      },

      // ── §9 Invitations ───────────────────────────────────────────
      inviteMember: (email, role, managerMembershipId) => {
        const session = get().resolveSession();
        if (!session?.tenant || !session.membership) return null;
        if (!["tenant_owner", "tenant_admin"].includes(session.membership.role)) return null;

        // Sandbox token: random, and only its "hash" is stored.
        const token = uid("invtok") + Math.random().toString(36).slice(2, 12);
        const token_hash = hashInviteToken(token);
        if (!token_hash) return null;
        const invitation: TenantInvitation = {
          id: uid("inv"),
          tenant_id: session.tenant.id,
          email: email.trim().toLowerCase(),
          role,
          manager_membership_id: managerMembershipId,
          token_hash,
          status: "pending",
          invited_by_user_id: session.user.id,
          expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
          created_at: now(),
        };
        set((st) => ({ invitations: [invitation, ...st.invitations] }));
        get().logAudit({
          action: "user.invited",
          tenant_id: session.tenant.id,
          entity_type: "invitation",
          entity_id: invitation.id,
          metadata: { email: invitation.email, role },
        });
        return { invitation, token };
      },

      acceptInvitation: (token, userInput) => {
        const token_hash = hashInviteToken(token);
        if (!token_hash) return { ok: false, reason: "invalid" };
        const s = get();
        const inv = s.invitations.find((i) => i.token_hash === token_hash);
        if (!inv) return { ok: false, reason: "invalid" };
        if (inv.status !== "pending") return { ok: false, reason: "already_used" };
        if (new Date(inv.expires_at) < new Date()) {
          set((st) => ({
            invitations: st.invitations.map((i) => (i.id === inv.id ? { ...i, status: "expired" as const } : i)),
          }));
          return { ok: false, reason: "expired" };
        }

        const email = userInput.email.trim().toLowerCase();
        let user = s.users.find((u) => u.email.toLowerCase() === email);
        if (!user) {
          user = {
            id: uid("user"),
            email,
            first_name: userInput.first_name,
            last_name: userInput.last_name,
            email_verified: true,
            created_at: now(),
          };
        }
        const membership: TenantMembership = {
          id: uid("mem"),
          tenant_id: inv.tenant_id,
          user_id: user.id,
          role: inv.role,
          manager_membership_id: inv.manager_membership_id,
          active: true,
          invitation_status: "accepted",
          invited_by: inv.invited_by_user_id,
          invited_at: inv.created_at,
          accepted_at: now(),
          created_at: now(),
        };

        set((st) => ({
          users: st.users.some((u) => u.id === user!.id) ? st.users : [...st.users, user!],
          memberships: [...st.memberships, membership],
          invitations: st.invitations.map((i) =>
            i.id === inv.id ? { ...i, status: "accepted" as const, accepted_at: now() } : i
          ),
          currentUserId: user!.id,
          activeTenantId: inv.tenant_id,
        }));

        get().logAudit({
          action: "user.invitation_accepted",
          tenant_id: inv.tenant_id,
          entity_type: "membership",
          entity_id: membership.id,
          metadata: { email },
        });
        return { ok: true };
      },

      revokeInvitation: (invitationId) => {
        set((st) => ({
          invitations: st.invitations.map((i) =>
            i.id === invitationId ? { ...i, status: "revoked" as const } : i
          ),
        }));
        get().logAudit({ action: "user.invitation_revoked", entity_type: "invitation", entity_id: invitationId });
      },

      // ── §8 Team management ───────────────────────────────────────
      updateMembership: (membershipId, patch) => {
        const s = get();
        const session = s.resolveSession();
        const target = s.memberships.find((m) => m.id === membershipId);
        if (!session?.tenant || !target) return { ok: false, reason: "Not found" };
        if (target.tenant_id !== session.tenant.id) return { ok: false, reason: "Cross-tenant denied" };
        if (!session.membership || !["tenant_owner", "tenant_admin"].includes(session.membership.role)) {
          return { ok: false, reason: "Not permitted" };
        }
        if (
          patch.manager_membership_id !== undefined &&
          wouldCreateManagerCycle(
            s.memberships.filter((m) => m.tenant_id === session.tenant!.id),
            membershipId,
            patch.manager_membership_id ?? undefined
          )
        ) {
          return { ok: false, reason: "That manager assignment would create a cycle" };
        }
        set((st) => ({
          memberships: st.memberships.map((m) =>
            m.id === membershipId ? { ...m, ...patch, updated_at: now() } : m
          ),
        }));
        if (patch.role) {
          get().logAudit({
            action: "user.role_changed",
            tenant_id: session.tenant.id,
            entity_type: "membership",
            entity_id: membershipId,
            metadata: { role: patch.role },
          });
        }
        if (patch.manager_membership_id !== undefined) {
          get().logAudit({
            action: "user.manager_assigned",
            tenant_id: session.tenant.id,
            entity_type: "membership",
            entity_id: membershipId,
          });
        }
        return { ok: true };
      },

      deactivateMembership: (membershipId) => {
        const session = get().resolveSession();
        set((st) => ({
          memberships: st.memberships.map((m) =>
            m.id === membershipId ? { ...m, active: false, updated_at: now() } : m
          ),
        }));
        get().logAudit({
          action: "user.deactivated",
          tenant_id: session?.tenant?.id,
          entity_type: "membership",
          entity_id: membershipId,
        });
      },

      // ── §16 Tenant lifecycle (platform admin) ────────────────────
      suspendTenant: (tenantId, reason) => {
        const s = get();
        if (!s.users.find((u) => u.id === s.currentUserId)?.platform_role) return;
        set((st) => ({
          tenants: st.tenants.map((t) =>
            t.id === tenantId ? { ...t, status: "suspended" as const, suspended_at: now() } : t
          ),
        }));
        get().logAudit({
          action: "tenant.suspended",
          tenant_id: tenantId,
          entity_type: "tenant",
          entity_id: tenantId,
          metadata: { reason },
        });
      },

      reactivateTenant: (tenantId) => {
        const s = get();
        if (!s.users.find((u) => u.id === s.currentUserId)?.platform_role) return;
        set((st) => ({
          tenants: st.tenants.map((t) =>
            t.id === tenantId ? { ...t, status: "active" as const, suspended_at: undefined } : t
          ),
        }));
        get().logAudit({
          action: "tenant.reactivated",
          tenant_id: tenantId,
          entity_type: "tenant",
          entity_id: tenantId,
        });
      },

      // ── §26 Support / impersonation ──────────────────────────────
      startSupport: (tenantId, mode, reason) => {
        const s = get();
        const user = s.users.find((u) => u.id === s.currentUserId);
        if (!user?.platform_role) return { ok: false, reason: "Platform admin required" };
        let session: SupportSession;
        try {
          session = startSupportSession({
            tenantId,
            platformUserId: user.id,
            mode,
            reason,
          });
        } catch (e) {
          return { ok: false, reason: e instanceof Error ? e.message : "Invalid support request" };
        }
        // Grant a temporary membership view for the support session only.
        const existing = s.memberships.find((m) => m.tenant_id === tenantId && m.user_id === user.id);
        const supportMembership: TenantMembership =
          existing ?? {
            id: uid("mem-support"),
            tenant_id: tenantId,
            user_id: user.id,
            role: mode === "read_only" ? "read_only" : "tenant_admin",
            active: true,
            invitation_status: "accepted",
            accepted_at: now(),
            created_at: now(),
          };

        set((st) => ({
          supportSessions: [session, ...st.supportSessions],
          memberships: existing ? st.memberships : [...st.memberships, supportMembership],
          activeTenantId: tenantId,
          activeSupportSessionId: session.id,
        }));

        get().logAudit({
          action: mode === "impersonation" ? "platform.impersonation_started" : "platform.support_started",
          tenant_id: tenantId,
          entity_type: "support_session",
          entity_id: session.id,
          metadata: { mode, reason },
        });
        get().logAudit({
          action: "platform.tenant_accessed",
          tenant_id: tenantId,
          entity_type: "tenant",
          entity_id: tenantId,
          metadata: { mode },
        });
        return { ok: true };
      },

      endSupport: () => {
        const s = get();
        const active = s.supportSessions.find((x) => x.id === s.activeSupportSessionId);
        if (!active) return;
        set((st) => ({
          supportSessions: st.supportSessions.map((x) => (x.id === active.id ? endSupportSession(x) : x)),
          activeSupportSessionId: null,
          activeTenantId: null,
        }));
        get().logAudit({
          action: active.mode === "impersonation" ? "platform.impersonation_ended" : "platform.support_ended",
          tenant_id: active.tenant_id,
          entity_type: "support_session",
          entity_id: active.id,
        });
      },

      // ── §18 Audit ────────────────────────────────────────────────
      logAudit: (input) => {
        const session = get().resolveSession();
        const entry = buildAuditEntry(session, input);
        set((st) => ({ auditLogs: [entry, ...st.auditLogs] }));
      },

      // ── §25 Bootstrap (sandbox equivalent of the SQL function) ───
      bootstrapPlatformAdmin: (email) => {
        const target = email.trim().toLowerCase();
        const s = get();
        const user = s.users.find((u) => u.email.toLowerCase() === target && u.email_verified);
        if (!user) return false;
        set((st) => ({
          users: st.users.map((u) =>
            u.id === user.id ? { ...u, platform_role: "platform_super_admin" as const } : u
          ),
        }));
        return true;
      },
    }),
    {
      name: "dg-window-crm-tenancy-v1",
      version: 1,
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
      partialize: (s) => ({
        users: s.users,
        tenants: s.tenants,
        memberships: s.memberships,
        invitations: s.invitations,
        auditLogs: s.auditLogs,
        supportSessions: s.supportSessions,
        systemEvents: s.systemEvents,
        currentUserId: s.currentUserId,
        activeTenantId: s.activeTenantId,
        activeSupportSessionId: s.activeSupportSessionId,
      }),
    }
  )
);

/** Non-hook accessor. */
export const getTenancy = () => useTenancyStore.getState();
