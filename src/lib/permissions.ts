/**
 * Centralized permission system (§14, §30).
 *
 * Pure functions over the current TeamMember + the team roster. These are used
 * by nav, pages, actions, store selectors, and API routes so authorization is
 * enforced at the data layer — not merely by hiding buttons.
 */
import type { TeamMember, TeamRole, Quote } from "@/types/database";

export type ActingUser = Pick<TeamMember, "id" | "role" | "active"> | null | undefined;

export const isAdmin = (u: ActingUser) => u?.role === "administrator";
export const isManager = (u: ActingUser) => u?.role === "manager";
export const isSalesRep = (u: ActingUser) => u?.role === "sales_representative";
export const isMarketing = (u: ActingUser) => u?.role === "marketing";

/** IDs of active sales reps managed (directly) by a manager. */
export function managedRepIds(team: TeamMember[], managerId: string): string[] {
  return team.filter((m) => m.manager_id === managerId).map((m) => m.id);
}

/** Active sales reps eligible to be assigned new leads (§7). */
export function activeSalesReps(team: TeamMember[]): TeamMember[] {
  return team.filter((m) => m.role === "sales_representative" && m.active);
}

/** Active managers (used for website auto-assignment §12). */
export function activeManagers(team: TeamMember[]): TeamMember[] {
  return team.filter((m) => m.role === "manager" && m.active);
}

// ── Marketing attribution field access (§11) ─────────────────────
export const canViewMarketingFields = (u: ActingUser) => isAdmin(u) || isMarketing(u);
export const canEditMarketingFields = (u: ActingUser) => isAdmin(u) || isMarketing(u);

// ── Cost visibility (§20) ────────────────────────────────────────
// Admin: full. Manager: configurable (default false). Rep/Marketing: none.
export function canViewCost(u: ActingUser, managerCostVisible = false): boolean {
  if (isAdmin(u)) return true;
  if (isManager(u)) return managerCostVisible;
  return false;
}

// ── Team management (§7, §30) ────────────────────────────────────
export const canManageTeam = (u: ActingUser) => isAdmin(u);
export const canPromoteToAdmin = (u: ActingUser) => isAdmin(u);
export const canAssignLeads = (u: ActingUser) => isAdmin(u) || isManager(u);

// ── Quote visibility (§14) ───────────────────────────────────────
/**
 * Owner ids whose quotes the user may see.
 * `null` means "all quotes" (administrator). Empty array means "none".
 */
export function getVisibleQuoteOwnerIds(u: ActingUser, team: TeamMember[]): string[] | null {
  if (!u) return [];
  if (isAdmin(u)) return null; // all
  if (isManager(u)) return [u.id, ...managedRepIds(team, u.id)];
  if (isSalesRep(u)) return [u.id];
  return []; // marketing: no quote access by default
}

export function canViewQuote(u: ActingUser, quote: Pick<Quote, "owner_id">, team: TeamMember[]): boolean {
  const ids = getVisibleQuoteOwnerIds(u, team);
  if (ids === null) return true;
  if (ids.length === 0) return false;
  return !!quote.owner_id && ids.includes(quote.owner_id);
}

export function canEditQuote(u: ActingUser, quote: Pick<Quote, "owner_id">, team: TeamMember[]): boolean {
  // Same scope as view for admin/manager/owning-rep; marketing never edits.
  if (isMarketing(u)) return false;
  return canViewQuote(u, quote, team);
}

/** Filter a quote list down to what the user may see. */
export function visibleQuotes<T extends Pick<Quote, "owner_id">>(
  u: ActingUser,
  quotes: T[],
  team: TeamMember[]
): T[] {
  const ids = getVisibleQuoteOwnerIds(u, team);
  if (ids === null) return quotes;
  if (ids.length === 0) return [];
  return quotes.filter((q) => !!q.owner_id && ids.includes(q.owner_id));
}

// ── Manager relationship integrity (§7) ──────────────────────────
/**
 * Returns true if setting `member.manager_id = candidateManagerId` would create
 * a cycle (including self-management). Prevents circular manager chains.
 */
export function wouldCreateManagerCycle(
  team: TeamMember[],
  memberId: string,
  candidateManagerId: string | undefined
): boolean {
  if (!candidateManagerId) return false;
  if (candidateManagerId === memberId) return true; // cannot manage self
  const byId = new Map(team.map((m) => [m.id, m]));
  let cursor: string | undefined = candidateManagerId;
  const seen = new Set<string>();
  while (cursor) {
    if (cursor === memberId) return true; // loops back to member
    if (seen.has(cursor)) return true; // pre-existing cycle
    seen.add(cursor);
    cursor = byId.get(cursor)?.manager_id;
  }
  return false;
}

// ── Nav gating (§30) ─────────────────────────────────────────────
export function canSeeNav(roles: string, role: TeamRole | undefined): boolean {
  if (roles === "all") return true;
  if (!role) return false;
  return roles.split(",").includes(role);
}
