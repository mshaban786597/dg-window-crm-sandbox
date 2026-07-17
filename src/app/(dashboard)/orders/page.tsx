"use client";

import { useState } from "react";
import { PackageOpen, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { DataTable } from "@/components/shared/data-table";
import { StatusBadge } from "@/components/shared/status-badge";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { PurchaseOrderFormDialog } from "@/components/orders/purchase-order-form-dialog";
import { useCRMStore } from "@/lib/store/crm-store";
import { formatDate } from "@/lib/utils";
import type { PurchaseOrder } from "@/types/database";

export default function WindowOrdersPage() {
  const orders = useCRMStore((s) => s.purchaseOrders);
  const deleteOrder = useCRMStore((s) => s.deletePurchaseOrder);
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<PurchaseOrder | null>(null);

  const columns = [
    {
      key: "customer",
      header: "Customer",
      render: (o: PurchaseOrder) => (
        <div>
          <p className="font-medium">{o.customer_name}</p>
          <p className="text-xs text-muted-foreground">{o.po_number || o.id.slice(-6)}</p>
        </div>
      ),
    },
    { key: "manufacturer", header: "Manufacturer", render: (o: PurchaseOrder) => o.manufacturer || "—" },
    { key: "supplier", header: "Supplier", render: (o: PurchaseOrder) => o.supplier || "—" },
    {
      key: "units",
      header: "Units",
      render: (o: PurchaseOrder) => {
        const ordered = o.items.reduce((s, i) => s + (i.quantity || 0), 0);
        const received = o.items.reduce((s, i) => s + (i.received_quantity || 0), 0);
        return ordered ? `${received} / ${ordered}` : "—";
      },
    },
    { key: "eta", header: "Est. Arrival", render: (o: PurchaseOrder) => (o.estimated_arrival_date ? formatDate(o.estimated_arrival_date) : "—") },
    { key: "status", header: "Status", render: (o: PurchaseOrder) => <StatusBadge status={o.status} type="order" /> },
    {
      key: "actions",
      header: "",
      render: (o: PurchaseOrder) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => { setEditing(o); setFormOpen(true); }}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" title="Delete" onClick={() => { if (window.confirm("Delete this window order?")) deleteOrder(o.id); }}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Window Orders"
        description="Track ordered window units from accepted quote to installation"
        actions={
          <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => { setEditing(null); setFormOpen(true); }}>
            + Create Window Order
          </Button>
        }
      />

      {!hydrated ? (
        <p className="py-16 text-center text-muted-foreground">Loading…</p>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={PackageOpen}
          title="No window orders created"
          description="Create a purchase order to track window units through production, shipping, and delivery."
          action={
            <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={() => { setEditing(null); setFormOpen(true); }}>
              Create First Window Order
            </Button>
          }
        />
      ) : (
        <DataTable data={orders} columns={columns} onRowClick={(o) => { setEditing(o); setFormOpen(true); }} />
      )}

      <PurchaseOrderFormDialog open={formOpen} onOpenChange={(v) => { setFormOpen(v); if (!v) setEditing(null); }} order={editing} />
    </div>
  );
}
