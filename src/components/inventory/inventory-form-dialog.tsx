"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { useCRMStore } from "@/lib/store/crm-store";
import { toCents, fromCents, formatCents } from "@/lib/money";
import {
  ATTRIBUTE_TYPES,
  ATTRIBUTE_TYPE_LABELS,
  ATTRIBUTE_UNITS,
  ATTRIBUTE_UNIT_LABELS,
  INVENTORY_MODES,
  INVENTORY_MODE_LABELS,
  type AttributeType,
  type InventoryMode,
} from "@/lib/domain";
import type {
  CatalogItem,
  CatalogAttribute,
  CatalogAttributeOption,
} from "@/types/database";

// ── Local id helper (client-side draft rows only) ────────────────
const rid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 10)}`;

// ── Draft shapes: money is held as dollar strings, converted to
//    integer cents on save (§20/§25). ──────────────────────────────
interface OptionDraft {
  id: string;
  label: string;
  cost_adj: string; // dollars
  upcharge: string; // dollars
  is_default: boolean;
  active: boolean;
}

interface AttributeDraft {
  id: string;
  name: string;
  type: AttributeType;
  required: boolean;
  active: boolean;
  // select
  options: OptionDraft[];
  // number
  unit_label: string;
  cost_per_unit: string; // dollars
  charge_per_unit: string; // dollars
  min: string;
  max: string;
  step: string;
  default_value: string;
}

interface FormState {
  name: string;
  series_id: string;
  window_type_id: string;
  universal_range_id: string;
  base_cost: string; // dollars
  base_price: string; // dollars
  supplier: string;
  sku: string;
  inventory_mode: InventoryMode;
  quantity: string;
  reorder_level: string;
  notes: string;
  attributes: AttributeDraft[];
}

const EMPTY: FormState = {
  name: "",
  series_id: "",
  window_type_id: "",
  universal_range_id: "",
  base_cost: "",
  base_price: "",
  supplier: "",
  sku: "",
  inventory_mode: "tracked",
  quantity: "",
  reorder_level: "",
  notes: "",
  attributes: [],
};

function numOrUndef(s: string): number | undefined {
  const t = s.trim();
  if (t === "") return undefined;
  const n = Number(t);
  return isFinite(n) ? n : undefined;
}

function toAttrDraft(a: CatalogAttribute): AttributeDraft {
  return {
    id: a.id,
    name: a.name,
    type: a.type,
    required: a.required,
    active: a.active,
    options: (a.options ?? []).map((o) => ({
      id: o.id,
      label: o.label,
      cost_adj: o.cost_adj_cents ? String(fromCents(o.cost_adj_cents)) : "",
      upcharge: o.upcharge_cents ? String(fromCents(o.upcharge_cents)) : "",
      is_default: o.is_default,
      active: o.active,
    })),
    unit_label: a.unit_label ?? ATTRIBUTE_UNITS[0],
    cost_per_unit: a.cost_per_unit_cents ? String(fromCents(a.cost_per_unit_cents)) : "",
    charge_per_unit: a.charge_per_unit_cents ? String(fromCents(a.charge_per_unit_cents)) : "",
    min: a.min != null ? String(a.min) : "",
    max: a.max != null ? String(a.max) : "",
    step: a.step != null ? String(a.step) : "",
    default_value: a.default_value != null ? String(a.default_value) : "",
  };
}

function toForm(item: CatalogItem | null | undefined): FormState {
  if (!item) return { ...EMPTY };
  return {
    name: item.name,
    series_id: item.series_id,
    window_type_id: item.window_type_id,
    universal_range_id: item.universal_range_id ?? "",
    base_cost: item.base_cost_cents ? String(fromCents(item.base_cost_cents)) : "",
    base_price: item.base_price_cents ? String(fromCents(item.base_price_cents)) : "",
    supplier: item.supplier ?? "",
    sku: item.sku ?? "",
    inventory_mode: item.inventory_mode,
    quantity: item.quantity != null ? String(item.quantity) : "",
    reorder_level: item.reorder_level != null ? String(item.reorder_level) : "",
    notes: item.notes ?? "",
    attributes: item.attributes.map(toAttrDraft),
  };
}

const newOption = (): OptionDraft => ({
  id: rid("opt"),
  label: "",
  cost_adj: "",
  upcharge: "",
  is_default: false,
  active: true,
});

const newAttribute = (): AttributeDraft => ({
  id: rid("attr"),
  name: "",
  type: "select",
  required: false,
  active: true,
  options: [newOption()],
  unit_label: ATTRIBUTE_UNITS[0],
  cost_per_unit: "",
  charge_per_unit: "",
  min: "",
  max: "",
  step: "",
  default_value: "",
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: CatalogItem | null;
}

const SECTION =
  "rounded-lg border border-border bg-card p-4 space-y-4";
const SECTION_TITLE =
  "text-sm font-semibold text-brand-blue flex items-center gap-2";

export function InventoryFormDialog({ open, onOpenChange, item }: Props) {
  const catalogSeries = useCRMStore((s) => s.catalogSeries);
  const catalogWindowTypes = useCRMStore((s) => s.catalogWindowTypes);
  const catalogUniversalRanges = useCRMStore((s) => s.catalogUniversalRanges);
  const catalogItems = useCRMStore((s) => s.catalogItems);
  const addCatalogSeries = useCRMStore((s) => s.addCatalogSeries);
  const addCatalogWindowType = useCRMStore((s) => s.addCatalogWindowType);
  const addCatalogRange = useCRMStore((s) => s.addCatalogRange);
  const addCatalogItem = useCRMStore((s) => s.addCatalogItem);
  const updateCatalogItem = useCRMStore((s) => s.updateCatalogItem);
  const showToast = useCRMStore((s) => s.showToast);

  const [form, setForm] = useState<FormState>(EMPTY);
  const uid = useId();

  // Inline creators for the dependent catalog hierarchy.
  const [seriesDraft, setSeriesDraft] = useState({ open: false, name: "", desc: "" });
  const [typeDraft, setTypeDraft] = useState({ open: false, name: "" });
  const [rangeDraft, setRangeDraft] = useState({
    open: false,
    label: "",
    min: "",
    max: "",
    cost: "",
    price: "",
    error: "",
  });

  useEffect(() => {
    setForm(toForm(item));
    setSeriesDraft({ open: false, name: "", desc: "" });
    setTypeDraft({ open: false, name: "" });
    setRangeDraft({ open: false, label: "", min: "", max: "", cost: "", price: "", error: "" });
  }, [item, open]);

  // Dependent option lists (include archived/inactive parents that the
  // current item already references so an edit never loses its selection).
  const seriesOptions = useMemo(
    () =>
      catalogSeries
        .filter((s) => s.active || s.id === form.series_id)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({ value: s.id, label: s.name })),
    [catalogSeries, form.series_id]
  );

  const windowTypeOptions = useMemo(
    () =>
      catalogWindowTypes
        .filter((w) => w.series_id === form.series_id && (w.active || w.id === form.window_type_id))
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((w) => ({ value: w.id, label: w.name })),
    [catalogWindowTypes, form.series_id, form.window_type_id]
  );

  const rangeOptions = useMemo(
    () =>
      catalogUniversalRanges
        .filter(
          (r) => r.window_type_id === form.window_type_id && (r.active || r.id === form.universal_range_id)
        )
        .sort((a, b) => a.min_in - b.min_in)
        .map((r) => ({ value: r.id, label: `${r.label} (${r.min_in}"–${r.max_in}")` })),
    [catalogUniversalRanges, form.window_type_id, form.universal_range_id]
  );

  const seriesName = catalogSeries.find((s) => s.id === form.series_id)?.name ?? "—";
  const windowTypeName = catalogWindowTypes.find((w) => w.id === form.window_type_id)?.name ?? "—";
  const rangeLabel = catalogUniversalRanges.find((r) => r.id === form.universal_range_id)?.label ?? "Any size";

  // ── Field setters ──────────────────────────────────────────────
  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSeriesChange = (v: string) =>
    setForm((f) => ({ ...f, series_id: v, window_type_id: "", universal_range_id: "" }));
  const onTypeChange = (v: string) =>
    setForm((f) => ({ ...f, window_type_id: v, universal_range_id: "" }));

  // ── Inline creators ────────────────────────────────────────────
  const createSeries = () => {
    const name = seriesDraft.name.trim();
    if (!name) return;
    const created = addCatalogSeries(name, seriesDraft.desc.trim() || undefined);
    setForm((f) => ({ ...f, series_id: created.id, window_type_id: "", universal_range_id: "" }));
    setSeriesDraft({ open: false, name: "", desc: "" });
  };

  const createWindowType = () => {
    const name = typeDraft.name.trim();
    if (!name || !form.series_id) return;
    const created = addCatalogWindowType(form.series_id, name);
    setForm((f) => ({ ...f, window_type_id: created.id, universal_range_id: "" }));
    setTypeDraft({ open: false, name: "" });
  };

  const createRange = () => {
    const label = rangeDraft.label.trim();
    const min = Number(rangeDraft.min);
    const max = Number(rangeDraft.max);
    if (!label) {
      setRangeDraft((r) => ({ ...r, error: "Label is required." }));
      return;
    }
    if (!isFinite(min) || !isFinite(max) || rangeDraft.min === "" || rangeDraft.max === "") {
      setRangeDraft((r) => ({ ...r, error: "Min and max inches are required." }));
      return;
    }
    if (min > max) {
      setRangeDraft((r) => ({ ...r, error: "Min inches must be less than or equal to max inches." }));
      return;
    }
    // Prevent overlapping ACTIVE ranges within the same window type.
    const overlap = catalogUniversalRanges.some(
      (r) => r.window_type_id === form.window_type_id && r.active && min <= r.max_in && r.min_in <= max
    );
    if (overlap) {
      setRangeDraft((r) => ({
        ...r,
        error: "This range overlaps an existing active range for this window type.",
      }));
      return;
    }
    const created = addCatalogRange({
      window_type_id: form.window_type_id,
      label,
      min_in: min,
      max_in: max,
      base_cost_cents: rangeDraft.cost ? toCents(rangeDraft.cost) : undefined,
      base_price_cents: rangeDraft.price ? toCents(rangeDraft.price) : undefined,
    });
    setForm((f) => ({ ...f, universal_range_id: created.id }));
    setRangeDraft({ open: false, label: "", min: "", max: "", cost: "", price: "", error: "" });
  };

  // ── Attribute editing ──────────────────────────────────────────
  const patchAttr = (id: string, patch: Partial<AttributeDraft>) =>
    setForm((f) => ({
      ...f,
      attributes: f.attributes.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));

  const removeAttr = (id: string) =>
    setForm((f) => ({ ...f, attributes: f.attributes.filter((a) => a.id !== id) }));

  const patchOption = (attrId: string, optId: string, patch: Partial<OptionDraft>) =>
    setForm((f) => ({
      ...f,
      attributes: f.attributes.map((a) =>
        a.id === attrId
          ? {
              ...a,
              options: a.options.map((o) =>
                o.id === optId
                  ? { ...o, ...patch }
                  : // exclusive default: clearing others when one becomes default
                    patch.is_default ? { ...o, is_default: false } : o
              ),
            }
          : a
      ),
    }));

  const addOption = (attrId: string) =>
    patchAttr(attrId, {
      options: [...(form.attributes.find((a) => a.id === attrId)?.options ?? []), newOption()],
    });

  const removeOption = (attrId: string, optId: string) =>
    setForm((f) => ({
      ...f,
      attributes: f.attributes.map((a) =>
        a.id === attrId ? { ...a, options: a.options.filter((o) => o.id !== optId) } : a
      ),
    }));

  // ── Save ───────────────────────────────────────────────────────
  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    const name = form.name.trim();
    if (!name) return showToast("error", "Item name is required.");
    if (!form.series_id) return showToast("error", "Select or create a Series.");
    if (!form.window_type_id) return showToast("error", "Select or create a Window Type.");

    for (const a of form.attributes) {
      if (!a.name.trim()) return showToast("error", "Every attribute needs a name.");
      if (a.type === "select" && a.options.filter((o) => o.label.trim()).length === 0)
        return showToast("error", `Attribute "${a.name}" needs at least one option.`);
    }

    // Duplicate catalog combination guard (series + type + range + name).
    const dup = catalogItems.some(
      (ci) =>
        ci.id !== item?.id &&
        !ci.archived &&
        ci.series_id === form.series_id &&
        ci.window_type_id === form.window_type_id &&
        (ci.universal_range_id ?? "") === (form.universal_range_id || "") &&
        ci.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (dup)
      return showToast("error", "An item with this series, type, range and name already exists.");

    const builtAttrs: CatalogAttribute[] = form.attributes.map((a, i) => {
      const base = {
        id: a.id,
        item_id: item?.id ?? "",
        name: a.name.trim(),
        type: a.type,
        required: a.required,
        active: a.active,
        sort_order: i,
      };
      if (a.type === "select") {
        const options: CatalogAttributeOption[] = a.options
          .filter((o) => o.label.trim())
          .map((o, j) => ({
            id: o.id,
            label: o.label.trim(),
            cost_adj_cents: toCents(o.cost_adj),
            upcharge_cents: toCents(o.upcharge),
            is_default: o.is_default,
            active: o.active,
            sort_order: j,
          }));
        return { ...base, options };
      }
      return {
        ...base,
        unit_label: a.unit_label,
        cost_per_unit_cents: toCents(a.cost_per_unit),
        charge_per_unit_cents: toCents(a.charge_per_unit),
        min: numOrUndef(a.min),
        max: numOrUndef(a.max),
        step: numOrUndef(a.step),
        default_value: numOrUndef(a.default_value),
      };
    });

    const payload = {
      name,
      series_id: form.series_id,
      window_type_id: form.window_type_id,
      universal_range_id: form.universal_range_id || undefined,
      base_cost_cents: toCents(form.base_cost),
      base_price_cents: toCents(form.base_price),
      supplier: form.supplier.trim() || undefined,
      sku: form.sku.trim() || undefined,
      inventory_mode: form.inventory_mode,
      quantity: form.inventory_mode === "tracked" ? numOrUndef(form.quantity) ?? 0 : undefined,
      reorder_level: form.inventory_mode === "tracked" ? numOrUndef(form.reorder_level) ?? 0 : undefined,
      notes: form.notes.trim() || undefined,
      attributes: builtAttrs,
    };

    if (item) {
      updateCatalogItem(item.id, payload);
      showToast("success", "Inventory item updated");
    } else {
      addCatalogItem(payload);
    }
    onOpenChange(false);
  };

  const previewPriceCents = toCents(form.base_price);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Inventory Item" : "Add Inventory Item"}</DialogTitle>
          <DialogDescription>
            Define a sellable window product: catalog classification, pricing, quantity mode and
            configurable attributes used by the Quote Builder.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── A) Catalog Classification ───────────────────────── */}
          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>A. Catalog Classification</h3>

            <div className="grid gap-4 sm:grid-cols-3">
              {/* Series */}
              <div className="space-y-1.5">
                <SelectField
                  label="Series *"
                  value={form.series_id}
                  onChange={onSeriesChange}
                  options={[{ value: "", label: "Select series…" }, ...seriesOptions]}
                />
                <button
                  type="button"
                  className="text-xs font-medium text-brand-blue hover:underline"
                  onClick={() => setSeriesDraft((d) => ({ ...d, open: !d.open }))}
                >
                  {seriesDraft.open ? "Cancel" : "+ New series"}
                </button>
              </div>

              {/* Window Type */}
              <div className="space-y-1.5">
                <SelectField
                  label="Window Type *"
                  value={form.window_type_id}
                  onChange={onTypeChange}
                  disabled={!form.series_id}
                  options={[{ value: "", label: "Select type…" }, ...windowTypeOptions]}
                />
                <button
                  type="button"
                  disabled={!form.series_id}
                  className="text-xs font-medium text-brand-blue hover:underline disabled:opacity-40"
                  onClick={() => setTypeDraft((d) => ({ ...d, open: !d.open }))}
                >
                  {typeDraft.open ? "Cancel" : "+ New window type"}
                </button>
              </div>

              {/* Universal Range */}
              <div className="space-y-1.5">
                <SelectField
                  label="Universal Inches Range"
                  value={form.universal_range_id}
                  onChange={(v) => setField("universal_range_id", v)}
                  disabled={!form.window_type_id}
                  options={[{ value: "", label: "Any size / none" }, ...rangeOptions]}
                />
                <button
                  type="button"
                  disabled={!form.window_type_id}
                  className="text-xs font-medium text-brand-blue hover:underline disabled:opacity-40"
                  onClick={() => setRangeDraft((d) => ({ ...d, open: !d.open }))}
                >
                  {rangeDraft.open ? "Cancel" : "+ New range"}
                </button>
              </div>
            </div>

            {/* Inline: new series */}
            {seriesDraft.open && (
              <div className="rounded-md border border-dashed bg-brand-blue-light/40 p-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label htmlFor={`${uid}-series-name`}>Series name</Label>
                    <Input
                      id={`${uid}-series-name`}
                      value={seriesDraft.name}
                      onChange={(e) => setSeriesDraft((d) => ({ ...d, name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${uid}-series-desc`}>Description (optional)</Label>
                    <Input
                      id={`${uid}-series-desc`}
                      value={seriesDraft.desc}
                      onChange={(e) => setSeriesDraft((d) => ({ ...d, desc: e.target.value }))}
                    />
                  </div>
                </div>
                <Button type="button" size="sm" className="bg-primary hover:bg-brand-blue-dark" onClick={createSeries}>
                  Add series
                </Button>
              </div>
            )}

            {/* Inline: new window type */}
            {typeDraft.open && form.series_id && (
              <div className="rounded-md border border-dashed bg-brand-blue-light/40 p-3 space-y-2">
                <div>
                  <Label htmlFor={`${uid}-type-name`}>Window type name</Label>
                  <Input
                    id={`${uid}-type-name`}
                    value={typeDraft.name}
                    onChange={(e) => setTypeDraft((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. Double Hung"
                  />
                </div>
                <Button type="button" size="sm" className="bg-primary hover:bg-brand-blue-dark" onClick={createWindowType}>
                  Add window type
                </Button>
              </div>
            )}

            {/* Inline: new range */}
            {rangeDraft.open && form.window_type_id && (
              <div className="rounded-md border border-dashed bg-brand-blue-light/40 p-3 space-y-2">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div>
                    <Label htmlFor={`${uid}-range-label`}>Range label</Label>
                    <Input
                      id={`${uid}-range-label`}
                      value={rangeDraft.label}
                      onChange={(e) => setRangeDraft((d) => ({ ...d, label: e.target.value }))}
                      placeholder="e.g. Up to 101 UI"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${uid}-range-min`}>Min inches</Label>
                    <Input
                      id={`${uid}-range-min`}
                      type="number"
                      value={rangeDraft.min}
                      onChange={(e) => setRangeDraft((d) => ({ ...d, min: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${uid}-range-max`}>Max inches</Label>
                    <Input
                      id={`${uid}-range-max`}
                      type="number"
                      value={rangeDraft.max}
                      onChange={(e) => setRangeDraft((d) => ({ ...d, max: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${uid}-range-cost`}>Base cost ($, optional)</Label>
                    <Input
                      id={`${uid}-range-cost`}
                      type="number"
                      step="0.01"
                      value={rangeDraft.cost}
                      onChange={(e) => setRangeDraft((d) => ({ ...d, cost: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${uid}-range-price`}>Base price ($, optional)</Label>
                    <Input
                      id={`${uid}-range-price`}
                      type="number"
                      step="0.01"
                      value={rangeDraft.price}
                      onChange={(e) => setRangeDraft((d) => ({ ...d, price: e.target.value }))}
                    />
                  </div>
                </div>
                {rangeDraft.error && <p className="text-xs text-red-600">{rangeDraft.error}</p>}
                <Button type="button" size="sm" className="bg-primary hover:bg-brand-blue-dark" onClick={createRange}>
                  Add range
                </Button>
              </div>
            )}
          </section>

          {/* ── B) Base Product ─────────────────────────────────── */}
          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>B. Base Product</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor={`${uid}-name`}>Item Name *</Label>
                <Input
                  id={`${uid}-name`}
                  value={form.name}
                  onChange={(e) => setField("name", e.target.value)}
                  placeholder="e.g. 4400 Double Hung"
                />
              </div>
              <div>
                <Label htmlFor={`${uid}-cost`}>Internal Cost ($)</Label>
                <Input
                  id={`${uid}-cost`}
                  type="number"
                  step="0.01"
                  value={form.base_cost}
                  onChange={(e) => setField("base_cost", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`${uid}-price`}>Sale Price ($)</Label>
                <Input
                  id={`${uid}-price`}
                  type="number"
                  step="0.01"
                  value={form.base_price}
                  onChange={(e) => setField("base_price", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`${uid}-supplier`}>Supplier</Label>
                <Input
                  id={`${uid}-supplier`}
                  value={form.supplier}
                  onChange={(e) => setField("supplier", e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor={`${uid}-sku`}>SKU</Label>
                <Input
                  id={`${uid}-sku`}
                  value={form.sku}
                  onChange={(e) => setField("sku", e.target.value)}
                />
              </div>
              <div>
                <SelectField
                  label="Inventory Mode"
                  value={form.inventory_mode}
                  onChange={(v) => setField("inventory_mode", v as InventoryMode)}
                  options={INVENTORY_MODES.map((m) => ({ value: m, label: INVENTORY_MODE_LABELS[m] }))}
                />
              </div>
              {form.inventory_mode === "tracked" ? (
                <>
                  <div>
                    <Label htmlFor={`${uid}-qty`}>Quantity</Label>
                    <Input
                      id={`${uid}-qty`}
                      type="number"
                      value={form.quantity}
                      onChange={(e) => setField("quantity", e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`${uid}-reorder`}>Reorder Level</Label>
                    <Input
                      id={`${uid}-reorder`}
                      type="number"
                      value={form.reorder_level}
                      onChange={(e) => setField("reorder_level", e.target.value)}
                    />
                  </div>
                </>
              ) : (
                <div className="flex items-end">
                  <p className="text-sm font-medium text-brand-blue">Unlimited / Ordered Per Job</p>
                </div>
              )}
              <div className="sm:col-span-2">
                <Label htmlFor={`${uid}-notes`}>Notes</Label>
                <Textarea
                  id={`${uid}-notes`}
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setField("notes", e.target.value)}
                />
              </div>
            </div>
          </section>

          {/* ── C) Attributes ───────────────────────────────────── */}
          <section className={SECTION}>
            <div className="flex items-center justify-between">
              <h3 className={SECTION_TITLE}>C. Attributes</h3>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setForm((f) => ({ ...f, attributes: [...f.attributes, newAttribute()] }))}
              >
                <Plus className="h-4 w-4" /> Add attribute
              </Button>
            </div>

            {form.attributes.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No attributes yet. Attributes let a quote configure options (e.g. color, grid) or
                per-unit quantities (e.g. square feet).
              </p>
            )}

            <div className="space-y-4">
              {form.attributes.map((a) => (
                <div key={a.id} className="rounded-md border p-3 space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_170px_auto] sm:items-end">
                    <div>
                      <Label htmlFor={`${uid}-${a.id}-name`}>Attribute name</Label>
                      <Input
                        id={`${uid}-${a.id}-name`}
                        value={a.name}
                        onChange={(e) => patchAttr(a.id, { name: e.target.value })}
                        placeholder="e.g. Exterior Color"
                      />
                    </div>
                    <SelectField
                      label="Type"
                      value={a.type}
                      onChange={(v) => patchAttr(a.id, { type: v as AttributeType })}
                      options={ATTRIBUTE_TYPES.map((t) => ({ value: t, label: ATTRIBUTE_TYPE_LABELS[t] }))}
                    />
                    <div className="flex items-center gap-3 pb-1">
                      <label className="flex items-center gap-1.5 text-xs">
                        <input
                          type="checkbox"
                          checked={a.required}
                          onChange={(e) => patchAttr(a.id, { required: e.target.checked })}
                        />
                        Required
                      </label>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="text-red-600"
                        aria-label="Remove attribute"
                        onClick={() => removeAttr(a.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  {a.type === "select" ? (
                    <div className="space-y-2">
                      <div className="hidden gap-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[1fr_110px_110px_auto]">
                        <span>Option label</span>
                        <span>Cost adj ($)</span>
                        <span>Upcharge ($)</span>
                        <span>Default</span>
                      </div>
                      {a.options.map((o) => (
                        <div key={o.id} className="grid gap-2 sm:grid-cols-[1fr_110px_110px_auto] sm:items-center">
                          <Input
                            aria-label="Option label"
                            value={o.label}
                            onChange={(e) => patchOption(a.id, o.id, { label: e.target.value })}
                            placeholder="e.g. White"
                          />
                          <Input
                            aria-label="Cost adjustment"
                            type="number"
                            step="0.01"
                            value={o.cost_adj}
                            onChange={(e) => patchOption(a.id, o.id, { cost_adj: e.target.value })}
                          />
                          <Input
                            aria-label="Customer upcharge"
                            type="number"
                            step="0.01"
                            value={o.upcharge}
                            onChange={(e) => patchOption(a.id, o.id, { upcharge: e.target.value })}
                          />
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={o.is_default}
                                onChange={(e) => patchOption(a.id, o.id, { is_default: e.target.checked })}
                              />
                              Default
                            </label>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="text-red-600"
                              aria-label="Remove option"
                              onClick={() => removeOption(a.id, o.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      <Button type="button" size="sm" variant="outline" onClick={() => addOption(a.id)}>
                        <Plus className="h-4 w-4" /> Add option
                      </Button>
                    </div>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      <SelectField
                        label="Unit"
                        value={a.unit_label}
                        onChange={(v) => patchAttr(a.id, { unit_label: v })}
                        options={ATTRIBUTE_UNITS.map((u) => ({ value: u, label: ATTRIBUTE_UNIT_LABELS[u] }))}
                      />
                      <div>
                        <Label htmlFor={`${uid}-${a.id}-cpu`}>Internal cost / unit ($)</Label>
                        <Input
                          id={`${uid}-${a.id}-cpu`}
                          type="number"
                          step="0.01"
                          value={a.cost_per_unit}
                          onChange={(e) => patchAttr(a.id, { cost_per_unit: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${uid}-${a.id}-chpu`}>Customer charge / unit ($)</Label>
                        <Input
                          id={`${uid}-${a.id}-chpu`}
                          type="number"
                          step="0.01"
                          value={a.charge_per_unit}
                          onChange={(e) => patchAttr(a.id, { charge_per_unit: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${uid}-${a.id}-min`}>Min</Label>
                        <Input
                          id={`${uid}-${a.id}-min`}
                          type="number"
                          value={a.min}
                          onChange={(e) => patchAttr(a.id, { min: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${uid}-${a.id}-max`}>Max</Label>
                        <Input
                          id={`${uid}-${a.id}-max`}
                          type="number"
                          value={a.max}
                          onChange={(e) => patchAttr(a.id, { max: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${uid}-${a.id}-step`}>Step</Label>
                        <Input
                          id={`${uid}-${a.id}-step`}
                          type="number"
                          value={a.step}
                          onChange={(e) => patchAttr(a.id, { step: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`${uid}-${a.id}-def`}>Default value</Label>
                        <Input
                          id={`${uid}-${a.id}-def`}
                          type="number"
                          value={a.default_value}
                          onChange={(e) => patchAttr(a.id, { default_value: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── D) Preview ──────────────────────────────────────── */}
          <section className={SECTION}>
            <h3 className={SECTION_TITLE}>D. Quote Builder Preview</h3>
            <div className="rounded-md border bg-background p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-foreground">{form.name.trim() || "Untitled item"}</p>
                  <p className="text-xs text-muted-foreground">
                    {seriesName} · {windowTypeName} · {rangeLabel}
                  </p>
                </div>
                <p className="text-lg font-bold text-brand-blue">{formatCents(previewPriceCents)}</p>
              </div>
              {form.attributes.length > 0 && (
                <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {form.attributes.map((a) => (
                    <li key={a.id}>
                      <span className="font-medium text-foreground">{a.name.trim() || "Attribute"}:</span>{" "}
                      {a.type === "select"
                        ? `${a.options.filter((o) => o.label.trim()).length} option(s)`
                        : `numeric per ${ATTRIBUTE_UNIT_LABELS[a.unit_label] ?? a.unit_label}`}
                      {a.required ? " · required" : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary hover:bg-brand-blue-dark">
              {item ? "Save Changes" : "Save Item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
