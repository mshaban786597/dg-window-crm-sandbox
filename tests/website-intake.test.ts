import { describe, it, expect } from "vitest";
import {
  pickWebsiteManager,
  resolveWebsiteService,
  normalizePhone,
  normalizeEmail,
} from "@/lib/store/crm-extended";
import type { TeamMember } from "@/types/database";

const mk = (id: string, role: TeamMember["role"], active = true): TeamMember => ({
  id,
  first_name: id,
  last_name: "",
  email: `${id}@x.com`,
  role,
  active,
  notification_preferences: { email_assignment: true, email_confirmation: true },
  created_at: "2024-01-01T00:00:00Z",
});

const m1 = mk("m1", "manager");
const m2 = mk("m2", "manager");
const inactive = mk("m3", "manager", false);
const rep = mk("r1", "sales_representative");

describe("website manager auto-assignment (§12)", () => {
  const base = { website_assignment_mode: "default_manager", round_robin_enabled: false, round_robin_cursor: 0, default_website_manager_id: "" };

  it("default mode uses the configured default manager", () => {
    const { manager } = pickWebsiteManager([m1, m2, rep], { ...base, default_website_manager_id: "m2" });
    expect(manager?.id).toBe("m2");
  });
  it("default mode falls back to first active manager", () => {
    const { manager } = pickWebsiteManager([m1, m2], base);
    expect(manager?.id).toBe("m1");
  });
  it("round robin cycles through active managers", () => {
    const rr = { ...base, website_assignment_mode: "round_robin", round_robin_enabled: true };
    const a = pickWebsiteManager([m1, m2], { ...rr, round_robin_cursor: 0 });
    const b = pickWebsiteManager([m1, m2], { ...rr, round_robin_cursor: 1 });
    expect(a.manager?.id).toBe("m1");
    expect(a.cursorNext).toBe(1);
    expect(b.manager?.id).toBe("m2");
  });
  it("returns no manager when none are active (never crashes)", () => {
    const { manager } = pickWebsiteManager([inactive, rep], base);
    expect(manager).toBeUndefined();
  });
});

describe("website intake normalization (§12)", () => {
  it("maps standard + custom services", () => {
    expect(resolveWebsiteService("window_replacement").service_requested).toBe("window_replacement");
    expect(resolveWebsiteService("Window Repair").service_requested).toBe("window_repair");
    const custom = resolveWebsiteService("Bay Window Special");
    expect(custom.service_requested).toBe("custom");
    expect(custom.custom_service_name).toBe("Bay Window Special");
  });
  it("normalizes phone and email", () => {
    expect(normalizePhone("(555) 111-2222")).toBe("5551112222");
    expect(normalizeEmail("  Jane@Example.COM ")).toBe("jane@example.com");
  });
});
