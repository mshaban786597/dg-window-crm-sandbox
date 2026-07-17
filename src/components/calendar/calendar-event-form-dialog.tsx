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
import type { ScheduleEvent } from "@/types/database";
import type { CalendarEventFormData } from "@/lib/store/form-types";
import { CALENDAR_EVENT_TYPES, CALENDAR_EVENT_TYPE_LABELS } from "@/lib/constants";

const EVENT_TYPE_OPTIONS = CALENDAR_EVENT_TYPES.map((t) => ({
  value: t,
  label: CALENDAR_EVENT_TYPE_LABELS[t],
}));

function toLocalDatetime(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event?: ScheduleEvent | null;
}

export function CalendarEventFormDialog({ open, onOpenChange, event }: Props) {
  const addCalendarEvent = useCRMStore((s) => s.addCalendarEvent);
  const updateCalendarEvent = useCRMStore((s) => s.updateCalendarEvent);
  const customers = useCRMStore((s) => s.customers);
  const leads = useCRMStore((s) => s.leads);
  const jobs = useCRMStore((s) => s.jobs);
  const crews = useCRMStore((s) => s.crews);
  const showToast = useCRMStore((s) => s.showToast);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<CalendarEventFormData["type"]>("measurement");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [leadId, setLeadId] = useState("");
  const [jobId, setJobId] = useState("");
  const [crewId, setCrewId] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (event) {
      setTitle(event.title);
      setType(event.type);
      setStart(toLocalDatetime(event.start));
      setEnd(toLocalDatetime(event.end));
      setCustomerId(event.customer_id || "");
      setLeadId(event.lead_id || "");
      setJobId(event.job_id || "");
      setCrewId(event.crew_id || "");
      setAddress(event.address || "");
      setCity(event.city || "");
      setNotes(event.notes || "");
    } else {
      const now = new Date();
      now.setHours(9, 0, 0, 0);
      const endD = new Date(now);
      endD.setHours(11, 0, 0, 0);
      setTitle("");
      setType("measurement");
      setStart(toLocalDatetime(now.toISOString()));
      setEnd(toLocalDatetime(endD.toISOString()));
      setCustomerId("");
      setLeadId("");
      setJobId("");
      setCrewId("");
      setAddress("");
      setCity("");
      setNotes("");
    }
  }, [event, open]);

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!title.trim() || !start || !end) {
      showToast("error", "Title, start, and end are required");
      return;
    }
    const cust = customers.find((c) => c.id === customerId);
    const crew = crews.find((c) => c.id === crewId);
    const data: CalendarEventFormData = {
      title,
      type,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      customer_id: customerId || undefined,
      customer_name: cust?.full_name,
      lead_id: leadId || undefined,
      job_id: jobId || undefined,
      crew_id: crewId || undefined,
      crew_name: crew?.name,
      address,
      city,
      notes,
    };
    if (event) updateCalendarEvent(event.id, data);
    else addCalendarEvent(data);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{event ? "Edit Event" : "Add Calendar Event"}</DialogTitle>
          <DialogDescription>Schedule measurements, installations, and follow-ups</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Title *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <SelectField
            label="Event Type"
            value={type}
            onChange={(v) => setType(v as CalendarEventFormData["type"])}
            options={EVENT_TYPE_OPTIONS}
          />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start *</Label>
              <Input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <Label>End *</Label>
              <Input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <SelectField label="Customer" value={customerId} onChange={setCustomerId} options={[{ value: "", label: "None" }, ...customers.map((c) => ({ value: c.id, label: c.full_name }))]} />
          <SelectField label="Lead" value={leadId} onChange={setLeadId} options={[{ value: "", label: "None" }, ...leads.map((l) => ({ value: l.id, label: l.full_name }))]} />
          <SelectField label="Job" value={jobId} onChange={setJobId} options={[{ value: "", label: "None" }, ...jobs.map((j) => ({ value: j.id, label: j.customer_name }))]} />
          <SelectField label="Crew" value={crewId} onChange={setCrewId} options={[{ value: "", label: "None" }, ...crews.map((c) => ({ value: c.id, label: c.name }))]} />
          <div>
            <Label>Address</Label>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <div>
            <Label>City</Label>
            <Input value={city} onChange={(e) => setCity(e.target.value)} />
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-primary hover:bg-brand-blue-dark">Save Event</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
