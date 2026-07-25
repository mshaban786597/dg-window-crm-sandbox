import { describe, it, expect } from "vitest";
import { priceConfiguration, lineTotals, validateNumericAttribute } from "@/lib/pricing";
import type { CatalogItem } from "@/types/database";

const item: Pick<CatalogItem, "base_cost_cents" | "base_price_cents" | "attributes"> = {
  base_cost_cents: 10000,
  base_price_cents: 20000,
  attributes: [
    {
      id: "attr-color",
      item_id: "i1",
      name: "Exterior Color",
      type: "select",
      required: true,
      active: true,
      sort_order: 0,
      options: [
        { id: "opt-white", label: "White", cost_adj_cents: 0, upcharge_cents: 0, is_default: true, active: true, sort_order: 0 },
        { id: "opt-bronze", label: "Bronze", cost_adj_cents: 500, upcharge_cents: 1000, is_default: false, active: true, sort_order: 1 },
      ],
    },
    {
      id: "attr-temp",
      item_id: "i1",
      name: "Tempered Glass",
      type: "number",
      required: false,
      active: true,
      sort_order: 1,
      unit_label: "square_feet",
      cost_per_unit_cents: 100,
      charge_per_unit_cents: 250,
      min: 0,
      max: 100,
      step: 1,
    },
  ],
};

describe("pricing engine (§20/§22)", () => {
  it("prices a select option + numeric attribute generically", () => {
    const r = priceConfiguration(item, { "attr-color": "opt-bronze", "attr-temp": 12 });
    // cost = 10000 + 500 + 100*12
    expect(r.configured_unit_cost_cents).toBe(11700);
    // price = 20000 + 1000 + 250*12
    expect(r.configured_unit_price_cents).toBe(24000);
    expect(r.selections).toHaveLength(2);
    const temp = r.selections.find((s) => s.attribute_id === "attr-temp")!;
    expect(temp.number_value).toBe(12);
    expect(temp.upcharge_cents).toBe(3000);
  });

  it("falls back to the default select option", () => {
    const r = priceConfiguration(item, { "attr-temp": 0 });
    const color = r.selections.find((s) => s.attribute_id === "attr-color")!;
    expect(color.option_id).toBe("opt-white");
    expect(r.configured_unit_price_cents).toBe(20000);
  });

  it("computes line totals by quantity", () => {
    const t = lineTotals(24000, 11700, 3);
    expect(t.line_total_cents).toBe(72000);
    expect(t.line_cost_cents).toBe(35100);
  });

  it("validates numeric attribute bounds", () => {
    const attr = item.attributes[1];
    expect(validateNumericAttribute(attr, 5)).toBeNull();
    expect(validateNumericAttribute(attr, 200)).toMatch(/≤ 100/);
  });
});
