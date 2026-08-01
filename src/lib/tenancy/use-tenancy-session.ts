"use client";

/**
 * Client-side session accessor (§3, §26).
 *
 * `resolveSession()` intentionally builds a fresh object on every call, so it
 * must NOT be used directly as a Zustand selector (it would never compare equal
 * and would re-render forever). This hook subscribes shallowly to the pieces of
 * state the resolver reads, then memoises the resolved session.
 *
 * UX ONLY. The authoritative check is `requirePlatformAdmin()` on the server.
 */
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { useTenancyStore } from "./tenancy-store";
import type { ActiveSession } from "./types";

export function useTenancySession(): ActiveSession | null {
  const snapshot = useTenancyStore(
    useShallow((s) => ({
      resolveSession: s.resolveSession,
      users: s.users,
      tenants: s.tenants,
      memberships: s.memberships,
      supportSessions: s.supportSessions,
      currentUserId: s.currentUserId,
      activeTenantId: s.activeTenantId,
      activeSupportSessionId: s.activeSupportSessionId,
    }))
  );

  return useMemo(() => snapshot.resolveSession(), [snapshot]);
}
