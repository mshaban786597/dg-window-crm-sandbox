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
import { useSettingsStore } from "@/lib/settings/settings-store";
import type { Job, Quote } from "@/types/database";
import type { JobFormData } from "@/lib/store/form-types";
import {
  SERVICES,
  SERVICE_LABELS,
  JOB_STAGES,
  JOB_STAGE_LABELS,
} from "@/lib/constants";

const EMPTY: JobFormData = {
  customer_id: "",
  customer_name: "",
  customer_phone: "",
  address: "",
  city: "",
  county: "",
  service_type: SERVICES[0],
  stage: "not_scheduled",
  priority: "medium",
  estimated_install_days: 1,
  units_count: 0,
  permit_status: "not_required",
  inspection_status: "not_required",
  material_delivery_status: "pending",
  deposit_status: "none",
  final_walkthrough_status: "pending",
  job_value: 0,
  internal_notes: "",
  customer_notes: "",
};

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
];

const PERMIT_OPTIONS = [
  { value: "not_required", label: "Not Required" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
];

const INSPECTION_OPTIONS = [
  { value: "not_required", label: "Not Required" },
  { value: "scheduled", label: "Scheduled" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
];

const MATERIAL_DELIVERY_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "partial", label: "Partial" },
  { value: "received", label: "Received" },
];

const DEPOSIT_OPTIONS = [
  { value: "none", label: "None" },
  { value: "pending", label: "Pending" },
  { value: "paid", label: "Paid" },
];

const WALKTHROUGH_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "passed", label: "Passed" },
  { value: "failed", label: "Failed" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  job?: Job | null;
  quote?: Quote | null;
  defaultValues?: Partial<JobFormData>;
}

export function JobFormDialog({ open, onOpenChange, job, quote, defaultValues }: Props) {
  const addJob = useCRMStore((s) => s.addJob);
  const updateJob = useCRMStore((s) => s.updateJob);
  const customers = useCRMStore((s) => s.customers);
  const quotes = useCRMStore((s) => s.quotes);
  const crews = useCRMStore((s) => s.crews);
  const showToast = useCRMStore((s) => s.showToast);
  const enabledServices = useSettingsStore((s) => s.services);

  const serviceOptions = enabledServices.filter((o) => o.enabled).length
    ? enabledServices
        .filter((o) => o.enabled)
        .map((o) => ({ value: o.value, label: o.label }))
    : SERVICES.map((s) => ({ value: s, label: SERVICE_LABELS[s] ?? s }));

  const [form, setForm] = useState<JobFormData>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (job) {
      setForm({
        customer_id: job.customer_id,
        quote_id: job.quote_id,
        estimate_id: job.estimate_id,
        purchase_order_id: job.purchase_order_id,
        customer_name: job.customer_name,
        customer_phone: job.customer_phone,
        address: job.address,
        city: job.city,
        county: job.county,
        service_type: job.service_type,
        stage: job.stage,
        crew_id: job.crew_id,
        crew_name: job.crew_name,
        start_date: job.start_date?.slice(0, 10),
        end_date: job.end_date?.slice(0, 10),
        start_time: job.start_time,
        end_time: job.end_time,
        estimated_install_days: job.estimated_install_days,
        priority: job.priority,
        units_count: job.units_count,
        permit_status: job.permit_status,
        inspection_status: job.inspection_status,
        material_delivery_status: job.material_delivery_status,
        deposit_status: job.deposit_status,
        final_walkthrough_status: job.final_walkthrough_status,
        materials: job.materials,
        internal_notes: job.internal_notes,
        customer_notes: job.customer_notes,
        job_value: job.job_value,
      });
    } else if (quote) {
      const cust = customers.find((c) => c.id === quote.customer_id);
      setForm({
        ...EMPTY,
        quote_id: quote.id,
        customer_id: quote.customer_id,
        customer_name: quote.customer_name,
        customer_phone: cust?.phone || "",
        address: quote.property_address.split(",")[0]?.trim() || quote.property_address,
        city: cust?.city || "",
        county: cust?.county || "",
        service_type: quote.service_type,
        job_value: quote.total,
        stage: "not_scheduled",
      });
    } else {
      setForm({ ...EMPTY, ...defaultValues });
    }
    setErrors({});
  }, [job, quote, open, defaultValues, customers]);

  const onCustomerChange = (id: string) => {
    const c = customers.find((x) => x.id === id);
    if (c) {
      setForm((f) => ({
        ...f,
        customer_id: id,
        customer_name: c.full_name,
        customer_phone: c.phone,
        address: c.address,
        city: c.city,
        county: c.county,
      }));
    } else {
      setForm((f) => ({ ...f, customer_id: id }));
    }
  };

  const onQuoteChange = (id: string) => {
    const q = quotes.find((x) => x.id === id);
    if (q) {
      onCustomerChange(q.customer_id);
      setForm((f) => ({ ...f, quote_id: id, job_value: q.total, service_type: q.service_type }));
    } else {
      setForm((f) => ({ ...f, quote_id: undefined }));
    }
  };

  const onCrewChange = (id: string) => {
    const crew = crews.find((c) => c.id === id);
    setForm((f) => ({ ...f, crew_id: id || undefined, crew_name: crew?.name }));
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customer_id) e.customer_id = "Customer required";
    if (!form.address.trim()) e.address = "Address required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) {
      showToast("error", "Please fix form errors");
      return;
    }
    if (job) updateJob(job.id, form);
    else addJob(form);
    showToast("success", job ? "Job updated" : "Job created");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{job ? "Edit Job" : "Add Job"}</DialogTitle>
          <DialogDescription>Schedule and track a window installation job.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Customer *"
              value={form.customer_id}
              onChange={onCustomerChange}
              options={[
                { value: "", label: "Select a customer" },
                ...customers.map((c) => ({ value: c.id, label: c.full_name })),
              ]}
            />
            <SelectField
              label="Quote (optional)"
              value={form.quote_id || ""}
              onChange={onQuoteChange}
              options={[
                { value: "", label: "None" },
                ...quotes
                  .filter((q) => q.customer_id === form.customer_id || !form.customer_id)
                  .map((q) => ({ value: q.id, label: `${q.customer_name} — ${SERVICE_LABELS[q.service_type] ?? q.service_type}` })),
              ]}
            />
            {errors.customer_id && <p className="text-xs text-red-600 sm:col-span-2">{errors.customer_id}</p>}

            <SelectField
              label="Service"
              value={form.service_type}
              onChange={(v) => setForm((f) => ({ ...f, service_type: v as JobFormData["service_type"] }))}
              options={serviceOptions}
            />
            <SelectField
              label="Stage"
              value={form.stage}
              onChange={(v) => setForm((f) => ({ ...f, stage: v as JobFormData["stage"] }))}
              options={JOB_STAGES.map((s) => ({ value: s, label: JOB_STAGE_LABELS[s] }))}
            />

            <div className="sm:col-span-2">
              <Label>Job Address *</Label>
              <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
              {errors.address && <p className="mt-1 text-xs text-red-600">{errors.address}</p>}
            </div>
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label>County / Region</Label>
              <Input value={form.county || ""} onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))} />
            </div>

            <SelectField
              label="Crew"
              value={form.crew_id || ""}
              onChange={onCrewChange}
              options={[{ value: "", label: "Unassigned" }, ...crews.map((c) => ({ value: c.id, label: c.name }))]}
            />
            <SelectField
              label="Priority"
              value={form.priority}
              onChange={(v) => setForm((f) => ({ ...f, priority: v as JobFormData["priority"] }))}
              options={PRIORITY_OPTIONS}
            />

            <div>
              <Label>Install Start Date</Label>
              <Input type="date" value={form.start_date || ""} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div>
              <Label>Estimated Install Days</Label>
              <Input
                type="number"
                min={0}
                value={form.estimated_install_days ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, estimated_install_days: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Start Time</Label>
              <Input type="time" value={form.start_time || "08:00"} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))} />
            </div>
            <div>
              <Label>End Time</Label>
              <Input type="time" value={form.end_time || "17:00"} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))} />
            </div>

            <div>
              <Label>Window Units</Label>
              <Input
                type="number"
                min={0}
                value={form.units_count ?? 0}
                onChange={(e) => setForm((f) => ({ ...f, units_count: Number(e.target.value) }))}
              />
            </div>
            <div>
              <Label>Job Value ($)</Label>
              <Input
                type="number"
                min={0}
                value={form.job_value}
                onChange={(e) => setForm((f) => ({ ...f, job_value: Number(e.target.value) }))}
              />
            </div>

            <SelectField
              label="Deposit Status"
              value={form.deposit_status || "none"}
              onChange={(v) => setForm((f) => ({ ...f, deposit_status: v as JobFormData["deposit_status"] }))}
              options={DEPOSIT_OPTIONS}
            />
            <SelectField
              label="Material Delivery"
              value={form.material_delivery_status || "pending"}
              onChange={(v) => setForm((f) => ({ ...f, material_delivery_status: v as JobFormData["material_delivery_status"] }))}
              options={MATERIAL_DELIVERY_OPTIONS}
            />
            <SelectField
              label="Permit Status"
              value={form.permit_status || "not_required"}
              onChange={(v) => setForm((f) => ({ ...f, permit_status: v as JobFormData["permit_status"] }))}
              options={PERMIT_OPTIONS}
            />
            <SelectField
              label="Inspection Status"
              value={form.inspection_status || "not_required"}
              onChange={(v) => setForm((f) => ({ ...f, inspection_status: v as JobFormData["inspection_status"] }))}
              options={INSPECTION_OPTIONS}
            />
            <SelectField
              label="Final Walkthrough"
              value={form.final_walkthrough_status || "pending"}
              onChange={(v) => setForm((f) => ({ ...f, final_walkthrough_status: v as JobFormData["final_walkthrough_status"] }))}
              options={WALKTHROUGH_OPTIONS}
            />

            <div className="sm:col-span-2">
              <Label>Internal Notes</Label>
              <Textarea
                value={form.internal_notes || ""}
                onChange={(e) => setForm((f) => ({ ...f, internal_notes: e.target.value }))}
                rows={2}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Customer Notes</Label>
              <Textarea
                value={form.customer_notes || ""}
                onChange={(e) => setForm((f) => ({ ...f, customer_notes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-brand-blue hover:bg-brand-blue-dark">Save Job</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
