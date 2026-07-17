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
import type { Customer } from "@/types/database";
import type { CustomerFormData } from "@/lib/store/form-types";
import {
  APP,
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  CUSTOMER_TYPES,
} from "@/lib/constants";

const EMPTY: CustomerFormData = {
  full_name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  county: "",
  zip_code: "",
  property_type: "residential",
  customer_type: "new",
  notes: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer?: Customer | null;
  leadId?: string;
  defaultValues?: Partial<CustomerFormData>;
}

export function CustomerFormDialog({
  open,
  onOpenChange,
  customer,
  leadId,
  defaultValues,
}: Props) {
  const addCustomer = useCRMStore((s) => s.addCustomer);
  const updateCustomer = useCRMStore((s) => s.updateCustomer);
  const showToast = useCRMStore((s) => s.showToast);
  const [form, setForm] = useState<CustomerFormData>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (customer) {
      setForm({
        full_name: customer.full_name,
        phone: customer.phone,
        email: customer.email || "",
        address: customer.address,
        city: customer.city,
        county: customer.county,
        zip_code: customer.zip_code,
        property_type: customer.property_type,
        customer_type: customer.customer_type || "new",
        lead_id: customer.lead_id,
        notes: customer.notes || "",
      });
    } else {
      setForm({ ...EMPTY, ...defaultValues, lead_id: leadId || defaultValues?.lead_id });
    }
    setErrors({});
  }, [customer, open, leadId, defaultValues]);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.full_name.trim()) e.full_name = "Name is required";
    if (!form.phone.trim()) e.phone = "Phone is required";
    if (!form.address.trim()) e.address = "Address is required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) {
      showToast("error", "Please fix form errors");
      return;
    }
    if (customer) updateCustomer(customer.id, form);
    else addCustomer(form);
    onOpenChange(false);
  };

  const set = (k: keyof CustomerFormData, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{customer ? "Edit Customer" : "Add Customer"}</DialogTitle>
          <DialogDescription>Customer profile for {APP.name}</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Full Name *</Label>
              <Input value={form.full_name} onChange={(e) => set("full_name", e.target.value)} />
              {errors.full_name && <p className="text-xs text-red-600 mt-1">{errors.full_name}</p>}
            </div>
            <div>
              <Label>Phone *</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              {errors.phone && <p className="text-xs text-red-600 mt-1">{errors.phone}</p>}
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label>Address *</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
              {errors.address && <p className="text-xs text-red-600 mt-1">{errors.address}</p>}
            </div>
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
            </div>
            <div>
              <Label>County / Region</Label>
              <Input value={form.county} onChange={(e) => set("county", e.target.value)} />
            </div>
            <div>
              <Label>ZIP Code</Label>
              <Input value={form.zip_code} onChange={(e) => set("zip_code", e.target.value)} />
            </div>
            <SelectField
              label="Property Type"
              value={form.property_type}
              onChange={(v) =>
                setForm((f) => ({ ...f, property_type: v as CustomerFormData["property_type"] }))
              }
              options={PROPERTY_TYPES.map((t) => ({ value: t, label: PROPERTY_TYPE_LABELS[t] }))}
            />
            <SelectField
              label="Customer Type"
              value={form.customer_type || "new"}
              onChange={(v) => set("customer_type", v)}
              options={CUSTOMER_TYPES.map((t) => ({
                value: t,
                label: t.charAt(0).toUpperCase() + t.slice(1),
              }))}
            />
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-primary hover:bg-brand-blue-dark">{customer ? "Save Changes" : "Add Customer"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
