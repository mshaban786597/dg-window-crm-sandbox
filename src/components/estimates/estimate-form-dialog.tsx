"use client";

import { useEffect, useState } from "react";
import { Plus, Copy, Trash2, PanelsTopLeft } from "lucide-react";
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
import { useCRMStore, PROFILES } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import type { Estimate, WindowOpening } from "@/types/database";
import type { EstimateFormData } from "@/lib/store/form-types";
import {
  PROPERTY_TYPES,
  PROPERTY_TYPE_LABELS,
  MEASUREMENT_STATUSES,
  MEASUREMENT_STATUS_LABELS,
  ACCESS_DIFFICULTY,
  ACCESS_DIFFICULTY_LABELS,
  INSTALLATION_METHODS,
  INSTALLATION_METHOD_LABELS,
  WINDOW_STYLES,
  WINDOW_STYLE_LABELS,
  OPERATION_TYPES,
  OPERATION_TYPE_LABELS,
  FRAME_MATERIALS,
  FRAME_MATERIAL_LABELS,
  GLASS_PACKAGES,
  GLASS_PACKAGE_LABELS,
  GRID_PATTERNS,
  GRID_PATTERN_LABELS,
  SCREEN_OPTIONS,
  SCREEN_OPTION_LABELS,
  OPENING_CONDITIONS,
  OPENING_CONDITION_LABELS,
  MEASUREMENT_UNITS,
  MEASUREMENT_UNIT_LABELS,
} from "@/lib/domain";

const oid = () => `opening-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function newOpening(index: number): WindowOpening {
  return {
    id: oid(),
    room_location: "",
    opening_number: String(index + 1),
    quantity: 1,
    unit: "in",
    tempered: false,
    egress_required: false,
    impact_required: false,
    obscured_glass: false,
    photo_urls: [],
    notes: "",
  };
}

const emptyForm = (): EstimateFormData => ({
  customer_name: "",
  property_address: "",
  city: "",
  county: "",
  service_type: "window_replacement",
  status: "scheduled",
  scheduled_date: "",
  scheduled_time: "09:00",
  estimator_name: "",
  project_type: "residential",
  stories: 1,
  access_difficulty: "easy",
  installation_method: "insert_pocket",
  estimator_notes: "",
  openings: [],
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  estimate?: Estimate | null;
  defaultValues?: Partial<EstimateFormData>;
}

export function EstimateFormDialog({ open, onOpenChange, estimate, defaultValues }: Props) {
  const addEstimate = useCRMStore((s) => s.addEstimate);
  const updateEstimate = useCRMStore((s) => s.updateEstimate);
  const leads = useCRMStore((s) => s.leads);
  const customers = useCRMStore((s) => s.customers);
  const showToast = useCRMStore((s) => s.showToast);
  const services = useSettingsStore((s) => s.services).filter((o) => o.enabled);
  const manufacturers = useSettingsStore((s) => s.manufacturers);
  const productLines = useSettingsStore((s) => s.product_lines);

  const [form, setForm] = useState<EstimateFormData>(emptyForm());
  const [linkType, setLinkType] = useState<"lead" | "customer">("customer");
  const [linkId, setLinkId] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const estimators = PROFILES.filter((p) => p.role === "estimator" || p.role === "owner");

  useEffect(() => {
    if (estimate) {
      setForm({
        lead_id: estimate.lead_id,
        customer_id: estimate.customer_id,
        customer_name: estimate.customer_name,
        property_address: estimate.property_address,
        city: estimate.city || "",
        county: estimate.county || "",
        service_type: estimate.service_type,
        status: estimate.status,
        scheduled_date: estimate.scheduled_date?.slice(0, 10) || "",
        scheduled_time: estimate.scheduled_time || "09:00",
        estimator_name: estimate.estimator_name || "",
        project_type: estimate.project_type,
        year_built: estimate.year_built,
        stories: estimate.stories,
        exterior_type: estimate.exterior_type,
        access_difficulty: estimate.access_difficulty,
        lead_safe_pre1978: estimate.lead_safe_pre1978,
        permit_required: estimate.permit_required,
        hoa_approval_required: estimate.hoa_approval_required,
        installation_method: estimate.installation_method,
        preferred_manufacturer: estimate.preferred_manufacturer,
        preferred_product_line: estimate.preferred_product_line,
        interior_trim_work: estimate.interior_trim_work,
        exterior_trim_capping: estimate.exterior_trim_capping,
        visible_damage: estimate.visible_damage,
        disposal_required: estimate.disposal_required,
        estimator_notes: estimate.estimator_notes,
        openings: estimate.openings || [],
      });
      setLinkType(estimate.lead_id ? "lead" : "customer");
      setLinkId(estimate.lead_id || estimate.customer_id || "");
    } else {
      setForm({ ...emptyForm(), ...defaultValues });
      setLinkId("");
    }
    setErrors({});
  }, [estimate, open, defaultValues]);

  const onLinkChange = (type: "lead" | "customer", id: string) => {
    setLinkType(type);
    setLinkId(id);
    if (type === "lead") {
      const lead = leads.find((l) => l.id === id);
      if (lead) {
        setForm((f) => ({
          ...f,
          lead_id: id,
          customer_id: undefined,
          customer_name: lead.full_name,
          property_address: lead.address,
          city: lead.city,
          county: lead.county,
          service_type: lead.service_requested,
          project_type: lead.property_type,
        }));
      }
    } else {
      const cust = customers.find((c) => c.id === id);
      if (cust) {
        setForm((f) => ({
          ...f,
          customer_id: id,
          lead_id: undefined,
          customer_name: cust.full_name,
          property_address: cust.address,
          city: cust.city,
          county: cust.county,
          project_type: cust.property_type,
        }));
      }
    }
  };

  // ── Window openings ───────────────────────────────────────────
  const addOpening = () =>
    setForm((f) => ({ ...f, openings: [...f.openings, newOpening(f.openings.length)] }));

  const duplicateOpening = (id: string) =>
    setForm((f) => {
      const src = f.openings.find((o) => o.id === id);
      if (!src) return f;
      const copy: WindowOpening = { ...src, id: oid(), opening_number: String(f.openings.length + 1) };
      return { ...f, openings: [...f.openings, copy] };
    });

  const removeOpening = (id: string) =>
    setForm((f) => ({ ...f, openings: f.openings.filter((o) => o.id !== id) }));

  const patchOpening = (id: string, patch: Partial<WindowOpening>) =>
    setForm((f) => ({
      ...f,
      openings: f.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));

  const totalOpenings = form.openings.length;
  const totalUnits = form.openings.reduce((s, o) => s + (o.quantity || 0), 0);
  const estSqft = form.openings.reduce((s, o) => {
    if (!o.width || !o.height) return s;
    const div = o.unit === "cm" ? 929.0304 : 144; // cm² or in² per ft²
    return s + ((o.width * o.height) / div) * (o.quantity || 1);
  }, 0);

  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.customer_name.trim()) e.customer_name = "Customer/lead required";
    if (!form.property_address.trim()) e.property_address = "Address required";
    if (!linkId) e.link = "Select a lead or customer";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!validate()) {
      showToast("error", "Please fix form errors");
      return;
    }
    const payload = {
      ...form,
      lead_id: linkType === "lead" ? linkId : undefined,
      customer_id: linkType === "customer" ? linkId : form.customer_id,
    };
    if (estimate) updateEstimate(estimate.id, payload);
    else addEstimate(payload);
    onOpenChange(false);
  };

  const serviceOptions = services.length
    ? services.map((o) => ({ value: o.value, label: o.label }))
    : [{ value: form.service_type, label: form.service_type }];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{estimate ? "Edit Measurement" : "Schedule Measurement"}</DialogTitle>
          <DialogDescription>Measurement & estimate for a window project</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Project-level details */}
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Link To"
              value={linkType}
              onChange={(v) => { setLinkType(v as "lead" | "customer"); setLinkId(""); }}
              options={[{ value: "lead", label: "Lead" }, { value: "customer", label: "Customer" }]}
            />
            <SelectField
              label={linkType === "lead" ? "Select Lead *" : "Select Customer *"}
              value={linkId}
              onChange={(v) => onLinkChange(linkType, v)}
              error={errors.link}
              options={[
                { value: "", label: "— Select —" },
                ...(linkType === "lead" ? leads : customers).map((x) => ({ value: x.id, label: x.full_name })),
              ]}
            />
            <div className="sm:col-span-2">
              <Label>Property Address *</Label>
              <Input value={form.property_address} onChange={(e) => setForm((f) => ({ ...f, property_address: e.target.value }))} />
              {errors.property_address && <p className="text-xs text-red-600">{errors.property_address}</p>}
            </div>
            <div>
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} />
            </div>
            <div>
              <Label>County / Region</Label>
              <Input value={form.county} onChange={(e) => setForm((f) => ({ ...f, county: e.target.value }))} />
            </div>
            <SelectField label="Service Type" value={form.service_type} onChange={(v) => setForm((f) => ({ ...f, service_type: v as EstimateFormData["service_type"] }))} options={serviceOptions} />
            <SelectField label="Project Type" value={form.project_type || "residential"} onChange={(v) => setForm((f) => ({ ...f, project_type: v as EstimateFormData["project_type"] }))} options={PROPERTY_TYPES.map((p) => ({ value: p, label: PROPERTY_TYPE_LABELS[p] }))} />
            <SelectField label="Status" value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v as EstimateFormData["status"] }))} options={MEASUREMENT_STATUSES.map((s) => ({ value: s, label: MEASUREMENT_STATUS_LABELS[s] }))} />
            <SelectField label="Assigned Estimator" value={form.estimator_name || ""} onChange={(v) => setForm((f) => ({ ...f, estimator_name: v }))} options={[{ value: "", label: "— Unassigned —" }, ...estimators.map((e) => ({ value: e.full_name, label: e.full_name }))]} />
            <div>
              <Label>Appointment Date</Label>
              <Input type="date" value={form.scheduled_date} onChange={(e) => setForm((f) => ({ ...f, scheduled_date: e.target.value }))} />
            </div>
            <div>
              <Label>Appointment Time</Label>
              <Input type="time" value={form.scheduled_time} onChange={(e) => setForm((f) => ({ ...f, scheduled_time: e.target.value }))} />
            </div>
            <div>
              <Label>Year Built</Label>
              <Input type="number" value={form.year_built ?? ""} onChange={(e) => setForm((f) => ({ ...f, year_built: Number(e.target.value) || undefined }))} />
            </div>
            <div>
              <Label>Number of Stories</Label>
              <Input type="number" value={form.stories ?? 1} onChange={(e) => setForm((f) => ({ ...f, stories: Number(e.target.value) || undefined }))} />
            </div>
            <div>
              <Label>Siding / Exterior Type</Label>
              <Input value={form.exterior_type || ""} onChange={(e) => setForm((f) => ({ ...f, exterior_type: e.target.value }))} />
            </div>
            <SelectField label="Access Difficulty" value={form.access_difficulty || "easy"} onChange={(v) => setForm((f) => ({ ...f, access_difficulty: v }))} options={ACCESS_DIFFICULTY.map((a) => ({ value: a, label: ACCESS_DIFFICULTY_LABELS[a] }))} />
            <SelectField label="Installation Method" value={form.installation_method || "insert_pocket"} onChange={(v) => setForm((f) => ({ ...f, installation_method: v }))} options={INSTALLATION_METHODS.map((m) => ({ value: m, label: INSTALLATION_METHOD_LABELS[m] }))} />
            <SelectField label="Preferred Manufacturer" value={form.preferred_manufacturer || ""} onChange={(v) => setForm((f) => ({ ...f, preferred_manufacturer: v }))} options={[{ value: "", label: "— None —" }, ...manufacturers.map((m) => ({ value: m, label: m }))]} />
            <SelectField label="Preferred Product Line" value={form.preferred_product_line || ""} onChange={(v) => setForm((f) => ({ ...f, preferred_product_line: v }))} options={[{ value: "", label: "— None —" }, ...productLines.map((m) => ({ value: m, label: m }))]} />
          </div>

          {/* Project flags */}
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ["lead_safe_pre1978", "Lead-safe / pre-1978"],
              ["permit_required", "Permit required"],
              ["hoa_approval_required", "HOA approval required"],
              ["interior_trim_work", "Interior trim work"],
              ["exterior_trim_capping", "Exterior trim / capping"],
              ["visible_damage", "Visible rot or water damage"],
              ["disposal_required", "Disposal required"],
            ] as [keyof EstimateFormData, string][]).map(([key, label]) => (
              <label key={String(key)} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-blue"
                  checked={Boolean(form[key])}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>

          {/* Window openings */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PanelsTopLeft className="h-4 w-4 text-brand-blue" />
                <h3 className="text-sm font-semibold">Window Openings</h3>
              </div>
              <Button type="button" size="sm" variant="outline" onClick={addOpening} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Opening
              </Button>
            </div>

            <div className="flex flex-wrap gap-4 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
              <span><strong>{totalOpenings}</strong> openings</span>
              <span><strong>{totalUnits}</strong> units</span>
              <span>~<strong>{estSqft.toFixed(1)}</strong> sq ft</span>
            </div>

            {form.openings.length === 0 && (
              <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                No openings added yet. Click &ldquo;Add Opening&rdquo; to begin measuring.
              </p>
            )}

            {form.openings.map((o, i) => (
              <div key={o.id} className="space-y-3 rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Opening #{o.opening_number || i + 1}</p>
                  <div className="flex gap-1">
                    <Button type="button" size="icon" variant="ghost" onClick={() => duplicateOpening(o.id)} title="Duplicate">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button type="button" size="icon" variant="ghost" onClick={() => removeOpening(o.id)} title="Remove" className="text-red-600 hover:text-red-700">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <Label>Room / Location</Label>
                    <Input value={o.room_location} onChange={(e) => patchOpening(o.id, { room_location: e.target.value })} />
                  </div>
                  <div>
                    <Label>Opening #</Label>
                    <Input value={o.opening_number} onChange={(e) => patchOpening(o.id, { opening_number: e.target.value })} />
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input type="number" min={1} value={o.quantity} onChange={(e) => patchOpening(o.id, { quantity: Number(e.target.value) || 1 })} />
                  </div>
                  <div>
                    <Label>Width</Label>
                    <Input type="number" value={o.width ?? ""} onChange={(e) => patchOpening(o.id, { width: Number(e.target.value) || undefined })} />
                  </div>
                  <div>
                    <Label>Height</Label>
                    <Input type="number" value={o.height ?? ""} onChange={(e) => patchOpening(o.id, { height: Number(e.target.value) || undefined })} />
                  </div>
                  <SelectField label="Unit" value={o.unit} onChange={(v) => patchOpening(o.id, { unit: v })} options={MEASUREMENT_UNITS.map((u) => ({ value: u, label: MEASUREMENT_UNIT_LABELS[u] }))} />
                  <SelectField label="Style" value={o.window_style || ""} onChange={(v) => patchOpening(o.id, { window_style: v })} options={[{ value: "", label: "—" }, ...WINDOW_STYLES.map((s) => ({ value: s, label: WINDOW_STYLE_LABELS[s] }))]} />
                  <SelectField label="Operation" value={o.operation_type || ""} onChange={(v) => patchOpening(o.id, { operation_type: v })} options={[{ value: "", label: "—" }, ...OPERATION_TYPES.map((s) => ({ value: s, label: OPERATION_TYPE_LABELS[s] }))]} />
                  <SelectField label="Frame" value={o.frame_material || ""} onChange={(v) => patchOpening(o.id, { frame_material: v })} options={[{ value: "", label: "—" }, ...FRAME_MATERIALS.map((s) => ({ value: s, label: FRAME_MATERIAL_LABELS[s] }))]} />
                  <div>
                    <Label>Interior Color</Label>
                    <Input value={o.interior_color || ""} onChange={(e) => patchOpening(o.id, { interior_color: e.target.value })} />
                  </div>
                  <div>
                    <Label>Exterior Color</Label>
                    <Input value={o.exterior_color || ""} onChange={(e) => patchOpening(o.id, { exterior_color: e.target.value })} />
                  </div>
                  <SelectField label="Glass Package" value={o.glass_package || ""} onChange={(v) => patchOpening(o.id, { glass_package: v })} options={[{ value: "", label: "—" }, ...GLASS_PACKAGES.map((s) => ({ value: s, label: GLASS_PACKAGE_LABELS[s] }))]} />
                  <SelectField label="Grid Pattern" value={o.grid_pattern || ""} onChange={(v) => patchOpening(o.id, { grid_pattern: v })} options={[{ value: "", label: "—" }, ...GRID_PATTERNS.map((s) => ({ value: s, label: GRID_PATTERN_LABELS[s] }))]} />
                  <SelectField label="Screen" value={o.screen_option || ""} onChange={(v) => patchOpening(o.id, { screen_option: v })} options={[{ value: "", label: "—" }, ...SCREEN_OPTIONS.map((s) => ({ value: s, label: SCREEN_OPTION_LABELS[s] }))]} />
                  <SelectField label="Existing Condition" value={o.existing_condition || ""} onChange={(v) => patchOpening(o.id, { existing_condition: v })} options={[{ value: "", label: "—" }, ...OPENING_CONDITIONS.map((s) => ({ value: s, label: OPENING_CONDITION_LABELS[s] }))]} />
                  <SelectField label="Install Method" value={o.installation_method || ""} onChange={(v) => patchOpening(o.id, { installation_method: v })} options={[{ value: "", label: "—" }, ...INSTALLATION_METHODS.map((s) => ({ value: s, label: INSTALLATION_METHOD_LABELS[s] }))]} />
                  <div>
                    <Label>Trim / Capping</Label>
                    <Input value={o.trim_capping || ""} onChange={(e) => patchOpening(o.id, { trim_capping: e.target.value })} />
                  </div>
                  <div>
                    <Label>Photo URLs (comma-sep)</Label>
                    <Input
                      value={(o.photo_urls || []).join(", ")}
                      placeholder="photo placeholder"
                      onChange={(e) => patchOpening(o.id, { photo_urls: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })}
                    />
                  </div>
                </div>
                <div className="flex flex-wrap gap-4">
                  {([
                    ["tempered", "Tempered"],
                    ["egress_required", "Egress"],
                    ["impact_required", "Impact-rated"],
                    ["obscured_glass", "Obscured / privacy"],
                  ] as [keyof WindowOpening, string][]).map(([key, label]) => (
                    <label key={String(key)} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-brand-blue"
                        checked={Boolean(o[key])}
                        onChange={(e) => patchOpening(o.id, { [key]: e.target.checked } as Partial<WindowOpening>)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
                <div>
                  <Label>Opening Notes</Label>
                  <Textarea rows={2} value={o.notes || ""} onChange={(e) => patchOpening(o.id, { notes: e.target.value })} />
                </div>
              </div>
            ))}
          </div>

          <div>
            <Label>Estimator Notes</Label>
            <Textarea value={form.estimator_notes} onChange={(e) => setForm((f) => ({ ...f, estimator_notes: e.target.value }))} rows={3} />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" className="bg-brand-blue hover:bg-brand-blue-dark">Save Measurement</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
