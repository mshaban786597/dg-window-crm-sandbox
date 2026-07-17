"use client";

import { useEffect, useState } from "react";
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
import type { Material } from "@/types/database";
import type { InventoryFormData } from "@/lib/store/form-types";
import { INVENTORY_CATEGORIES } from "@/lib/constants";

const EMPTY: InventoryFormData = {
  name: "",
  category: INVENTORY_CATEGORIES[0],
  quantity: 0,
  unit: "ea",
  reorder_level: 0,
  supplier: "",
  cost: 0,
  color_options: "",
  notes: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  material?: Material | null;
}

export function InventoryFormDialog({ open, onOpenChange, material }: Props) {
  const addMaterial = useCRMStore((s) => s.addMaterial);
  const updateMaterial = useCRMStore((s) => s.updateMaterial);
  const showToast = useCRMStore((s) => s.showToast);
  const [form, setForm] = useState<InventoryFormData>(EMPTY);

  useEffect(() => {
    if (material) {
      setForm({
        name: material.name,
        category: material.category,
        quantity: material.quantity,
        unit: material.unit,
        reorder_level: material.reorder_level,
        supplier: material.supplier,
        cost: material.cost,
        color_options: material.color_options?.join(", ") || "",
        notes: material.notes || "",
      });
    } else setForm(EMPTY);
  }, [material, open]);

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.name.trim() || !form.category) {
      showToast("error", "Name and category are required");
      return;
    }
    if (material) updateMaterial(material.id, form);
    else addMaterial(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{material ? "Edit Item" : "Add Inventory Item"}</DialogTitle>
          <DialogDescription>Window installation materials and supplies</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Item Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <SelectField label="Category *" value={form.category} onChange={(v) => setForm((f) => ({ ...f, category: v }))} options={INVENTORY_CATEGORIES.map((c) => ({ value: c, label: c }))} />
            <div>
              <Label>Quantity *</Label>
              <Input type="number" value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Unit</Label>
              <Input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} />
            </div>
            <div>
              <Label>Reorder Level</Label>
              <Input type="number" value={form.reorder_level} onChange={(e) => setForm((f) => ({ ...f, reorder_level: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Supplier</Label>
              <Input value={form.supplier} onChange={(e) => setForm((f) => ({ ...f, supplier: e.target.value }))} />
            </div>
            <div>
              <Label>Unit Cost ($)</Label>
              <Input type="number" step="0.01" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: Number(e.target.value) }))} />
            </div>
            <div>
              <Label>Color Options (comma-separated)</Label>
              <Input value={form.color_options} onChange={(e) => setForm((f) => ({ ...f, color_options: e.target.value }))} />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-primary hover:bg-brand-blue-dark">Save Item</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
