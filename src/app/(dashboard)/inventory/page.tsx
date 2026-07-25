"use client";

import { useMemo, useState } from "react";
import { Pencil, Copy, Archive, Package, Settings2, ChevronUp, ChevronDown, Plus, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { InventoryFormDialog } from "@/components/inventory/inventory-form-dialog";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import { canViewCost, isAdmin } from "@/lib/permissions";
import { formatCents } from "@/lib/money";
import { INVENTORY_MODE_LABELS } from "@/lib/domain";
import type { CatalogItem } from "@/types/database";

export default function InventoryPage() {
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const catalogItems = useCRMStore((s) => s.catalogItems);
  const catalogSeries = useCRMStore((s) => s.catalogSeries);
  const catalogWindowTypes = useCRMStore((s) => s.catalogWindowTypes);
  const catalogUniversalRanges = useCRMStore((s) => s.catalogUniversalRanges);
  const duplicateCatalogItem = useCRMStore((s) => s.duplicateCatalogItem);
  const archiveCatalogItem = useCRMStore((s) => s.archiveCatalogItem);
  const actingUser = useCRMStore((s) => s.teamMembers.find((m) => m.id === s.currentTeamMemberId));
  const managerCostVisible = useSettingsStore((s) => s.manager_cost_visible);

  const showCost = canViewCost(actingUser, managerCostVisible);
  const canManage = isAdmin(actingUser);

  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<CatalogItem | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [activeOnly, setActiveOnly] = useState(true);

  // Name lookups
  const seriesById = useMemo(() => new Map(catalogSeries.map((s) => [s.id, s])), [catalogSeries]);
  const typeById = useMemo(() => new Map(catalogWindowTypes.map((w) => [w.id, w])), [catalogWindowTypes]);
  const rangeById = useMemo(
    () => new Map(catalogUniversalRanges.map((r) => [r.id, r])),
    [catalogUniversalRanges]
  );

  const typeFilterOptions = useMemo(
    () =>
      catalogWindowTypes
        .filter((w) => !seriesFilter || w.series_id === seriesFilter)
        .sort((a, b) => a.sort_order - b.sort_order),
    [catalogWindowTypes, seriesFilter]
  );

  const items = useMemo(() => {
    const q = search.trim().toLowerCase();
    return catalogItems.filter((ci) => {
      if (ci.archived) return false; // archived hidden by default
      if (activeOnly && !ci.active) return false;
      if (seriesFilter && ci.series_id !== seriesFilter) return false;
      if (typeFilter && ci.window_type_id !== typeFilter) return false;
      if (q) {
        const hay = `${ci.name} ${ci.sku ?? ""} ${ci.supplier ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [catalogItems, search, seriesFilter, typeFilter, activeOnly]);

  const allColumns = [
    {
      key: "name",
      header: "Item",
      render: (ci: CatalogItem) => (
        <div>
          <span className="font-medium">{ci.name}</span>
          {ci.sku && <span className="block text-xs text-muted-foreground">SKU {ci.sku}</span>}
        </div>
      ),
    },
    { key: "series", header: "Series", render: (ci: CatalogItem) => seriesById.get(ci.series_id)?.name ?? "—" },
    { key: "type", header: "Window Type", render: (ci: CatalogItem) => typeById.get(ci.window_type_id)?.name ?? "—" },
    {
      key: "range",
      header: "Range",
      render: (ci: CatalogItem) =>
        ci.universal_range_id ? rangeById.get(ci.universal_range_id)?.label ?? "—" : "Any size",
    },
    {
      key: "mode",
      header: "Mode",
      render: (ci: CatalogItem) => (
        <span className="text-xs">{INVENTORY_MODE_LABELS[ci.inventory_mode]}</span>
      ),
    },
    {
      key: "price",
      header: "Sale Price",
      render: (ci: CatalogItem) => <span className="font-medium">{formatCents(ci.base_price_cents)}</span>,
    },
    {
      key: "cost",
      header: "Internal Cost",
      render: (ci: CatalogItem) => (
        <span className="text-muted-foreground">{formatCents(ci.base_cost_cents)}</span>
      ),
    },
    {
      key: "actions",
      header: "Actions",
      render: (ci: CatalogItem) => (
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            title="Edit"
            aria-label="Edit item"
            onClick={() => {
              setEditItem(ci);
              setFormOpen(true);
            }}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Duplicate"
            aria-label="Duplicate item"
            onClick={() => duplicateCatalogItem(ci.id)}
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            title="Archive"
            aria-label="Archive item"
            className="text-red-600"
            onClick={() => archiveCatalogItem(ci.id)}
          >
            <Archive className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  const columns = showCost ? allColumns : allColumns.filter((c) => c.key !== "cost");

  if (!hydrated) {
    return <div className="py-20 text-center text-muted-foreground">Loading inventory...</div>;
  }

  const hasAnyItems = catalogItems.some((ci) => !ci.archived);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory Catalog"
        description="Sellable window products by Series, Window Type and Universal Inches Range — used by the Quote Builder"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {canManage && (
              <Button variant="outline" onClick={() => setManageOpen(true)}>
                <Settings2 className="h-4 w-4" /> Manage Series / Types
              </Button>
            )}
            <Button
              className="bg-primary hover:bg-brand-blue-dark"
              onClick={() => {
                setEditItem(null);
                setFormOpen(true);
              }}
            >
              + Add Item
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search name, SKU, supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <SelectField
          value={seriesFilter}
          onChange={(v) => {
            setSeriesFilter(v);
            setTypeFilter("");
          }}
          options={[
            { value: "", label: "All series" },
            ...catalogSeries
              .slice()
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((s) => ({ value: s.id, label: s.name })),
          ]}
        />
        <SelectField
          value={typeFilter}
          onChange={(v) => setTypeFilter(v)}
          options={[
            { value: "", label: "All window types" },
            ...typeFilterOptions.map((w) => ({ value: w.id, label: w.name })),
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={activeOnly}
            onChange={(e) => setActiveOnly(e.target.checked)}
          />
          Active items only
        </label>
      </div>

      {!hasAnyItems ? (
        <EmptyState
          icon={Package}
          title="No inventory items yet"
          description="Add your first sellable window product. Classify it by Series, Window Type and Universal Inches Range, then set pricing and attributes for the Quote Builder."
          action={
            <Button
              className="bg-primary hover:bg-brand-blue-dark"
              onClick={() => {
                setEditItem(null);
                setFormOpen(true);
              }}
            >
              Add First Item
            </Button>
          }
        />
      ) : items.length === 0 ? (
        <p className="rounded-xl border border-dashed py-12 text-center text-sm text-muted-foreground">
          No items match the current filters.
        </p>
      ) : (
        <DataTable data={items} columns={columns} />
      )}

      <InventoryFormDialog open={formOpen} onOpenChange={setFormOpen} item={editItem} />
      {canManage && <ManageCatalogDialog open={manageOpen} onOpenChange={setManageOpen} />}
    </div>
  );
}

// ── Manage Series / Window Types (admin) ─────────────────────────
function ManageCatalogDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const catalogSeries = useCRMStore((s) => s.catalogSeries);
  const catalogWindowTypes = useCRMStore((s) => s.catalogWindowTypes);
  const addCatalogSeries = useCRMStore((s) => s.addCatalogSeries);
  const updateCatalogSeries = useCRMStore((s) => s.updateCatalogSeries);
  const addCatalogWindowType = useCRMStore((s) => s.addCatalogWindowType);
  const updateCatalogWindowType = useCRMStore((s) => s.updateCatalogWindowType);

  const [newSeries, setNewSeries] = useState("");
  const [typeSeriesId, setTypeSeriesId] = useState("");
  const [newType, setNewType] = useState("");

  const sortedSeries = catalogSeries.slice().sort((a, b) => a.sort_order - b.sort_order);
  const seriesForTypes = typeSeriesId || sortedSeries[0]?.id || "";
  const typesForSeries = catalogWindowTypes
    .filter((w) => w.series_id === seriesForTypes)
    .sort((a, b) => a.sort_order - b.sort_order);

  const moveSeries = (id: string, dir: -1 | 1) => {
    const idx = sortedSeries.findIndex((s) => s.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= sortedSeries.length) return;
    const a = sortedSeries[idx];
    const b = sortedSeries[swap];
    updateCatalogSeries(a.id, { sort_order: b.sort_order });
    updateCatalogSeries(b.id, { sort_order: a.sort_order });
  };

  const moveType = (id: string, dir: -1 | 1) => {
    const idx = typesForSeries.findIndex((t) => t.id === id);
    const swap = idx + dir;
    if (swap < 0 || swap >= typesForSeries.length) return;
    const a = typesForSeries[idx];
    const b = typesForSeries[swap];
    updateCatalogWindowType(a.id, { sort_order: b.sort_order });
    updateCatalogWindowType(b.id, { sort_order: a.sort_order });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage Series &amp; Window Types</DialogTitle>
          <DialogDescription>
            Add, rename, reorder or deactivate catalog Series and Window Types. Deactivated entries
            stay on existing items but are hidden from new selections.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Series */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-brand-blue">Series</h4>
            <div className="space-y-2">
              {sortedSeries.map((s, i) => (
                <div key={s.id} className="flex items-center gap-1.5">
                  <Input
                    aria-label="Series name"
                    value={s.name}
                    onChange={(e) => updateCatalogSeries(s.id, { name: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Move series up"
                    disabled={i === 0}
                    onClick={() => moveSeries(s.id, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Move series down"
                    disabled={i === sortedSeries.length - 1}
                    onClick={() => moveSeries(s.id, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={s.active ? "outline" : "secondary"}
                    onClick={() => updateCatalogSeries(s.id, { active: !s.active })}
                  >
                    {s.active ? "Active" : "Off"}
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="new-series">New series</Label>
                <Input id="new-series" value={newSeries} onChange={(e) => setNewSeries(e.target.value)} />
              </div>
              <Button
                type="button"
                className="bg-primary hover:bg-brand-blue-dark"
                onClick={() => {
                  if (!newSeries.trim()) return;
                  addCatalogSeries(newSeries.trim());
                  setNewSeries("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Window Types */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-brand-blue">Window Types</h4>
            <SelectField
              label="For series"
              value={seriesForTypes}
              onChange={(v) => setTypeSeriesId(v)}
              options={sortedSeries.map((s) => ({ value: s.id, label: s.name }))}
            />
            <div className="space-y-2">
              {typesForSeries.length === 0 && (
                <p className="text-xs text-muted-foreground">No window types for this series yet.</p>
              )}
              {typesForSeries.map((t, i) => (
                <div key={t.id} className="flex items-center gap-1.5">
                  <Input
                    aria-label="Window type name"
                    value={t.name}
                    onChange={(e) => updateCatalogWindowType(t.id, { name: e.target.value })}
                  />
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Move type up"
                    disabled={i === 0}
                    onClick={() => moveType(t.id, -1)}
                  >
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Move type down"
                    disabled={i === typesForSeries.length - 1}
                    onClick={() => moveType(t.id, 1)}
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={t.active ? "outline" : "secondary"}
                    onClick={() => updateCatalogWindowType(t.id, { active: !t.active })}
                  >
                    {t.active ? "Active" : "Off"}
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="new-type">New window type</Label>
                <Input id="new-type" value={newType} onChange={(e) => setNewType(e.target.value)} />
              </div>
              <Button
                type="button"
                className="bg-primary hover:bg-brand-blue-dark"
                disabled={!seriesForTypes}
                onClick={() => {
                  if (!newType.trim() || !seriesForTypes) return;
                  addCatalogWindowType(seriesForTypes, newType.trim());
                  setNewType("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            <X className="h-4 w-4" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
