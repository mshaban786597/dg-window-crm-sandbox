import { describe, it, expect, beforeEach } from "vitest";
import { useCRMStore } from "@/lib/store/crm-store";
import { generateToken, hashToken } from "@/lib/tokens";
import type { AppointmentConfirmation, LeadContact } from "@/types/database";

const store = () => useCRMStore.getState();

function resetLeads() {
  useCRMStore.setState({ leads: [], leadActivities: [], notifications: [], appointmentConfirmations: [], quotes: [] });
}

const contact = (first: string, last: string, primary: boolean): LeadContact => ({
  id: `c-${first}`,
  first_name: first,
  last_name: last,
  phone: "5551112222",
  email: `${first}@x.com`,
  is_primary: primary,
  created_at: "",
});

describe("addLead with repeatable contacts (§3/§28)", () => {
  beforeEach(resetLeads);
  it("stores contacts, derives primary, and logs activity", () => {
    const lead = store().addLead({
      contacts: [contact("Jane", "Home", true), contact("Bob", "Spouse", false)],
      address: "1 Main", city: "Austin", state: "TX", zip_code: "78701",
      service_requested: "window_replacement", lead_source: "phone_call",
      urgency: "medium", property_type: "residential", status: "new_lead",
    });
    expect(lead.contacts).toHaveLength(2);
    expect(lead.full_name).toBe("Jane Home");
    expect(lead.primary_contact_id).toBe(lead.contacts.find((c) => c.is_primary)!.id);
    const acts = store().leadActivities.filter((a) => a.lead_id === lead.id);
    expect(acts.some((a) => a.type === "lead_created")).toBe(true);
    expect(acts.some((a) => a.type === "contact_added")).toBe(true);
  });
});

describe("appointment confirmation is idempotent (§10)", () => {
  beforeEach(resetLeads);
  it("confirms once then reports already-confirmed", async () => {
    const token = generateToken();
    const token_hash = await hashToken(token);
    const conf: AppointmentConfirmation = {
      id: "conf-1", notification_id: "n1", lead_id: "lead-x", recipient_role: "sales_representative",
      token_hash, status: "pending", expires_at: new Date(Date.now() + 86400000).toISOString(),
      created_at: new Date().toISOString(),
    };
    useCRMStore.setState({ appointmentConfirmations: [conf] });
    const first = await store().confirmAppointment(token);
    expect(first.ok).toBe(true);
    expect(first.already).toBe(false);
    const second = await store().confirmAppointment(token);
    expect(second.ok).toBe(true);
    expect(second.already).toBe(true);
    expect(store().appointmentConfirmations[0].status).toBe("confirmed");
  });
  it("rejects an unknown token", async () => {
    const res = await store().confirmAppointment("not-a-real-token");
    expect(res.ok).toBe(false);
  });
});

describe("inventory-based quote items + totals (§24/§26)", () => {
  beforeEach(resetLeads);
  it("adds a snapshot line, updates quantity, and recomputes totals", () => {
    const lead = store().addLead({
      contacts: [contact("Ann", "Buyer", true)],
      address: "2 Oak", city: "Austin", state: "TX", zip_code: "78702",
      service_requested: "window_replacement", lead_source: "referral",
      urgency: "low", property_type: "residential", status: "new_lead",
    });
    const quote = store().createQuoteForLead(lead.id)!;
    expect(quote.status).toBe("draft");
    store().addQuoteItem(quote.id, {
      catalog_item_id: "item-1", series_snapshot: "9900", window_type_snapshot: "Double Hung",
      universal_range_snapshot: "111-123", item_name_snapshot: "9900 DH",
      base_price_cents_snapshot: 20000, base_cost_cents_snapshot: 10000, selections: [],
      configured_unit_price_cents: 24000, configured_unit_cost_cents: 11700,
      quantity: 3, line_total_cents: 72000, line_cost_cents: 35100,
    });
    let q = store().quotes.find((x) => x.id === quote.id)!;
    expect(q.total_cents).toBe(72000);
    store().updateQuoteItemQuantity(quote.id, q.items![0].id, 5);
    q = store().quotes.find((x) => x.id === quote.id)!;
    expect(q.items![0].line_total_cents).toBe(120000);
    expect(q.total_cents).toBe(120000);
    store().removeQuoteItem(quote.id, q.items![0].id);
    q = store().quotes.find((x) => x.id === quote.id)!;
    expect(q.total_cents).toBe(0);
  });
});
