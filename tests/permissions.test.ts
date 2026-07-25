import { describe, it, expect } from "vitest";
import {
  getVisibleQuoteOwnerIds,
  canViewQuote,
  canEditQuote,
  wouldCreateManagerCycle,
  activeSalesReps,
  canViewCost,
} from "@/lib/permissions";
import type { TeamMember, Quote } from "@/types/database";

const mk = (id: string, role: TeamMember["role"], extra: Partial<TeamMember> = {}): TeamMember => ({
  id,
  first_name: id,
  last_name: "",
  email: `${id}@x.com`,
  role,
  active: true,
  notification_preferences: { email_assignment: true, email_confirmation: true },
  created_at: "2024-01-01T00:00:00Z",
  ...extra,
});

const admin = mk("a", "administrator");
const mgr = mk("m", "manager");
const rep1 = mk("r1", "sales_representative", { manager_id: "m" });
const rep2 = mk("r2", "sales_representative");
const mkt = mk("k", "marketing");
const repInactive = mk("r3", "sales_representative", { active: false });
const team = [admin, mgr, rep1, rep2, mkt, repInactive];

const q = (owner_id: string): Pick<Quote, "owner_id"> => ({ owner_id });

describe("quote visibility (§14/§30)", () => {
  it("administrator sees all", () => {
    expect(getVisibleQuoteOwnerIds(admin, team)).toBeNull();
    expect(canViewQuote(admin, q("r2"), team)).toBe(true);
  });
  it("manager sees own + managed reps", () => {
    expect(getVisibleQuoteOwnerIds(mgr, team)).toEqual(["m", "r1"]);
    expect(canViewQuote(mgr, q("r1"), team)).toBe(true);
    expect(canViewQuote(mgr, q("r2"), team)).toBe(false);
  });
  it("sales rep sees only own", () => {
    expect(getVisibleQuoteOwnerIds(rep1, team)).toEqual(["r1"]);
    expect(canViewQuote(rep1, q("r1"), team)).toBe(true);
    expect(canViewQuote(rep1, q("r2"), team)).toBe(false);
  });
  it("marketing has no quote access and cannot edit", () => {
    expect(getVisibleQuoteOwnerIds(mkt, team)).toEqual([]);
    expect(canViewQuote(mkt, q("r1"), team)).toBe(false);
    expect(canEditQuote(mkt, q("r1"), team)).toBe(false);
  });
});

describe("manager relationships (§7)", () => {
  it("prevents self-management", () => {
    expect(wouldCreateManagerCycle(team, "m", "m")).toBe(true);
  });
  it("prevents cycles", () => {
    // making m report to r1 (whose manager is m) would loop
    expect(wouldCreateManagerCycle(team, "m", "r1")).toBe(true);
  });
  it("allows a valid manager assignment", () => {
    expect(wouldCreateManagerCycle(team, "r2", "m")).toBe(false);
  });
});

describe("assignee + cost visibility", () => {
  it("only active sales reps are assignable", () => {
    expect(activeSalesReps(team).map((m) => m.id)).toEqual(["r1", "r2"]);
  });
  it("cost visibility follows role", () => {
    expect(canViewCost(admin)).toBe(true);
    expect(canViewCost(rep1)).toBe(false);
    expect(canViewCost(mkt)).toBe(false);
    expect(canViewCost(mgr, false)).toBe(false);
    expect(canViewCost(mgr, true)).toBe(true);
  });
});
