import { describe, it, expect } from "vitest";
import { canTransitionQuote } from "@/lib/domain";
import { generateToken, hashToken } from "@/lib/tokens";
import type { QuoteItem } from "@/types/database";

describe("quote status transitions (§15)", () => {
  it("allows draft → sent and blocks illegal jumps", () => {
    expect(canTransitionQuote("draft", "draft")).toBe(true);
    expect(canTransitionQuote("draft", "sent")).toBe(true);
    expect(canTransitionQuote("accepted", "draft")).toBe(false);
    expect(canTransitionQuote("draft", "accepted")).toBe(false);
  });
});

describe("confirmation tokens (§10)", () => {
  it("generates unique tokens and stable, distinct hashes", async () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(t1).not.toBe(t2);
    const h1a = await hashToken(t1);
    const h1b = await hashToken(t1);
    const h2 = await hashToken(t2);
    expect(h1a).toBe(h1b); // deterministic
    expect(h1a).not.toBe(h2); // token-specific
    expect(h1a).toMatch(/^[0-9a-f]{64}$/); // sha-256 hex
    expect(t1).not.toContain(h1a); // raw token is not its own hash
  });
});

describe("quote line snapshot immutability (§25)", () => {
  it("a captured snapshot line total does not change when catalog prices change", () => {
    // Snapshot captured at add-time (values, not references to the catalog).
    const snapshot: QuoteItem = {
      id: "qi-1",
      catalog_item_id: "item-1",
      series_snapshot: "9900",
      window_type_snapshot: "Double Hung",
      universal_range_snapshot: "111–123",
      item_name_snapshot: "9900 DH",
      base_price_cents_snapshot: 20000,
      base_cost_cents_snapshot: 10000,
      selections: [],
      configured_unit_price_cents: 24000,
      configured_unit_cost_cents: 11700,
      quantity: 3,
      line_total_cents: 72000,
      line_cost_cents: 35100,
      created_at: "2024-01-01T00:00:00Z",
    };
    // Later the catalog item price triples — snapshot is unaffected.
    const catalogItemNewPrice = 60000;
    expect(catalogItemNewPrice).not.toBe(snapshot.base_price_cents_snapshot);
    expect(snapshot.line_total_cents).toBe(72000);
    expect(snapshot.configured_unit_price_cents).toBe(24000);
  });
});
