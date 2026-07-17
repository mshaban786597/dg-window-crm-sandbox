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
import type { Crew } from "@/types/database";
import type { CrewFormData } from "@/lib/store/form-types";
import { CREW_SKILLS, CREW_STATUSES, CREW_STATUS_LABELS } from "@/lib/constants";

const EMPTY: CrewFormData = {
  name: "",
  lead_name: "",
  phone: "",
  email: "",
  skills: [],
  availability: "Mon–Fri 7am–5pm",
  status: "available",
  notes: "",
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  crew?: Crew | null;
}

export function CrewFormDialog({ open, onOpenChange, crew }: Props) {
  const addCrew = useCRMStore((s) => s.addCrew);
  const updateCrew = useCRMStore((s) => s.updateCrew);
  const showToast = useCRMStore((s) => s.showToast);
  const [form, setForm] = useState<CrewFormData>(EMPTY);

  useEffect(() => {
    if (crew) {
      setForm({
        name: crew.name,
        lead_name: crew.lead_name,
        phone: crew.phone,
        email: crew.email || "",
        skills: crew.skills,
        availability: crew.availability || "",
        status: crew.status || "available",
        notes: crew.notes || "",
      });
    } else setForm(EMPTY);
  }, [crew, open]);

  const toggleSkill = (skill: string) => {
    setForm((f) => ({
      ...f,
      skills: f.skills.includes(skill) ? f.skills.filter((s) => s !== skill) : [...f.skills, skill],
    }));
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.name.trim() || !form.lead_name.trim() || !form.phone.trim()) {
      showToast("error", "Crew name, lead, and phone are required");
      return;
    }
    if (crew) updateCrew(crew.id, form);
    else addCrew(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{crew ? "Edit Crew" : "Add Crew"}</DialogTitle>
          <DialogDescription>Field crew for window installations and repairs</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label>Crew Name *</Label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </div>
            <div>
              <Label>Crew Lead *</Label>
              <Input value={form.lead_name} onChange={(e) => setForm((f) => ({ ...f, lead_name: e.target.value }))} />
            </div>
            <div>
              <Label>Phone *</Label>
              <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
            <div>
              <Label>Availability</Label>
              <Input value={form.availability} onChange={(e) => setForm((f) => ({ ...f, availability: e.target.value }))} />
            </div>
            <SelectField label="Status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v as CrewFormData["status"] }))} options={CREW_STATUSES.map((s) => ({ value: s, label: CREW_STATUS_LABELS[s] }))} />
            <div className="sm:col-span-2">
              <Label>Skills</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {CREW_SKILLS.map((skill) => (
                  <button
                    key={skill}
                    type="button"
                    onClick={() => toggleSkill(skill)}
                    className={`rounded-full px-3 py-1 text-xs border ${form.skills.includes(skill) ? "bg-primary text-white border-primary" : "hover:bg-muted"}`}
                  >
                    {skill}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-primary hover:bg-brand-blue-dark">Save Crew</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
