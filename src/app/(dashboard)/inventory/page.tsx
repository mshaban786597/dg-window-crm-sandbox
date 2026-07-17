"use client";

import { useState } from "react";
import { Pencil, Trash2, Plus, Minus, Package } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { InventoryFormDialog } from "@/components/inventory/inventory-form-dialog";
import { ConfirmDeleteDialog } from "@/components/shared/confirm-delete-dialog";
import { DataTable } from "@/components/shared/data-table";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatCurrency } from "@/lib/utils";
import type { Material } from "@/types/database";

export default function InventoryPage() {
  const materials = useCRMStore((s) => s.materials);
  const adjustInventory = useCRMStore((s) => s.adjustInventory);
  const deleteMaterial = useCRMStore((s) => s.deleteMaterial);
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const [formOpen, setFormOpen] = useState(false);
  const [editItem, setEditItem] = useState<Material | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const lowStock = materials.filter((m) => m.quantity <= m.reorder_level);

  const columns = [
    { key: "name", header: "Item", render: (m: Material) => <span className="font-medium">{m.name}</span> },
    { key: "category", header: "Category", render: (m: Material) => m.category },
    {
      key: "qty",
      header: "Qty",
      render: (m: Material) => (
        <span className={m.quantity <= m.reorder_level ? "text-red-600 font-semibold" : ""}>
          {m.quantity} {m.unit}
        </span>
      ),
    },
    { key: "reorder", header: "Reorder At", render: (m: Material) => `${m.reorder_level} ${m.unit}` },
    { key: "supplier", header: "Supplier", render: (m: Material) => m.supplier || "—" },
    { key: "cost", header: "Unit Cost", render: (m: Material) => formatCurrency(m.cost) },
    {
      key: "actions",
      header: "Actions",
      render: (m: Material) => (
        <div className="flex gap-1">
          <Button size="icon" variant="ghost" onClick={() => adjustInventory(m.id, 10, "add")} title="Add stock">
            <Plus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => adjustInventory(m.id, -10, "remove")} title="Remove stock">
            <Minus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => { setEditItem(m); setFormOpen(true); }}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" className="text-red-600" onClick={() => setDeleteId(m.id)}>
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  if (!hydrated) {
    return <div className="py-20 text-center text-muted-foreground">Loading inventory...</div>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Materials & Inventory"
        description="Installation supplies — flashing tape, sealants, screens, hardware, capping & consumables"
        actions={
          <Button className="bg-primary hover:bg-brand-blue-dark" onClick={() => { setEditItem(null); setFormOpen(true); }}>
            + Add Item
          </Button>
        }
      />

      <p className="text-xs text-muted-foreground">
        Tracks stock materials and consumables. Ordered custom window units are tracked in Window Orders, not here.
      </p>

      {materials.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No inventory items"
          description="Add your first material to track stock levels, reorder points, and suppliers."
          action={
            <Button className="bg-primary hover:bg-brand-blue-dark" onClick={() => { setEditItem(null); setFormOpen(true); }}>
              Add First Item
            </Button>
          }
        />
      ) : (
        <>
          {lowStock.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              <strong>{lowStock.length} {lowStock.length === 1 ? "item" : "items"}</strong> at or below reorder level:{" "}
              {lowStock.map((m) => m.name).join(", ")}
            </div>
          )}

          <DataTable data={materials} columns={columns} />
        </>
      )}

      <InventoryFormDialog open={formOpen} onOpenChange={setFormOpen} material={editItem} />
      <ConfirmDeleteDialog
        open={!!deleteId}
        onOpenChange={() => setDeleteId(null)}
        title="Delete Item"
        description="Remove this inventory item?"
        onConfirm={() => deleteId && deleteMaterial(deleteId)}
      />
    </div>
  );
}
