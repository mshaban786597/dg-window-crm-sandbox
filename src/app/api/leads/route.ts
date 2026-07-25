import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { APP, SANDBOX_MODE, canUseExternalIntegrations } from "@/lib/domain";
import type { TeamMember } from "@/types/database";
import {
  pickWebsiteManager,
  resolveWebsiteService,
  normalizePhone,
  normalizeEmail,
} from "@/lib/store/crm-extended";

/**
 * Window website lead intake API (§12).
 * POST /api/leads
 *
 * Accepts leads submitted from the public marketing website and returns a
 * NORMALIZED lead payload plus an auto-assignment DECISION.
 *
 * SANDBOX SAFETY
 * --------------
 * This route performs NO external side effects. It never sends email/SMS/
 * webhooks and never calls a third-party API. It also cannot write the client
 * Zustand CRM store (that store only exists in the browser), so it does not
 * persist the lead here — it returns everything the caller needs. A real
 * deployment would, inside the `canUseExternalIntegrations` branch below,
 * insert the normalized lead into an isolated Supabase `leads` table, then
 * enqueue the assignment notification. See the documented block near the end.
 *
 * The in-module Maps used for idempotency / duplicate / rate-limit guards are
 * per-process and best-effort. They are appropriate for a single-instance
 * sandbox; a real deployment would back these with a shared store (Redis /
 * Supabase) so the guarantees hold across instances and restarts.
 */

// ── Request schema ───────────────────────────────────────────────
const leadIntakeSchema = z
  .object({
    // Name: either split fields or a single `name`.
    first_name: z.string().trim().optional(),
    last_name: z.string().trim().optional(),
    name: z.string().trim().optional(),

    phone: z.string().trim().min(7, "A valid phone number is required"),
    email: z.string().trim().email().optional(),

    address: z.string().trim().optional(),
    city: z.string().trim().optional(),
    // State may arrive as state / region / county.
    state: z.string().trim().optional(),
    region: z.string().trim().optional(),
    county: z.string().trim().optional(),
    zip: z.string().trim().optional(),
    zip_code: z.string().trim().optional(),
    country: z.string().trim().optional(),

    service_needed: z.string().trim().optional(),
    property_type: z.string().trim().optional(),
    message: z.string().trim().optional(),

    source: z.string().trim().optional().default("website_form"),
    campaign: z.string().trim().optional(),
    utm_source: z.string().trim().optional(),
    utm_medium: z.string().trim().optional(),
    utm_campaign: z.string().trim().optional(),

    // Repeat-submit dedupe key supplied by the website form.
    idempotency_key: z.string().trim().max(200).optional(),

    // Honeypot spam trap — real users never fill this hidden field.
    // Accept common honeypot names; any non-empty value = bot.
    website: z.string().optional(),
    company_website: z.string().optional(),
    hp: z.string().optional(),
  })
  .passthrough();

type LeadIntake = z.infer<typeof leadIntakeSchema>;

const ACCEPTED_FIELDS = [
  "first_name",
  "last_name",
  "name",
  "phone",
  "email",
  "address",
  "city",
  "state (or region/county)",
  "zip",
  "country",
  "service_needed",
  "property_type",
  "message",
  "source",
  "campaign",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "idempotency_key",
] as const;

// ── In-module guards (best-effort, per-process) ──────────────────
interface StoredResponse {
  body: unknown;
  status: number;
  at: number;
}
const idempotencyCache = new Map<string, StoredResponse>();
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

// Duplicate guard: phone+message fingerprint within a short window.
const recentSubmissions = new Map<string, number>();
const DUPLICATE_WINDOW_MS = 60 * 1000; // 60s

// Fixed-window per-IP rate limiter.
const RATE_LIMIT_MAX = 10; // requests
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // per minute
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function pruneMaps(now: number) {
  for (const [k, v] of idempotencyCache) if (now - v.at > IDEMPOTENCY_TTL_MS) idempotencyCache.delete(k);
  for (const [k, t] of recentSubmissions) if (now - t > DUPLICATE_WINDOW_MS) recentSubmissions.delete(k);
  for (const [k, b] of rateBuckets) if (now > b.resetAt) rateBuckets.delete(k);
}

function getClientIp(request: NextRequest): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") || "unknown";
}

function checkRateLimit(ip: string, now: number): { ok: boolean; retryAfter: number } {
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { ok: true, retryAfter: 0 };
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return { ok: false, retryAfter: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true, retryAfter: 0 };
}

function isHoneypotFilled(data: LeadIntake): boolean {
  return Boolean(
    (data.website && data.website.trim()) ||
      (data.company_website && data.company_website.trim()) ||
      (data.hp && data.hp.trim())
  );
}

// ── Sandbox team roster + assignment settings ────────────────────
// A real deployment reads the active team + website-assignment settings from
// Supabase. In the sandbox we use a small documented roster so the assignment
// DECISION is exercised end-to-end. `pickWebsiteManager` returns no manager
// when the roster has no active managers → needs_assignment=true (never
// silently discarded).
const SANDBOX_TEAM_ROSTER: TeamMember[] = [
  {
    id: "tm-admin",
    first_name: "Sandbox",
    last_name: "Admin",
    email: "admin@windowcrm.local",
    role: "administrator",
    active: true,
    notification_preferences: { email_assignment: true, email_confirmation: true },
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: "tm-website-manager",
    first_name: "Sandbox",
    last_name: "Manager",
    email: "manager@windowcrm.local",
    role: "manager",
    active: true,
    notification_preferences: { email_assignment: true, email_confirmation: true },
    created_at: "2024-01-01T00:00:00Z",
  },
];

const SANDBOX_ASSIGNMENT_SETTINGS = {
  website_assignment_mode: "default_manager",
  round_robin_enabled: false,
  round_robin_cursor: 0,
  default_website_manager_id: "",
};

// ── Helpers ──────────────────────────────────────────────────────
function resolveName(data: LeadIntake): { first_name: string; last_name: string } {
  if (data.first_name || data.last_name) {
    return { first_name: data.first_name || "", last_name: data.last_name || "" };
  }
  const parts = (data.name || "").trim().split(/\s+/).filter(Boolean);
  const [first, ...rest] = parts;
  return { first_name: first || "Website", last_name: rest.join(" ") || "Lead" };
}

function buildFormattedAddress(parts: {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
}): string {
  return [parts.address, parts.city, parts.state, parts.zip, parts.country]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(", ");
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status });
}

// ── POST ─────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const nowMs = Date.now();
  pruneMaps(nowMs);

  // Shared webhook secret (§12). Enforced only when configured; unset in the
  // sandbox default so local testing works without a secret.
  const requiredSecret = process.env.WEBSITE_WEBHOOK_SECRET;
  if (requiredSecret) {
    const provided = request.headers.get("x-webhook-secret");
    if (provided !== requiredSecret) {
      return json({ success: false, message: "Unauthorized" }, 401);
    }
  }

  // Rate limit per IP.
  const ip = getClientIp(request);
  const rate = checkRateLimit(ip, nowMs);
  if (!rate.ok) {
    return NextResponse.json(
      { success: false, message: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(rate.retryAfter) } }
    );
  }

  // Parse + validate.
  let data: LeadIntake;
  try {
    const raw = await request.json();
    data = leadIntakeSchema.parse(raw);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ success: false, errors: error.flatten() }, 400);
    }
    return json({ success: false, message: "Invalid JSON body" }, 400);
  }

  // Spam hook: honeypot filled → pretend success, do nothing (silently drop
  // bots). Log only a safe note; never PII.
  if (isHoneypotFilled(data)) {
    console.log(`[${APP.name}] Lead intake: honeypot triggered from ip=${ip} — dropped silently`);
    return json({ success: true, message: "Received." }, 200);
  }

  // Idempotency: replay the stored response for a repeated key.
  if (data.idempotency_key) {
    const cached = idempotencyCache.get(data.idempotency_key);
    if (cached) {
      return json(cached.body, cached.status);
    }
  }

  // Normalize.
  const { first_name, last_name } = resolveName(data);
  const phone = normalizePhone(data.phone);
  const email = normalizeEmail(data.email);
  const state = data.state || data.region || data.county || "";
  const zip = data.zip_code || data.zip || "";
  const formatted_address = buildFormattedAddress({
    address: data.address,
    city: data.city,
    state,
    zip,
    country: data.country,
  });
  const service = resolveWebsiteService(data.service_needed);

  // Duplicate guard: same phone+message within a short window.
  const dupKey = `${phone}|${(data.message || "").trim().toLowerCase()}`;
  const lastSeen = recentSubmissions.get(dupKey);
  const isDuplicate = lastSeen !== undefined && nowMs - lastSeen < DUPLICATE_WINDOW_MS;
  recentSubmissions.set(dupKey, nowMs);

  // Assignment decision (§12). Server-side compute only — no store write.
  const { manager } = pickWebsiteManager(SANDBOX_TEAM_ROSTER, SANDBOX_ASSIGNMENT_SETTINGS);

  const leadId = `lead-${nowMs}-${Math.random().toString(36).slice(2, 8)}`;

  // Normalized lead payload the caller (or a real Supabase writer) persists.
  const lead = {
    id: leadId,
    first_name,
    last_name,
    full_name: `${first_name} ${last_name}`.trim(),
    phone,
    email: email ?? null,
    address: data.address ?? null,
    city: data.city ?? null,
    state: state || null,
    zip_code: zip || null,
    country: data.country ?? null,
    formatted_address: formatted_address || null,
    service_requested: service.service_requested,
    custom_service_name: service.custom_service_name ?? null,
    property_type: data.property_type ?? null,
    lead_source: "website_form",
    notes: data.message ?? null,
    campaign_name: data.campaign ?? null,
    utm_source: data.utm_source ?? null,
    utm_medium: data.utm_medium ?? null,
    utm_campaign: data.utm_campaign ?? null,
    status: "new_lead",
    created_at: new Date(nowMs).toISOString(),
  };

  const assignment = manager
    ? {
        needs_assignment: false,
        assigned_manager_id: manager.id,
        assigned_manager_name: `${manager.first_name} ${manager.last_name}`.trim(),
      }
    : {
        // No active manager available — flagged for a human, never discarded.
        needs_assignment: true,
        assigned_manager_id: null,
        assigned_manager_name: null,
      };

  // Safe logging: id, source, and assignment decision only — NEVER PII.
  console.log(
    `[${APP.name}] Lead intake: id=${lead.id} source=${lead.lead_source} ` +
      `assigned=${assignment.assigned_manager_id ?? "none"} needs_assignment=${assignment.needs_assignment}` +
      (isDuplicate ? " duplicate=true" : "")
  );

  // A real deployment writes to Supabase + enqueues the notification HERE.
  if (canUseExternalIntegrations) {
    // const supabase = await createServerSupabaseClient();
    // const { data: inserted } = await supabase.from("leads").insert({ ...lead, ...assignment });
    // if (assignment.assigned_manager_id) await enqueueAssignmentNotification(inserted.id);
    // Guarded so it is unreachable in sandbox mode (canUseExternalIntegrations = false).
  }

  const responseBody = {
    success: true,
    sandbox: SANDBOX_MODE,
    duplicate: isDuplicate,
    message: canUseExternalIntegrations
      ? "Lead received."
      : "Lead received (sandbox — normalized and returned; not persisted externally).",
    lead,
    assignment,
  };
  const responseStatus = 201;

  // Store for idempotent replay.
  if (data.idempotency_key) {
    idempotencyCache.set(data.idempotency_key, {
      body: responseBody,
      status: responseStatus,
      at: nowMs,
    });
  }

  return json(responseBody, responseStatus);
}

// ── GET: endpoint descriptor ─────────────────────────────────────
export async function GET() {
  return NextResponse.json({
    endpoint: "/api/leads",
    method: "POST",
    description: `${APP.name} window website lead intake API`,
    sandbox: SANDBOX_MODE,
    external_integrations_enabled: canUseExternalIntegrations,
    webhook_secret_required: Boolean(process.env.WEBSITE_WEBHOOK_SECRET),
    accepted_fields: ACCEPTED_FIELDS,
    notes: [
      "phone is required.",
      "Provide either name, or first_name/last_name.",
      "state may be sent as state, region, or county.",
      "Set an idempotency_key header/field to safely retry submissions.",
      "A honeypot field (website/company_website/hp) silently drops bot submissions.",
    ],
  });
}
