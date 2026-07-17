import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { APP, SANDBOX_MODE, canUseExternalIntegrations } from "@/lib/domain";

/**
 * Window lead intake API.
 * POST /api/leads
 *
 * Accepts window-project leads. Missing address/location fields are stored as
 * null/empty — never defaulted to a real-world value. In sandbox mode this
 * endpoint performs NO external side effects (no email/SMS/webhook/CRM sync);
 * it returns a safe sandbox response.
 */
const leadIntakeSchema = z.object({
  name: z.string().min(1),
  phone: z.string().min(7),
  email: z.string().email().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(), // region or county
  county: z.string().optional(),
  zip: z.string().optional(),
  zip_code: z.string().optional(),
  service_needed: z.string().optional(),
  window_count: z.union([z.number(), z.string()]).optional(),
  project_timeframe: z.string().optional(),
  financing_interest: z.boolean().optional(),
  message: z.string().optional(),
  photos: z.array(z.string()).optional(),
  preferred_contact_method: z.enum(["phone", "email", "text"]).optional(),
  source: z.string().optional().default("website_form"),
  campaign: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const data = leadIntakeSchema.parse(body);

    // Nullable/empty where absent — do NOT invent real-world defaults.
    const leadRecord = {
      id: `lead-${Date.now()}`,
      full_name: data.name,
      phone: data.phone,
      email: data.email ?? null,
      address: data.address ?? null,
      city: data.city ?? null,
      county: data.county ?? data.region ?? null,
      zip_code: data.zip_code ?? data.zip ?? null,
      service_requested: data.service_needed ?? null,
      window_opening_count:
        data.window_count != null ? Number(data.window_count) || null : null,
      project_timeframe: data.project_timeframe ?? null,
      financing_interest: data.financing_interest ?? null,
      lead_source: data.source,
      preferred_contact_method: data.preferred_contact_method ?? null,
      campaign_name: data.campaign ?? null,
      utm_source: data.utm_source ?? null,
      utm_medium: data.utm_medium ?? null,
      utm_campaign: data.utm_campaign ?? null,
      notes: data.message ?? null,
      photos: data.photos ?? [],
      status: "new_lead",
      created_at: new Date().toISOString(),
    };

    // Never log full customer PII in production-style output.
    console.log(`[${APP.name}] Lead received: id=${leadRecord.id} source=${leadRecord.lead_source}`);

    if (!canUseExternalIntegrations) {
      // Sandbox / integrations disabled: no external side effects.
      return NextResponse.json(
        {
          success: true,
          sandbox: SANDBOX_MODE,
          message: "Lead received (sandbox — not persisted externally).",
          lead_id: leadRecord.id,
        },
        { status: 201 }
      );
    }

    // When integrations are enabled AND Supabase is configured, insert into an
    // isolated sandbox `leads` table here. No automations fire in this build.
    // const supabase = await createServerSupabaseClient();
    // await supabase.from("leads").insert({ ... });

    return NextResponse.json(
      { success: true, message: "Lead received.", lead_id: leadRecord.id },
      { status: 201 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, errors: error.flatten() }, { status: 400 });
    }
    return NextResponse.json({ success: false, message: "Internal server error" }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/leads",
    method: "POST",
    description: `${APP.name} window lead intake API`,
    sandbox: SANDBOX_MODE,
    fields: [
      "name", "phone", "email", "address", "city", "region", "zip",
      "service_needed", "window_count", "project_timeframe", "financing_interest",
      "message", "photos", "preferred_contact_method", "source",
      "campaign", "utm_source", "utm_medium", "utm_campaign",
    ],
  });
}
