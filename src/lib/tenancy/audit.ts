/**
 * Audit logging + platform support sessions (§4, §18, §26).
 *
 * Key invariant: the audit actor is ALWAYS the real authenticated user. When a
 * platform admin acts through support/impersonation we record the platform user
 * as `actor_user_id` and the impersonated tenant user separately. History is
 * never rewritten to look like the tenant user performed the action.
 */
import type {
  ActiveSession,
  AuditAction,
  AuditLogEntry,
  SupportMode,
  SupportSession,
} from "./types";
import { SUPPORT_SESSION_MAX_MINUTES } from "./types";

export interface AuditInput {
  action: AuditAction;
  tenant_id?: string | null;
  entity_type?: string;
  entity_id?: string;
  metadata?: AuditLogEntry["metadata"];
  ip_address?: string;
  user_agent?: string;
}

const uid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

/**
 * Build an audit entry from a session. Pure — the caller persists it (DB insert
 * server-side, or the local sandbox store in non-production mode).
 */
export function buildAuditEntry(
  session: ActiveSession | null | undefined,
  input: AuditInput
): AuditLogEntry {
  const realActorId = session?.user?.id ?? "system";
  const support = session?.support;
  // Under impersonation the *platform* user remains the actor (§4).
  const impersonated =
    support?.mode === "impersonation" && session?.membership?.user_id !== realActorId
      ? session?.membership?.user_id
      : undefined;

  return {
    id: uid("audit"),
    tenant_id: input.tenant_id ?? session?.tenant?.id ?? null,
    actor_user_id: realActorId,
    actor_membership_id: session?.membership?.id,
    actor_role: session?.user?.platform_role ?? session?.membership?.role ?? "system",
    impersonated_user_id: impersonated,
    action: input.action,
    entity_type: input.entity_type,
    entity_id: input.entity_id,
    metadata: input.metadata,
    ip_address: input.ip_address,
    user_agent: input.user_agent,
    created_at: new Date().toISOString(),
  };
}

/** Actions that must always produce an audit record (§18). */
export const MANDATORY_AUDIT_ACTIONS: AuditAction[] = [
  "tenant.registered",
  "tenant.suspended",
  "tenant.reactivated",
  "user.invited",
  "user.invitation_accepted",
  "user.role_changed",
  "user.deactivated",
  "platform.tenant_accessed",
  "platform.support_started",
  "platform.support_ended",
  "platform.impersonation_started",
  "platform.impersonation_ended",
  "data.exported",
  "security.setting_changed",
  "integration.credential_changed",
];

// ── Support sessions ─────────────────────────────────────────────
export interface StartSupportInput {
  tenantId: string;
  platformUserId: string;
  mode: SupportMode;
  reason: string;
  maxMinutes?: number;
}

/**
 * Start a time-boxed support session. A reason is REQUIRED for impersonation
 * (§26) and the session always carries a hard expiry.
 */
export function startSupportSession(input: StartSupportInput): SupportSession {
  const reason = (input.reason || "").trim();
  if (input.mode === "impersonation" && reason.length < 5) {
    throw new Error("An administrative reason is required for impersonation");
  }
  const minutes = Math.min(input.maxMinutes ?? SUPPORT_SESSION_MAX_MINUTES, SUPPORT_SESSION_MAX_MINUTES);
  const now = new Date();
  const expires = new Date(now.getTime() + minutes * 60_000);
  return {
    id: uid("support"),
    tenant_id: input.tenantId,
    platform_user_id: input.platformUserId,
    mode: input.mode,
    reason,
    started_at: now.toISOString(),
    expires_at: expires.toISOString(),
  };
}

/** A support session is only valid while un-ended and un-expired (§4). */
export function isSupportSessionActive(
  s: SupportSession | null | undefined,
  now: Date = new Date()
): boolean {
  if (!s) return false;
  if (s.ended_at) return false;
  return new Date(s.expires_at).getTime() > now.getTime();
}

export function endSupportSession(s: SupportSession): SupportSession {
  return { ...s, ended_at: new Date().toISOString() };
}

/** Banner text shown for the entire duration of a support session (§4, §26). */
export function supportBannerText(s: SupportSession | null | undefined): string | null {
  if (!isSupportSessionActive(s)) return null;
  return s!.mode === "read_only"
    ? "You are viewing this workspace as Platform Support (read-only)."
    : "You are viewing this workspace as Platform Support.";
}

// ── Secret masking (§4, §17) ─────────────────────────────────────
const SECRET_KEY_PATTERN =
  /(password|token|secret|api[_-]?key|refresh[_-]?token|client[_-]?secret|card|cvv|ssn)/i;

/** Mask a single secret value, keeping only a short suffix for support triage. */
export function maskSecret(value: string | null | undefined): string {
  if (!value) return "";
  const s = String(value);
  if (s.length <= 4) return "••••";
  return `••••${s.slice(-4)}`;
}

/**
 * Recursively mask sensitive fields before any platform-admin display or audit
 * metadata write. Plaintext passwords/tokens/keys must never surface (§4).
 */
export function maskSensitive<T>(input: T): T {
  if (Array.isArray(input)) {
    return input.map((v) => maskSensitive(v)) as unknown as T;
  }
  if (input && typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SECRET_KEY_PATTERN.test(k)) {
        out[k] = typeof v === "string" ? maskSecret(v) : "••••";
      } else {
        out[k] = maskSensitive(v);
      }
    }
    return out as unknown as T;
  }
  return input;
}
