"use client";

import { useEffect, useState } from "react";
import { Plus, Trash2, PackageOpen } from "lucide-react";
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
import { useSettingsStore } from "@/lib/settings/settings-store";
import type { PurchaseOrder, PurchaseOrderItem } from "@/types/database";
import type { PurchaseOrderFormData } from "@/lib/store/form-types";
import { PURCHASE_ORDER_STATUSES, PURCHASE_ORDER_STATUS_LABELS } from "@/lib/domain";

const iid = () => `poi-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function newItem(): PurchaseOrderItem {
  return { id: iid(), opening_ref: "", quantity: 1, received_quantity: 0, damaged: false };
}

const emptyForm = (): PurchaseOrderFormData => ({
  customer_name: "",
  status: "draft",
  order_date: new Date().toISOString().slice(0, 10),
  items: [],
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order?: PurchaseOrder | null;
}

export function PurchaseOrderFormDialog({ open, onOpenChange, order }: Props) {
  const addPurchaseOrder = useCRMStore((s) => s.addPurchaseOrder);
  const updatePurchaseOrder = useCRMStore((s) => s.updatePurchaseOrder);
  const customers = useCRMStore((s) => s.customers);
  const quotes = useCRMStore((s) => s.quotes);
  const jobs = useCRMStore((s) => s.jobs);
  const showToast = useCRMStore((s) => s.showToast);
  const manufacturers = useSettingsStore((s) => s.manufacturers);
  const productLines = useSettingsStore((s) => s.product_lines);

  const [form, setForm] = useState<PurchaseOrderFormData>(emptyForm());

  useEffect(() => {
    if (order) {
      setForm({
        quote_id: order.quote_id,
        customer_id: order.customer_id,
        customer_name: order.customer_name,
        job_id: order.job_id,
        manufacturer: order.manufacturer,
        product_line: order.product_line,
        supplier: order.supplier,
        po_number: order.po_number,
        order_date: order.order_date?.slice(0, 10) || "",
        confirmed_date: order.confirmed_date?.slice(0, 10) || "",
        estimated_ship_date: order.estimated_ship_date?.slice(0, 10) || "",
        estimated_arrival_date: order.estimated_arrival_date?.slice(0, 10) || "",
        actual_arrival_date: order.actual_arrival_date?.slice(0, 10) || "",
        status: order.status,
        supplier_contact: order.supplier_contact,
        freight_cost: order.freight_cost,
        storage_location: order.storage_location,
        tracking_info: order.tracking_info,
        internal_notes: order.internal_notes,
        items: order.items || [],
      });
    } else {
      setForm(emptyForm());
    }
  }, [order, open]);

  const set = <K extends keyof PurchaseOrderFormData>(key: K, value: PurchaseOrderFormData[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const addOrderItem = () => setForm((f) => ({ ...f, items: [...f.items, newItem()] }));
  const removeOrderItem = (id: string) =>
    setForm((f) => ({ ...f, items: f.items.filter((i) => i.id !== id) }));
  const patchItem = (id: string, patch: Partial<PurchaseOrderItem>) =>
    setForm((f) => ({ ...f, items: f.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));

  const onCustomer = (id: string) => {
    const c = customers.find((x) => x.id === id);
    setForm((f) => ({ ...f, customer_id: id, customer_name: c?.full_name || f.customer_name }));
  };

  const totalUnits = form.items.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalReceived = form.items.reduce((s, i) => s + (i.received_quantity || 0), 0);

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.customer_name.trim()) {
      showToast("error", "Customer required");
      return;
    }
    if (order) updatePurchaseOrder(order.id, form);
    else addPurchaseOrder(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{order ? "Edit Window Order" : "Create Window Order"}</DialogTitle>
          <DialogDescription>Purchase order for ordered window units</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Customer"
              value={form.customer_id || ""}
              onChange={onCustomer}
              options={[{ value: "", label: "— Select —" }, ...customers.map((c) => ({ value: c.id, label: c.full_name }))]}
            />
            <div>
              <Label>Customer Name *</Label>
              <Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} />
            </div>
            <SelectField
              label="Accepted Quote"
              value={form.quote_id || ""}
              onChange={(v) => set("quote_id", v || undefined)}
              options={[{ value: "", label: "— None —" }, ...quotes.filter((q) => q.status === "accepted").map((q) => ({ value: q.id, label: `${q.customer_name} · ${q.id.slice(-6)}` }))]}
            />
            <SelectField
              label="Linked Job"
              value={form.job_id || ""}
              onChange={(v) => set("job_id", v || undefined)}
              options={[{ value: "", label: "— None —" }, ...jobs.map((j) => ({ value: j.id, label: `${j.customer_name} · ${j.id.slice(-6)}` }))]}
            />
            <SelectField
              label="Manufacturer"
              value={form.manufacturer || ""}
              onChange={(v) => set("manufacturer", v)}
              options={[{ value: "", label: "— None —" }, ...manufacturers.map((m) => ({ value: m, label: m }))]}
            />
            <SelectField
              label="Product Line"
              value={form.product_line || ""}
              onChange={(v) => set("product_line", v)}
              options={[{ value: "", label: "— None —" }, ...productLines.map((m) => ({ value: m, label: m }))]}
            />
            <div>
              <Label>Supplier</Label>
              <Input value={form.supplier || ""} onChange={(e) => set("supplier", e.target.value)} />
            </div>
            <div>
              <Label>Supplier Contact</Label>
              <Input value={form.supplier_contact || ""} onChange={(e) => set("supplier_contact", e.target.value)} />
            </div>
            <div>
              <Label>PO Number</Label>
              <Input value={form.po_number || ""} onChange={(e) => set("po_number", e.target.value)} />
            </div>
            <SelectField
              label="Status"
              value={form.status}
              onChange={(v) => set("status", v as PurchaseOrderFormData["status"])}
              options={PURCHASE_ORDER_STATUSES.map((s) => ({ value: s, label: PURCHASE_ORDER_STATUS_LABELS[s] }))}
            />
            <div>
              <Label>Order Date</Label>
              <Input type="date" value={form.order_date || ""} onChange={(e) => set("order_date", e.target.value)} />
            </div>
            <div>
              <Label>Confirmed Date</Label>
              <Input type="date" value={form.confirmed_date || ""} onChange={(e) => set("confirmed_date", e.target.value)} />
            </div>
            <div>
              <Label>Est. Ship Date</Label>
              <Input type="date" value={form.estimated_ship_date || ""} onChange={(e) => set("estimated_ship_date", e.target.value)} />
            </div>
            <div>
              <Label>Est. Arrival Date</Label>
              <Input type="date" value={form.estimated_arrival_date || ""} onChange={(e) => set("estimated_arrival_date", e.target.value)} />
            </div>
            <div>
              <Label>Actual Arrival Date</Label>
              <Input type="date" value={form.actual_arrival_date || ""} onChange={(e) => set("actual_arrival_date", e.target.value)} />
            </div>
            <div>
              <Label>Freight Cost ($)</Label>
              <Input type="number" min={0} value={form.freight_cost ?? ""} onChange={(e) => set("freight_cost", Number(e.target.value) || undefined)} />
            </div>
            <div>
              <Label>Storage Location</Label>
              <Input value={form.storage_location || ""} onChange={(e) => set("storage_location", e.target.value)} />
            </div>
            <div>
              <Label>Tracking Info</Label>
              <Input value={form.tracking_info || ""} onChange={(e) => set("tracking_info", e.target.value)} />
            </div>
          </div>

          {/* Order items */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackageOpen className="h-4 w-4 text-brand-blue" />
                <h3 className="text-sm font-semibold">Ordered Units</h3>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addOrderItem} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Unit
              </Button>
            </div>
            <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
              <span><strong>{totalUnits}</strong> ordered</span>
              <span><strong>{totalReceived}</strong> received</span>
            </div>

            {form.items.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No units added. Add ordered window units to this purchase order.
              </p>
            ) : (
              <div className="space-y-2">
                {form.items.map((it) => (
                  <div key={it.id} className="grid grid-cols-12 gap-2 rounded-lg border p-3">
                    <div className="col-span-12 sm:col-span-3">
                      <Label className="text-xs">Room / Opening Ref</Label>
                      <Input value={it.opening_ref || ""} onChange={(e) => patchItem(it.id, { opening_ref: e.target.value })} />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-xs">Model / SKU</Label>
                      <Input value={it.model_sku || ""} onChange={(e) => patchItem(it.id, { model_sku: e.target.value })} />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min={0} value={it.quantity} onChange={(e) => patchItem(it.id, { quantity: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-3 sm:col-span-1">
                      <Label className="text-xs">Rcvd</Label>
                      <Input type="number" min={0} value={it.received_quantity ?? 0} onChange={(e) => patchItem(it.id, { received_quantity: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <Label className="text-xs">Width</Label>
                      <Input type="number" value={it.width ?? ""} onChange={(e) => patchItem(it.id, { width: Number(e.target.value) || undefined })} />
                    </div>
                    <div className="col-span-4 sm:col-span-1">
                      <Label className="text-xs">Height</Label>
                      <Input type="number" value={it.height ?? ""} onChange={(e) => patchItem(it.id, { height: Number(e.target.value) || undefined })} />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Label className="text-xs">Color</Label>
                      <Input value={it.color || ""} onChange={(e) => patchItem(it.id, { color: e.target.value })} />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-xs">Style</Label>
                      <Input value={it.style || ""} onChange={(e) => patchItem(it.id, { style: e.target.value })} />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-xs">Frame</Label>
                      <Input value={it.frame || ""} onChange={(e) => patchItem(it.id, { frame: e.target.value })} />
                    </div>
                    <div className="col-span-6 sm:col-span-2">
                      <Label className="text-xs">Glass</Label>
                      <Input value={it.glass_package || ""} onChange={(e) => patchItem(it.id, { glass_package: e.target.value })} />
                    </div>
                    <div className="col-span-4 sm:col-span-2">
                      <Label className="text-xs">Unit Cost ($)</Label>
                      <Input type="number" min={0} value={it.unit_cost ?? ""} onChange={(e) => patchItem(it.id, { unit_cost: Number(e.target.value) || undefined })} />
                    </div>
                    <div className="col-span-8 sm:col-span-4 flex items-end gap-4">
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" className="h-4 w-4 accent-red-600" checked={Boolean(it.damaged)} onChange={(e) => patchItem(it.id, { damaged: e.target.checked })} />
                        Damaged / short
                      </label>
                      <Button type="button" size="icon" variant="ghost" className="ml-auto text-red-600 hover:text-red-700" onClick={() => removeOrderItem(it.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <Label>Internal Notes</Label>
            <Textarea value={form.internal_notes || ""} onChange={(e) => set("internal_notes", e.target.value)} rows={2} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-brand-blue hover:bg-brand-blue-dark">Save Window Order</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
