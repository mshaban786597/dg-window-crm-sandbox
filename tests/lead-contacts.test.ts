import { describe, it, expect } from "vitest";
import { migrateLeadToContacts, leadMatchesQuery } from "@/lib/store/crm-extended";
import type { Lead } from "@/types/database";

const legacyLead = {
  id: "lead-1",
  full_name: "Jane Q Homeowner",
  phone: "555-111-2222",
  email: "jane@example.com",
  address: "1 Main St",
  city: "Austin",
  county: "Travis",
  zip_code: "78701",
  service_requested: "window_replacement",
  lead_source: "phone_call",
  urgency: "medium",
  property_type: "residential",
  status: "new_lead",
  created_at: "2024-01-01T00:00:00Z",
} as unknown as Lead;

describe("contact migration (§3/§27)", () => {
  it("converts a single-contact lead into a primary LeadContact and county→state", () => {
    const m = migrateLeadToContacts(legacyLead);
    expect(m.contacts).toHaveLength(1);
    const c = m.contacts[0];
    expect(c.is_primary).toBe(true);
    expect(c.first_name).toBe("Jane");
    expect(c.last_name).toBe("Q Homeowner");
    expect(c.phone).toBe("555-111-2222");
    expect(m.primary_contact_id).toBe(c.id);
    expect(m.state).toBe("Travis");
  });

  it("is idempotent when contacts already exist", () => {
    const m1 = migrateLeadToContacts(legacyLead);
    const m2 = migrateLeadToContacts(m1);
    expect(m2.contacts).toHaveLength(1);
    expect(m2.contacts[0].id).toBe(m1.contacts[0].id);
  });
});

describe("lead search across contacts (§3)", () => {
  const lead = {
    ...legacyLead,
    contacts: [
      { id: "c1", first_name: "Jane", last_name: "Homeowner", phone: "555-111-2222", email: "jane@example.com", is_primary: true, created_at: "" },
      { id: "c2", first_name: "Bob", last_name: "Spouse", phone: "555-333-4444", email: "bob@example.com", is_primary: false, created_at: "" },
    ],
  } as unknown as Lead;

  it("matches any contact name/phone/email", () => {
    expect(leadMatchesQuery(lead, "bob")).toBe(true);
    expect(leadMatchesQuery(lead, "555-333")).toBe(true);
    expect(leadMatchesQuery(lead, "jane@example")).toBe(true);
    expect(leadMatchesQuery(lead, "nomatch")).toBe(false);
    expect(leadMatchesQuery(lead, "")).toBe(true);
  });
});
