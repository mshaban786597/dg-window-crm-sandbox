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
import type { Review, ServiceType } from "@/types/database";
import type { ReviewRequestFormData } from "@/lib/store/form-types";
import { SERVICES, SERVICE_LABELS, REVIEW_STATUSES, REVIEW_STATUS_LABELS } from "@/lib/constants";
import { Copy } from "lucide-react";

const DEFAULT_SERVICE: ServiceType = SERVICES[0];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  review?: Review | null;
  jobId?: string;
  customerId?: string;
}

/** Substitute the generic configurable template placeholders. */
function buildMessage(template: string, name: string, service: string, link: string): string {
  return template
    .replace(/\{\{\s*name\s*\}\}/g, name || "there")
    .replace(/\{\{\s*service\s*\}\}/g, service || "project")
    .replace(/\{\{\s*link\s*\}\}/g, link)
    .trim();
}

export function ReviewRequestFormDialog({ open, onOpenChange, review, jobId, customerId }: Props) {
  const addReviewRequest = useCRMStore((s) => s.addReviewRequest);
  const updateReviewRequest = useCRMStore((s) => s.updateReviewRequest);
  const customers = useCRMStore((s) => s.customers);
  const jobs = useCRMStore((s) => s.jobs);
  const showToast = useCRMStore((s) => s.showToast);

  const reviewLink = useSettingsStore((s) => s.review_link);
  const messageTemplate = useSettingsStore((s) => s.review_message_template);
  const configuredServices = useSettingsStore((s) => s.services);

  const serviceOptions = configuredServices
    .filter((o) => o.enabled)
    .map((o) => ({ value: o.value, label: o.label }));

  const [form, setForm] = useState<ReviewRequestFormData>({
    customer_id: "",
    job_id: "",
    customer_name: "",
    phone: "",
    email: "",
    service_type: DEFAULT_SERVICE,
    request_method: "manual",
    status: "sent",
    rating: undefined,
    notes: "",
  });

  const completedJobs = jobs.filter((j) =>
    ["completed", "paid", "invoice_sent", "quality_check", "review_requested", "closed"].includes(j.stage)
  );

  useEffect(() => {
    if (review) {
      setForm({
        customer_id: review.customer_id,
        job_id: review.job_id,
        customer_name: review.customer_name,
        phone: review.phone || "",
        email: review.email || "",
        service_type: review.service_type || DEFAULT_SERVICE,
        request_method: review.request_method || "manual",
        status: (review.status as ReviewRequestFormData["status"]) || "sent",
        rating: review.rating,
        notes: review.notes || "",
      });
    } else {
      const job = jobId ? jobs.find((j) => j.id === jobId) : undefined;
      const custId = customerId || job?.customer_id || "";
      const cust = customers.find((c) => c.id === custId);
      setForm({
        customer_id: custId,
        job_id: jobId || job?.id || "",
        customer_name: job?.customer_name || cust?.full_name || "",
        phone: job?.customer_phone || cust?.phone || "",
        email: cust?.email || "",
        service_type: job?.service_type || DEFAULT_SERVICE,
        request_method: "manual",
        status: "sent",
        notes: "",
      });
    }
  }, [review, open, jobId, customerId, jobs, customers]);

  const onCustomerChange = (id: string) => {
    const c = customers.find((x) => x.id === id);
    if (c) setForm((f) => ({ ...f, customer_id: id, customer_name: c.full_name, phone: c.phone, email: c.email }));
  };

  const onJobChange = (id: string) => {
    const j = jobs.find((x) => x.id === id);
    if (j) {
      const c = customers.find((x) => x.id === j.customer_id);
      setForm((f) => ({
        ...f,
        job_id: id,
        customer_id: j.customer_id,
        customer_name: j.customer_name,
        phone: j.customer_phone,
        email: c?.email,
        service_type: j.service_type,
      }));
    }
  };

  const linkConfigured = reviewLink.trim().length > 0;
  const message = buildMessage(
    messageTemplate,
    form.customer_name,
    SERVICE_LABELS[form.service_type] || form.service_type,
    reviewLink
  );

  const handleCopyLink = async () => {
    if (!linkConfigured) return;
    try {
      await navigator.clipboard.writeText(reviewLink);
      showToast("success", "Review link copied");
    } catch {
      showToast("error", "Could not copy review link");
    }
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.customer_id) {
      showToast("error", "Customer is required");
      return;
    }
    if (!form.job_id) {
      showToast("error", "Completed job is required");
      return;
    }
    if (review) updateReviewRequest(review.id, form);
    else addReviewRequest(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{review ? "Edit Review Request" : "Request Review"}</DialogTitle>
          <DialogDescription>
            Creates a review request record. SMS/email via configured integrations — coming soon.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <SelectField label="Customer *" value={form.customer_id} onChange={onCustomerChange} options={customers.map((c) => ({ value: c.id, label: c.full_name }))} />
          <SelectField label="Completed Job *" value={form.job_id || ""} onChange={onJobChange} options={completedJobs.map((j) => ({ value: j.id, label: `${j.customer_name} — ${j.address}` }))} />
          <SelectField label="Service" value={form.service_type} onChange={(v) => setForm((f) => ({ ...f, service_type: v as ServiceType }))} options={serviceOptions} />
          <SelectField label="Request Method" value={form.request_method} onChange={(v) => setForm((f) => ({ ...f, request_method: v as ReviewRequestFormData["request_method"] }))} options={[{ value: "manual", label: "Sent Manually" }, { value: "sms", label: "SMS (Coming Soon)" }, { value: "email", label: "Email (Coming Soon)" }]} />
          <SelectField label="Status" value={form.status || "sent"} onChange={(v) => setForm((f) => ({ ...f, status: v as ReviewRequestFormData["status"] }))} options={REVIEW_STATUSES.map((s) => ({ value: s, label: REVIEW_STATUS_LABELS[s] }))} />
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </div>
          <div>
            <Label>Rating (when received)</Label>
            <Input type="number" min={1} max={5} value={form.rating ?? ""} onChange={(e) => setForm((f) => ({ ...f, rating: Number(e.target.value) || undefined }))} />
          </div>
          <div>
            <div className="flex items-center justify-between">
              <Label>Review Link</Label>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!linkConfigured}
                onClick={handleCopyLink}
              >
                <Copy className="h-3 w-3 mr-1" /> Copy Review Link
              </Button>
            </div>
            {linkConfigured ? (
              <Input value={reviewLink} readOnly className="bg-muted" />
            ) : (
              <p className="text-xs text-muted-foreground">Add a review link in Settings</p>
            )}
          </div>
          <div>
            <Label>Message Template</Label>
            <Textarea value={message} readOnly rows={5} className="text-sm bg-muted" />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
          </div>
          <p className="text-xs text-muted-foreground">Integrations: SMS and email — placeholders for future send automation.</p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-primary hover:bg-brand-blue-dark">
              {review ? "Save" : "Create Request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
