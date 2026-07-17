"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SandboxBadge } from "@/components/layout/sandbox-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import { ROLE_LABELS, SANDBOX_MODE } from "@/lib/domain";

function TagList({
  items,
  onAdd,
  onRemove,
  placeholder,
}: {
  items: string[];
  onAdd: (v: string) => void;
  onRemove: (v: string) => void;
  placeholder: string;
}) {
  const [val, setVal] = useState("");
  const add = () => {
    if (val.trim()) {
      onAdd(val);
      setVal("");
    }
  };
  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input value={val} placeholder={placeholder} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} />
        <Button type="button" variant="outline" onClick={add} className="gap-1.5">
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">None configured yet.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((it) => (
            <span key={it} className="inline-flex items-center gap-1 rounded-full bg-brand-blue-light px-3 py-1 text-sm text-brand-blue-dark">
              {it}
              <button type="button" onClick={() => onRemove(it)} className="text-brand-blue-dark/70 hover:text-red-600">
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SettingsPage() {
  const currentUser = useCRMStore((s) => s.currentUser);
  const showToast = useCRMStore((s) => s.showToast);
  const s = useSettingsStore();

  const [newService, setNewService] = useState("");
  const [newSource, setNewSource] = useState("");

  const save = () => showToast("success", "Settings saved");

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Company profile, taxonomy, users, integrations & automations"
        actions={<SandboxBadge />}
      />

      <Tabs defaultValue="company">
        <TabsList className="flex-wrap">
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="pipeline">Pipeline & Sources</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="users">Users & Roles</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="automations">Automations</TabsTrigger>
        </TabsList>

        {/* Company */}
        <TabsContent value="company" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Company Profile</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 max-w-3xl">
              <div><Label>Company Name</Label><Input value={s.company.name} placeholder="Your window company" onChange={(e) => s.updateCompany({ name: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={s.company.phone} onChange={(e) => s.updateCompany({ phone: e.target.value })} /></div>
              <div><Label>Email</Label><Input value={s.company.email} onChange={(e) => s.updateCompany({ email: e.target.value })} /></div>
              <div><Label>Website</Label><Input value={s.company.website} onChange={(e) => s.updateCompany({ website: e.target.value })} /></div>
              <div><Label>Logo URL (placeholder)</Label><Input value={s.company.logo_url} placeholder="https://…/logo.png" onChange={(e) => s.updateCompany({ logo_url: e.target.value })} /></div>
              <div><Label>Primary Service Area</Label><Input value={s.company.service_area} onChange={(e) => s.updateCompany({ service_area: e.target.value })} /></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Defaults</CardTitle></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 max-w-3xl">
              <div><Label>Default Tax Rate (%)</Label><Input type="number" step={0.01} value={s.tax_rate} onChange={(e) => s.setField("tax_rate", Number(e.target.value) || 0)} /></div>
              <div><Label>Currency</Label><Input value={s.currency} onChange={(e) => s.setField("currency", e.target.value || "USD")} /></div>
              <div><Label>Timezone</Label><Input value={s.timezone} onChange={(e) => s.setField("timezone", e.target.value)} /></div>
              <div><Label>Proposal Validity (days)</Label><Input type="number" value={s.proposal_validity_days} onChange={(e) => s.setField("proposal_validity_days", Number(e.target.value) || 0)} /></div>
              <div><Label>Default Deposit (%)</Label><Input type="number" value={s.default_deposit_percent} onChange={(e) => s.setField("default_deposit_percent", Number(e.target.value) || 0)} /></div>
              <div><Label>Review Link</Label><Input value={s.review_link} placeholder="https://…/review" onChange={(e) => s.setField("review_link", e.target.value)} /></div>
              <div className="sm:col-span-2"><Label>Review Message Template</Label><Input value={s.review_message_template} onChange={(e) => s.setField("review_message_template", e.target.value)} /><p className="mt-1 text-xs text-muted-foreground">Use {"{{name}}"}, {"{{service}}"}, {"{{link}}"} placeholders.</p></div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Service Areas</CardTitle></CardHeader>
            <CardContent>
              <TagList items={s.service_areas} onAdd={s.addServiceArea} onRemove={s.removeServiceArea} placeholder="Add a city or region" />
            </CardContent>
          </Card>

          <Button className="bg-brand-blue hover:bg-brand-blue-dark" onClick={save}>Save Changes</Button>
        </TabsContent>

        {/* Services */}
        <TabsContent value="services" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Service Taxonomy</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">Enable, disable, add, or remove the window services your company offers. Forms use the enabled services.</p>
              <div className="flex gap-2 max-w-md">
                <Input value={newService} placeholder="Add a service (e.g. Bay & Bow Windows)" onChange={(e) => setNewService(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (s.addService(newService), setNewService("")))} />
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => { s.addService(newService); setNewService(""); }}><Plus className="h-4 w-4" /> Add</Button>
              </div>
              <div className="divide-y rounded-lg border">
                {s.services.map((svc) => (
                  <div key={svc.value} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-medium">{svc.label}</p>
                      <p className="text-xs text-muted-foreground">{svc.value}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="relative inline-flex cursor-pointer items-center">
                        <input type="checkbox" checked={svc.enabled} onChange={() => s.toggleService(svc.value)} className="sr-only peer" />
                        <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-brand-blue after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                      </label>
                      <button type="button" onClick={() => s.removeService(svc.value)} className="text-muted-foreground hover:text-red-600"><X className="h-4 w-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pipeline & sources */}
        <TabsContent value="pipeline" className="mt-4 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Lead Stages</CardTitle></CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {s.lead_stages.map((st, i) => (
                  <span key={st.value} className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
                    <span className="text-xs text-muted-foreground">{i + 1}</span>
                    {st.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">Stage keys drive pipeline logic and are fixed; labels shown above.</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Lead Sources</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2 max-w-md">
                <Input value={newSource} placeholder="Add a lead source" onChange={(e) => setNewSource(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), (s.addLeadSource(newSource), setNewSource("")))} />
                <Button type="button" variant="outline" className="gap-1.5" onClick={() => { s.addLeadSource(newSource); setNewSource(""); }}><Plus className="h-4 w-4" /> Add</Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.lead_sources.map((src) => (
                  <span key={src.value} className="inline-flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-sm">
                    {src.label}
                    <button type="button" onClick={() => s.removeLeadSource(src.value)} className="text-muted-foreground hover:text-red-600"><X className="h-3.5 w-3.5" /></button>
                  </span>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Products */}
        <TabsContent value="products" className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Window Manufacturers</CardTitle></CardHeader>
            <CardContent><TagList items={s.manufacturers} onAdd={s.addManufacturer} onRemove={s.removeManufacturer} placeholder="Add a manufacturer" /></CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Product Lines</CardTitle></CardHeader>
            <CardContent><TagList items={s.product_lines} onAdd={s.addProductLine} onRemove={s.removeProductLine} placeholder="Add a product line" /></CardContent>
          </Card>
        </TabsContent>

        {/* Users */}
        <TabsContent value="users" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Team Members</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {currentUser && (
                <div className="rounded-lg border p-4 flex justify-between items-center">
                  <div>
                    <p className="font-medium">{currentUser.full_name}</p>
                    <p className="text-sm text-muted-foreground">{currentUser.email}</p>
                  </div>
                  <span className="text-sm rounded-full bg-brand-blue-light text-brand-blue-dark px-3 py-1">
                    {ROLE_LABELS[currentUser.role]}
                  </span>
                </div>
              )}
              <div>
                <p className="text-sm font-medium">Available Roles</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {s.user_roles.map((r) => (
                    <span key={r.value} className="rounded-full border px-3 py-1 text-sm">{r.label}</span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Integrations */}
        <TabsContent value="integrations" className="mt-4 space-y-4">
          <div className="rounded-lg border border-brand-blue/30 bg-brand-blue-light/50 p-3 text-sm text-brand-blue-dark">
            {SANDBOX_MODE
              ? "Sandbox mode is ON. All integrations are disabled and no external services will run, even if toggled on here."
              : "Integrations are disabled by default. Enable one only after configuring its credentials."}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {s.integrations.map((int) => (
              <Card key={int.id}>
                <CardContent className="pt-6 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{int.name}</p>
                    <p className="text-sm text-muted-foreground mt-1">{int.description}</p>
                    <p className="text-xs mt-2 text-muted-foreground">{int.enabled ? "Enabled (inactive in sandbox)" : "Disabled"}</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center pt-1">
                    <input type="checkbox" checked={int.enabled} onChange={() => s.toggleIntegration(int.id)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-brand-blue after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Automations */}
        <TabsContent value="automations" className="mt-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Follow-Up Automations</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">Suggested automation templates. These are disabled by default and never execute in sandbox mode.</p>
              {s.automations.map((auto) => (
                <div key={auto.id} className="flex items-center justify-between rounded-lg border p-4">
                  <div>
                    <p className="font-medium text-sm">{auto.name}</p>
                    <p className="text-xs text-muted-foreground">{auto.trigger} → {auto.action} ({auto.delay})</p>
                  </div>
                  <label className="relative inline-flex cursor-pointer items-center">
                    <input type="checkbox" checked={auto.enabled} onChange={() => s.toggleAutomation(auto.id)} className="sr-only peer" />
                    <div className="w-9 h-5 bg-gray-200 rounded-full peer peer-checked:bg-brand-blue after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:after:translate-x-4" />
                  </label>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
