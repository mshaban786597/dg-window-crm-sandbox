import { describe, it, expect } from "vitest";
import { priceConfiguration, resolveBasePricing, lineTotals } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import type { CatalogAttribute } from "@/types/database";

/**
 * Regression cover for the "quote total shows $0" bug.
 *
 * The catalog prices at two levels — the universal size range (a band such as
 * 24-36 in) and the individual item. The pricing engine only ever read the
 * item, so anything priced at the range level configured at zero and every
 * quote total came out $0.00 with no error shown anywhere.
 */

const noAttrs: CatalogAttribute[] = [];

describe("base price resolution (item vs universal range)", () => {
  it("uses the item's own price when it has one", () => {
    const r = resolveBasePricing({ base_price_cents: 45000, base_cost_cents: 20000 }, null);
    expect(r.base_price_cents).toBe(45000);
    expect(r.base_cost_cents).toBe(20000);
  });

  it("falls back to the range price when the item has none — the reported bug", () => {
    // CatalogItem types these as required numbers, so an unpriced item is 0.
    const r = resolveBasePricing(
      { base_price_cents: 0, base_cost_cents: 0 },
      { base_price_cents: 32500, base_cost_cents: 15000 }
    );
    expect(r.base_price_cents).toBe(32500);
    expect(r.base_cost_cents).toBe(15000);
  });

  it("treats an explicit 0 on the item as 'not priced here' and uses the range", () => {
    // The form writes 0 for a cleared field and undefined for a blank one;
    // neither is a meaningful $0.00 list price.
    const r = resolveBasePricing(
      { base_price_cents: 0, base_cost_cents: 0 },
      { base_price_cents: 32500, base_cost_cents: 15000 }
    );
    expect(r.base_price_cents).toBe(32500);
  });

  it("prefers the item over the range when both are priced", () => {
    const r = resolveBasePricing(
      { base_price_cents: 50000, base_cost_cents: 25000 },
      { base_price_cents: 32500, base_cost_cents: 15000 }
    );
    expect(r.base_price_cents).toBe(50000);
  });

  it("is 0 only when nothing is priced anywhere", () => {
    const unpriced = { base_price_cents: 0, base_cost_cents: 0 };
    expect(resolveBasePricing(unpriced, null).base_price_cents).toBe(0);
    expect(resolveBasePricing(unpriced, undefined).base_price_cents).toBe(0);
    expect(resolveBasePricing(unpriced, { base_price_cents: undefined }).base_price_cents).toBe(0);
  });
});

describe("priceConfiguration end to end", () => {
  it("produces a non-zero total for a range-priced item", () => {
    const priced = priceConfiguration(
      { base_price_cents: 0, base_cost_cents: 0, attributes: noAttrs },
      {},
      { base_price_cents: 32500, base_cost_cents: 15000 }
    );
    expect(priced.configured_unit_price_cents).toBe(32500);
    expect(priced.base_price_cents_used).toBe(32500);

    const { line_total_cents } = lineTotals(priced.configured_unit_price_cents, priced.configured_unit_cost_cents, 3);
    expect(line_total_cents).toBe(97500);
    expect(formatCents(line_total_cents)).toBe("$975.00");
  });

  it("adds attribute upcharges on top of the resolved base", () => {
    const attrs: CatalogAttribute[] = [
      {
        id: "a1",
        name: "Grid pattern",
        type: "select",
        active: true,
        required: false,
        options: [{ id: "o1", label: "Colonial", upcharge_cents: 4500, cost_adj_cents: 2000, is_default: true }],
      } as CatalogAttribute,
    ];
    const priced = priceConfiguration(
      { base_price_cents: 0, base_cost_cents: 0, attributes: attrs },
      { a1: "o1" },
      { base_price_cents: 32500, base_cost_cents: 15000 }
    );
    expect(priced.configured_unit_price_cents).toBe(32500 + 4500);
  });

  it("still reports 0 honestly when nothing is priced", () => {
    const priced = priceConfiguration(
      { base_price_cents: 0, base_cost_cents: 0, attributes: noAttrs },
      {},
      null
    );
    expect(priced.configured_unit_price_cents).toBe(0);
    expect(formatCents(priced.configured_unit_price_cents)).toBe("$0.00");
  });
});
