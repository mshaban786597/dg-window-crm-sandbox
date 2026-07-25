import { describe, it, expect, beforeEach } from "vitest";
import { useCRMStore } from "@/lib/store/crm-store";
import { LEAD_SERVICE_OPTIONS, serviceDisplay } from "@/lib/domain";
import { buildAssignmentEmail } from "@/lib/email/templates";
import { canViewMarketingFields, canEditMarketingFields } from "@/lib/permissions";
import type { Lead, LeadContact, TeamMember } from "@/types/database";

const store = () => useCRMStore.getState();
const contact = (f: string, l: string, primary: boolean): LeadContact => ({
  id: `c-${f}`, first_name: f, last_name: l, phone: "5551112222", email: `${f}@x.com`, is_primary: primary, created_at: "",
});

beforeEach(() => {
  useCRMStore.setState({ leads: [], leadActivities: [], notifications: [], appointmentConfirmations: [] });
});

describe("§2 Custom service", () => {
  it("persists custom_service_name and displays it as the service", () => {
    const lead = store().addLead({
      contacts: [contact("Ada", "Byron", true)],
      address: "1 A", city: "Austin", state: "TX", zip_code: "78701",
      service_requested: "custom", custom_service_name: "Bay & Bow Combo",
      lead_source: "website_form", urgency: "medium", property_type: "residential", status: "new_lead",
    });
    expect(lead.service_requested).toBe("custom");
    expect(lead.custom_service_name).toBe("Bay & Bow Combo");
    expect(serviceDisplay(lead.service_requested, lead.custom_service_name)).toBe("Bay & Bow Combo");
  });
  it("does NOT add the custom value to the global option list", () => {
    const before = [...LEAD_SERVICE_OPTIONS];
    store().addLead({
      contacts: [contact("Bea", "Q", true)],
      address: "2 B", city: "Austin", state: "TX", zip_code: "78701",
      service_requested: "custom", custom_service_name: "One-Off Skylight",
      lead_source: "referral", urgency: "low", property_type: "residential", status: "new_lead",
    });
    expect([...LEAD_SERVICE_OPTIONS]).toEqual(before); // immutable global list
    expect(LEAD_SERVICE_OPTIONS).toEqual(["window_replacement", "window_repair", "sliding_glass_doors", "custom"]);
  });
});

describe("§9 Assignment email content", () => {
  const lead = {
    id: "lead-9", full_name: "Jane Home", phone: "5551110000",
    contacts: [contact("Jane", "Home", true), contact("Bob", "Spouse", false)],
    primary_contact_id: "c-Jane",
    address: "42 Oak St", city: "Austin", state: "TX", zip_code: "78701",
    county: "Travis", service_requested: "custom", custom_service_name: "Bay Window",
    lead_source: "google_ads", property_type: "residential", urgency: "medium",
    property_value_cents: 45000000, building_value_cents: 32000000, estimated_value_cents: 1850000,
    appointment_at: "2026-08-01T15:00:00.000Z", notes: "Gate code 4455", status: "new_lead", created_at: "",
  } as unknown as Lead;

  it("includes all required fields, a clickable maps link, and confirm link", () => {
    const { subject, html } = buildAssignmentEmail({
      lead, recipientName: "Rep One", leadUrl: "http://x/leads/lead-9",
      confirmUrl: "http://x/confirm/tok", timezone: "America/Chicago", currency: "USD", sandbox: true,
    });
    expect(subject).toContain("appointment");
    expect(html).toContain("An appointment has been assigned to you.");
    expect(html).toContain("Jane Home");
    expect(html).toContain("Bob Spouse"); // additional contact
    expect(html).toContain("5551112222"); // primary contact phone
    expect(html).toContain("Bay Window"); // custom service display
    expect(html).toMatch(/google\.com\/maps.*42%20Oak%20St/); // full encoded address
    expect(html).toContain("text-decoration:underline"); // underlined address link
    expect(html).toContain("$450,000"); // property value formatted
    expect(html).toContain("$320,000"); // building value
    expect(html).toContain("$18,500"); // estimated value
    expect(html).toContain("http://x/confirm/tok"); // confirmation link
    expect(html).toContain("http://x/leads/lead-9"); // CRM lead link
    // Marketing attribution must NOT be exposed by default
    expect(html).not.toContain("utm");
  });
});

describe("§5 dual-recipient notifications + no-duplicate on retry", () => {
  const mgr: TeamMember = { id: "m1", first_name: "Meg", last_name: "Mgr", email: "meg@x.com", role: "manager", active: true, notification_preferences: { email_assignment: true, email_confirmation: true }, created_at: "" };
  const rep: TeamMember = { id: "r1", first_name: "Rick", last_name: "Rep", email: "rick@x.com", role: "sales_representative", active: true, manager_id: "m1", notification_preferences: { email_assignment: true, email_confirmation: true }, created_at: "" };

  beforeEach(() => useCRMStore.setState({ teamMembers: [mgr, rep], currentTeamMemberId: "m1" }));

  it("emails the rep and their manager, dedupes on retry, keeps the lead saved", async () => {
    const lead = store().addLead({
      contacts: [contact("Ann", "Buyer", true)],
      address: "9 Elm", city: "Austin", state: "TX", zip_code: "78702",
      service_requested: "window_replacement", lead_source: "referral", urgency: "low",
      property_type: "residential", status: "new_lead",
      assigned_estimator_id: "r1", assigned_estimator_name: "Rick Rep",
    });
    const res = await store().notifyLeadAssignment(lead.id);
    expect(res.sent + res.failed).toBe(2); // rep + manager
    const outbox = store().notifications.filter((n) => n.lead_id === lead.id);
    expect(outbox.map((n) => n.recipient_user_id).sort()).toEqual(["m1", "r1"]);
    expect(outbox.every((n) => n.status === "sandbox")).toBe(true); // sandbox outbox, not sent
    // retry must NOT create duplicates
    await store().notifyLeadAssignment(lead.id, { retry: true });
    const after = store().notifications.filter((n) => n.lead_id === lead.id);
    expect(after.length).toBe(2);
    // lead still saved regardless of notification outcome
    expect(store().leads.find((l) => l.id === lead.id)).toBeTruthy();
    // a confirmation exists per recipient
    expect(store().appointmentConfirmations.filter((c) => c.lead_id === lead.id).length).toBe(2);
  });
});

describe("§15 marketing field gating", () => {
  const mk = (role: TeamMember["role"]): TeamMember => ({ id: role, first_name: role, last_name: "", email: "", role, active: true, notification_preferences: { email_assignment: true, email_confirmation: true }, created_at: "" });
  it("only administrator and marketing may view/edit attribution", () => {
    expect(canViewMarketingFields(mk("administrator"))).toBe(true);
    expect(canViewMarketingFields(mk("marketing"))).toBe(true);
    expect(canViewMarketingFields(mk("manager"))).toBe(false);
    expect(canViewMarketingFields(mk("sales_representative"))).toBe(false);
    expect(canEditMarketingFields(mk("manager"))).toBe(false);
  });
});
