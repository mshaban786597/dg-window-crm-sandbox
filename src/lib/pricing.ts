/**
 * Generic attribute pricing engine (§20, §22).
 *
 * Given a catalog item, its attributes, and the user's selections, compute the
 * configured internal cost and customer price (in integer cents) plus an
 * immutable snapshot of every selection. Pricing is fully data-driven — there
 * are NO window-specific hardcoded conditionals.
 */
import type {
  CatalogItem,
  CatalogAttribute,
  CatalogUniversalRange,
  QuoteItemAttributeSelection,
} from "@/types/database";
import { multiplyCents, sumCents } from "@/lib/money";

/** Selection input keyed by attribute id: option id (select) or number (numeric). */
export type SelectionInput = Record<string, string | number | undefined>;

export interface PricedConfiguration {
  configured_unit_cost_cents: number;
  configured_unit_price_cents: number;
  selections: QuoteItemAttributeSelection[];
  /** The base figures actually used, after item -> range resolution. */
  base_cost_cents_used: number;
  base_price_cents_used: number;
}

function priceAttribute(
  attr: CatalogAttribute,
  raw: string | number | undefined
): QuoteItemAttributeSelection | null {
  if (attr.type === "select") {
    const options = attr.options || [];
    const chosen =
      options.find((o) => o.id === raw) ||
      options.find((o) => o.is_default) ||
      undefined;
    if (!chosen) {
      if (attr.required && options.length > 0) {
        // No selection on a required attribute — surface as zero-priced marker.
        return {
          attribute_id: attr.id,
          attribute_name: attr.name,
          type: "select",
          option_label: "—",
          cost_cents: 0,
          upcharge_cents: 0,
        };
      }
      return null;
    }
    return {
      attribute_id: attr.id,
      attribute_name: attr.name,
      type: "select",
      option_id: chosen.id,
      option_label: chosen.label,
      cost_cents: chosen.cost_adj_cents || 0,
      upcharge_cents: chosen.upcharge_cents || 0,
    };
  }

  // numeric
  const value = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  const qty = isFinite(value) ? value : attr.default_value ?? 0;
  if (!qty && !attr.required) return null;
  return {
    attribute_id: attr.id,
    attribute_name: attr.name,
    type: "number",
    number_value: qty,
    unit_label: attr.unit_label,
    cost_cents: multiplyCents(attr.cost_per_unit_cents || 0, qty),
    upcharge_cents: multiplyCents(attr.charge_per_unit_cents || 0, qty),
  };
}

/** The size band a catalog item belongs to, when it carries its own pricing. */
export type RangePricing = Pick<
  CatalogUniversalRange,
  "base_cost_cents" | "base_price_cents"
> | null | undefined;

/**
 * Resolve the base cost/price for a configured line.
 *
 * The catalog is a hierarchy — series → window type → universal size range →
 * item — and the inventory form lets a price be set on EITHER the size range
 * (a band such as 24-36 in) or the individual item. Only the item was being
 * read, so anything priced at the range level configured at $0 and every quote
 * total came out zero.
 *
 * Precedence: an explicit item price wins (it is the more specific record);
 * otherwise the range price applies. Zero and undefined are treated the same
 * here — "not priced at this level" — because the form writes `undefined` when
 * the field is left blank and `0` when it is cleared, and neither is a
 * meaningful $0.00 list price.
 */
export function resolveBasePricing(
  item: Pick<CatalogItem, "base_cost_cents" | "base_price_cents">,
  range?: RangePricing
): { base_cost_cents: number; base_price_cents: number } {
  return {
    base_cost_cents: item.base_cost_cents || range?.base_cost_cents || 0,
    base_price_cents: item.base_price_cents || range?.base_price_cents || 0,
  };
}

/**
 * Compute the configured unit cost/price and snapshot the selections.
 *
 * `range` is optional so existing callers keep compiling, but the quote builder
 * must pass it or range-level pricing is silently lost.
 */
export function priceConfiguration(
  item: Pick<CatalogItem, "base_cost_cents" | "base_price_cents" | "attributes">,
  input: SelectionInput,
  range?: RangePricing
): PricedConfiguration {
  const selections: QuoteItemAttributeSelection[] = [];
  for (const attr of item.attributes || []) {
    if (!attr.active) continue;
    const sel = priceAttribute(attr, input[attr.id]);
    if (sel) selections.push(sel);
  }
  const attrCost = sumCents(selections.map((s) => s.cost_cents));
  const attrUpcharge = sumCents(selections.map((s) => s.upcharge_cents));
  const base = resolveBasePricing(item, range);
  return {
    configured_unit_cost_cents: base.base_cost_cents + attrCost,
    configured_unit_price_cents: base.base_price_cents + attrUpcharge,
    selections,
    // Surfaced so the quote line can snapshot the price it ACTUALLY used
    // rather than the item's (possibly empty) own field.
    base_cost_cents_used: base.base_cost_cents,
    base_price_cents_used: base.base_price_cents,
  };
}

/** Line totals for a configured unit at a given quantity. */
export function lineTotals(
  unitPriceCents: number,
  unitCostCents: number,
  quantity: number
) {
  const q = Math.max(0, Math.floor(quantity || 0));
  return {
    line_total_cents: multiplyCents(unitPriceCents, q),
    line_cost_cents: multiplyCents(unitCostCents, q),
  };
}

/** Validate a numeric attribute value against its min/max/step. */
export function validateNumericAttribute(
  attr: CatalogAttribute,
  value: number
): string | null {
  if (attr.required && (value === undefined || value === null || isNaN(value))) {
    return `${attr.name} is required`;
  }
  if (attr.min !== undefined && value < attr.min) return `${attr.name} must be ≥ ${attr.min}`;
  if (attr.max !== undefined && value > attr.max) return `${attr.name} must be ≤ ${attr.max}`;
  return null;
}
