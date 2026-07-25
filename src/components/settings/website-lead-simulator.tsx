"use client";

import { useState } from "react";
import { Globe, CheckCircle2, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useCRMStore } from "@/lib/store/crm-store";
import type { WebsiteLeadInput } from "@/lib/store/crm-extended";
import { US_STATES } from "@/lib/domain";

interface SimResult {
  leadId: string;
  assignedTo: string | null;
  assignedName?: string;
  needsAssignment: boolean;
}

const EMPTY: WebsiteLeadInput = {
  first_name: "",
  last_name: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  service_needed: "",
  message: "",
  campaign: "",
  utm_source: "",
  utm_medium: "",
  utm_campaign: "",
};

/**
 * Sandbox website-intake simulator (§12).
 *
 * Builds a WebsiteLeadInput and runs the real intake workflow via
 * `importWebsiteLead`, so auto-assignment (default manager / round-robin) and
 * the "needs assignment" fallback are demonstrable end-to-end and persisted.
 */
export function WebsiteLeadSimulator() {
  const [form, setForm] = useState<WebsiteLeadInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);

  const set = <K extends keyof WebsiteLeadInput>(key: K, value: WebsiteLeadInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Only send filled optional fields; phone is the one hard requirement.
      const payload: WebsiteLeadInput = { ...form, phone: (form.phone || "").trim() };
      const res = await useCRMStore.getState().importWebsiteLead(payload);
      const team = useCRMStore.getState().teamMembers;
      const assignedName = res.assignedTo
        ? (() => {
            const m = team.find((t) => t.id === res.assignedTo);
            return m ? `${m.first_name} ${m.last_name}`.trim() : undefined;
          })()
        : undefined;
      setResult({ ...res, assignedName });
      setForm(EMPTY);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Globe className="h-4 w-4 text-brand-blue" />
          Website Lead Simulator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border border-brand-blue/30 bg-brand-blue-light/50 p-3 text-sm text-brand-blue-dark">
          Sandbox tool. Submitting creates a real lead through the website intake
          workflow and auto-assigns it using the settings above — no external
          services run.
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label>First Name</Label>
            <Input value={form.first_name ?? ""} onChange={(e) => set("first_name", e.target.value)} placeholder="Jane" />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input value={form.last_name ?? ""} onChange={(e) => set("last_name", e.target.value)} placeholder="Doe" />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} placeholder="(555) 123-4567" />
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email ?? ""} onChange={(e) => set("email", e.target.value)} placeholder="jane@example.com" />
          </div>
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Input value={form.address ?? ""} onChange={(e) => set("address", e.target.value)} placeholder="123 Main St" />
          </div>
          <div>
            <Label>City</Label>
            <Input value={form.city ?? ""} onChange={(e) => set("city", e.target.value)} placeholder="Springfield" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>State</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={form.state ?? ""}
                onChange={(e) => set("state", e.target.value)}
              >
                <option value="">—</option>
                {US_STATES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>ZIP</Label>
              <Input value={form.zip ?? ""} onChange={(e) => set("zip", e.target.value)} placeholder="00000" />
            </div>
          </div>
          <div>
            <Label>Service Needed</Label>
            <Input
              value={form.service_needed ?? ""}
              onChange={(e) => set("service_needed", e.target.value)}
              placeholder="Window Replacement / free text"
            />
          </div>
          <div>
            <Label>Campaign</Label>
            <Input value={form.campaign ?? ""} onChange={(e) => set("campaign", e.target.value)} placeholder="spring_promo" />
          </div>
          <div className="sm:col-span-2">
            <Label>Message</Label>
            <Textarea
              value={form.message ?? ""}
              onChange={(e) => set("message", e.target.value)}
              placeholder="Tell us about your project…"
            />
          </div>
          <div>
            <Label>utm_source</Label>
            <Input value={form.utm_source ?? ""} onChange={(e) => set("utm_source", e.target.value)} placeholder="google" />
          </div>
          <div>
            <Label>utm_medium</Label>
            <Input value={form.utm_medium ?? ""} onChange={(e) => set("utm_medium", e.target.value)} placeholder="cpc" />
          </div>
          <div className="sm:col-span-2">
            <Label>utm_campaign</Label>
            <Input value={form.utm_campaign ?? ""} onChange={(e) => set("utm_campaign", e.target.value)} placeholder="windows_2026" />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            className="bg-brand-blue hover:bg-brand-blue-dark"
            onClick={submit}
            disabled={busy || !(form.phone || "").trim()}
          >
            {busy ? "Submitting…" : "Simulate Website Submission"}
          </Button>
          {!(form.phone || "").trim() && (
            <span className="text-xs text-muted-foreground">Phone is required.</span>
          )}
        </div>

        {result && (
          <div
            className={
              result.needsAssignment
                ? "rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800"
                : "rounded-lg border border-green-300 bg-green-50 p-3 text-sm text-green-800"
            }
          >
            <div className="flex items-start gap-2">
              {result.needsAssignment ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
              )}
              <div>
                <p className="font-medium">
                  Lead created — <span className="font-mono">{result.leadId}</span>
                </p>
                {result.needsAssignment ? (
                  <p className="mt-0.5">
                    No active manager available. Flagged <strong>needs_assignment</strong> and an
                    administrator was notified (sandbox).
                  </p>
                ) : (
                  <p className="mt-0.5">
                    Auto-assigned to manager{" "}
                    <strong>{result.assignedName || result.assignedTo}</strong>. Assignment
                    notification recorded in the outbox (sandbox).
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
