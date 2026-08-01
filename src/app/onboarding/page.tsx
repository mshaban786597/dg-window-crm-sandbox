"use client";

/**
 * Guided tenant onboarding (§6).
 *
 * Nine steps, driven by ONBOARDING_STEPS / ONBOARDING_STEP_LABELS. Steps listed
 * in OPTIONAL_ONBOARDING_STEPS can be skipped and resumed later — progress is
 * stored on the tenant (`onboarding_completed_steps`) so a returning user lands
 * on the first step they have not finished yet.
 *
 * Company Profile / Services / Service Areas / Lead Sources write into the
 * existing tenant settings store (`useSettingsStore`) rather than introducing a
 * parallel copy of that configuration.
 *
 * The wizard renders no CRM shell and never shows another tenant's data: every
 * read is scoped to the active session's tenant.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Globe,
  Loader2,
  Mail,
  MapPin,
  PanelsTopLeft,
  Package,
  Plus,
  Users,
  Wrench,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SelectField } from "@/components/ui/select-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP, LEAD_SERVICE_OPTIONS } from "@/lib/domain";
import { useSettingsStore } from "@/lib/settings/settings-store";
import { useTenancyStore } from "@/lib/tenancy/tenancy-store";
import { useTenancySession } from "@/lib/tenancy/use-tenancy-session";
import {
  ONBOARDING_STEPS,
  ONBOARDING_STEP_LABELS,
  OPTIONAL_ONBOARDING_STEPS,
  TENANT_ROLES,
  TENANT_ROLE_LABELS,
} from "@/lib/tenancy/types";
import type { OnboardingStep, Tenant, TenantRole } from "@/lib/tenancy/types";

/** Mirrors the slug helper inside settings-store so newly added options match. */
const slugify = (label: string): string =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

/** Roles that may be invited. Ownership is never handed out from a form (§3). */
const INVITABLE_ROLES: TenantRole[] = TENANT_ROLES.filter((r) => r !== "tenant_owner");

interface SentInvite {
  email: string;
  role: TenantRole;
  link: string;
}

const isOptional = (step: OnboardingStep): boolean => OPTIONAL_ONBOARDING_STEPS.includes(step);

export default function OnboardingPage() {
  const hasHydrated = useTenancyStore((s) => s._hasHydrated);
  const settingsHydrated = useSettingsStore((s) => s._hasHydrated);
  const session = useTenancySession();

  // Both stores must be hydrated before the wizard seeds its local state,
  // otherwise a resumed setup would start from step 1 with empty fields.
  if (!hasHydrated || !settingsHydrated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
          Loading your workspace…
        </div>
      </main>
    );
  }

  // Guard: onboarding is meaningless without an active tenant session (§24).
  if (!session?.tenant) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background p-6">
        <Card className="w-full max-w-md text-center shadow-lg">
          <CardHeader>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-blue">
              <PanelsTopLeft className="h-7 w-7 text-white" />
            </div>
            <CardTitle>No active workspace</CardTitle>
            <CardDescription>
              Setup is tied to a company workspace. Create a company account, or sign in to the
              workspace you were invited to.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button asChild className="w-full bg-brand-blue hover:bg-brand-blue-dark">
              <Link href="/register">Create a company account</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Sign in</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return <OnboardingWizard tenant={session.tenant} userEmail={session.user.email} />;
}

function OnboardingWizard({ tenant, userEmail }: { tenant: Tenant; userEmail: string }) {
  const router = useRouter();
  const completeOnboardingStep = useTenancyStore((s) => s.completeOnboardingStep);
  const inviteMember = useTenancyStore((s) => s.inviteMember);

  const [stepIndex, setStepIndex] = useState<number>(() => {
    const done = tenant.onboarding_completed_steps;
    const next = ONBOARDING_STEPS.findIndex((s) => !done.includes(s));
    return next === -1 ? ONBOARDING_STEPS.length - 1 : next;
  });
  const [finishing, setFinishing] = useState(false);

  // ── Settings store (tenant configuration) ──────────────────────
  const companyProfile = useSettingsStore((s) => s.company);
  const services = useSettingsStore((s) => s.services);
  const serviceAreas = useSettingsStore((s) => s.service_areas);
  const leadSources = useSettingsStore((s) => s.lead_sources);
  const manufacturers = useSettingsStore((s) => s.manufacturers);
  const productLines = useSettingsStore((s) => s.product_lines);
  const integrations = useSettingsStore((s) => s.integrations);
  const assignmentMode = useSettingsStore((s) => s.website_assignment_mode);
  const updateCompany = useSettingsStore((s) => s.updateCompany);
  const addService = useSettingsStore((s) => s.addService);
  const addServiceArea = useSettingsStore((s) => s.addServiceArea);
  const removeServiceArea = useSettingsStore((s) => s.removeServiceArea);
  const addLeadSource = useSettingsStore((s) => s.addLeadSource);
  const addManufacturer = useSettingsStore((s) => s.addManufacturer);
  const removeManufacturer = useSettingsStore((s) => s.removeManufacturer);
  const addProductLine = useSettingsStore((s) => s.addProductLine);
  const removeProductLine = useSettingsStore((s) => s.removeProductLine);
  const toggleIntegration = useSettingsStore((s) => s.toggleIntegration);
  const setField = useSettingsStore((s) => s.setField);

  // ── Local step state ───────────────────────────────────────────
  const [company, setCompany] = useState({
    name: companyProfile.name || tenant.name,
    phone: companyProfile.phone || tenant.phone || "",
    email: companyProfile.email || userEmail,
    website: companyProfile.website || tenant.website || "",
  });
  const [companyError, setCompanyError] = useState<string | null>(null);

  // Resuming a finished step restores the saved selection; a fresh run starts
  // from the four default services offered (§6).
  const [selectedServices, setSelectedServices] = useState<Set<string>>(() =>
    tenant.onboarding_completed_steps.includes("services")
      ? new Set<string>(services.filter((o) => o.enabled).map((o) => o.value))
      : new Set<string>(LEAD_SERVICE_OPTIONS)
  );
  const [newService, setNewService] = useState("");
  const [newArea, setNewArea] = useState("");
  const [newSource, setNewSource] = useState("");
  const [newManufacturer, setNewManufacturer] = useState("");
  const [newProductLine, setNewProductLine] = useState("");

  const [selectedSources, setSelectedSources] = useState<Set<string>>(
    () => new Set<string>(leadSources.filter((o) => o.enabled).map((o) => o.value))
  );

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<TenantRole>("sales_representative");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [sentInvites, setSentInvites] = useState<SentInvite[]>([]);

  const completed = tenant.onboarding_completed_steps;
  const step = ONBOARDING_STEPS[stepIndex];
  const progressPercent = Math.round((completed.length / ONBOARDING_STEPS.length) * 100);

  const goTo = (index: number) => {
    setStepIndex(Math.min(Math.max(index, 0), ONBOARDING_STEPS.length - 1));
  };

  /** Persist this step's data, mark it complete, and advance. */
  const completeAndAdvance = () => {
    if (step === "company_profile") {
      if (!company.name.trim()) {
        setCompanyError("Company name is required.");
        return;
      }
      updateCompany({
        name: company.name.trim(),
        phone: company.phone.trim(),
        email: company.email.trim(),
        website: company.website.trim(),
      });
    }

    if (step === "services") {
      const current = useSettingsStore.getState().services;
      setField(
        "services",
        current.map((o) => ({ ...o, enabled: selectedServices.has(o.value) }))
      );
    }

    if (step === "service_areas") {
      setField("service_areas", useSettingsStore.getState().service_areas);
      updateCompany({ service_area: useSettingsStore.getState().service_areas.join(", ") });
    }

    if (step === "lead_sources") {
      const current = useSettingsStore.getState().lead_sources;
      setField(
        "lead_sources",
        current.map((o) => ({ ...o, enabled: selectedSources.has(o.value) }))
      );
    }

    completeOnboardingStep(step);

    if (step === "review") {
      setFinishing(true);
      router.push("/app/dashboard");
      return;
    }
    goTo(stepIndex + 1);
  };

  const skipStep = () => goTo(stepIndex + 1);

  const toggleSetValue = (
    setState: React.Dispatch<React.SetStateAction<Set<string>>>,
    value: string
  ) => {
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

  const handleAddService = () => {
    const label = newService.trim();
    if (!label) return;
    addService(label);
    const value = slugify(label);
    if (value) setSelectedServices((prev) => new Set(prev).add(value));
    setNewService("");
  };

  const handleAddSource = () => {
    const label = newSource.trim();
    if (!label) return;
    addLeadSource(label);
    const value = slugify(label);
    if (value) setSelectedSources((prev) => new Set(prev).add(value));
    setNewSource("");
  };

  const handleInvite = () => {
    setInviteError(null);
    const email = inviteEmail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
      setInviteError("Enter a valid email address.");
      return;
    }
    const result = inviteMember(email, inviteRole);
    if (!result) {
      setInviteError("You do not have permission to invite team members.");
      return;
    }
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    setSentInvites((prev) => [
      { email, role: inviteRole, link: `${origin}/accept-invite/${result.token}` },
      ...prev,
    ]);
    setInviteEmail("");
  };

  const emailIntegration = integrations.find((i) => i.id === "email");
  const smsIntegration = integrations.find((i) => i.id === "twilio");
  const websiteIntegration = integrations.find((i) => i.id === "website_forms");

  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-blue">
              <PanelsTopLeft className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{APP.name}</p>
              <p className="text-xs text-muted-foreground">Setting up {tenant.name}</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/app/dashboard">Finish later</Link>
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-6 px-6 py-8 lg:grid-cols-[240px_1fr]">
        {/* Progress rail */}
        <aside className="space-y-4">
          <div>
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-semibold text-foreground">
                Step {stepIndex + 1} of {ONBOARDING_STEPS.length}
              </p>
              <span className="text-xs text-muted-foreground">{progressPercent}% complete</span>
            </div>
            <div
              className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full rounded-full bg-brand-blue transition-all"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          <ol className="space-y-1">
            {ONBOARDING_STEPS.map((s, index) => {
              const done = completed.includes(s);
              const current = index === stepIndex;
              return (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    className={[
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                      current
                        ? "bg-brand-blue-light font-medium text-brand-blue"
                        : "text-muted-foreground hover:bg-muted",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px]",
                        done
                          ? "border-brand-blue bg-brand-blue text-white"
                          : current
                            ? "border-brand-blue text-brand-blue"
                            : "border-border",
                      ].join(" ")}
                    >
                      {done ? <Check className="h-3 w-3" /> : index + 1}
                    </span>
                    <span className="truncate">{ONBOARDING_STEP_LABELS[s]}</span>
                    {isOptional(s) && !done && (
                      <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                        optional
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        {/* Step body */}
        <Card className="shadow-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <StepIcon step={step} />
              {ONBOARDING_STEP_LABELS[step]}
            </CardTitle>
            <CardDescription>{STEP_DESCRIPTIONS[step]}</CardDescription>
          </CardHeader>

          <CardContent className="space-y-6">
            {step === "company_profile" && (
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="company-name">Company Name</Label>
                  <Input
                    id="company-name"
                    value={company.name}
                    onChange={(e) => {
                      setCompany((p) => ({ ...p, name: e.target.value }));
                      setCompanyError(null);
                    }}
                  />
                  {companyError && <p className="text-xs text-red-600">{companyError}</p>}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="company-phone">Business Phone</Label>
                    <Input
                      id="company-phone"
                      type="tel"
                      value={company.phone}
                      onChange={(e) => setCompany((p) => ({ ...p, phone: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company-email">Business Email</Label>
                    <Input
                      id="company-email"
                      type="email"
                      value={company.email}
                      onChange={(e) => setCompany((p) => ({ ...p, email: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="company-website">Website</Label>
                  <Input
                    id="company-website"
                    placeholder="https://"
                    value={company.website}
                    onChange={(e) => setCompany((p) => ({ ...p, website: e.target.value }))}
                  />
                </div>
              </div>
            )}

            {step === "services" && (
              <div className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Window Replacement, Window Repair, Sliding Glass Door and Custom are selected by
                  default. Add anything else you offer.
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {services.map((option) => (
                    <li key={option.value}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-brand-blue">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input accent-brand-blue"
                          checked={selectedServices.has(option.value)}
                          onChange={() => toggleSetValue(setSelectedServices, option.value)}
                        />
                        <span className="truncate">{option.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <AddRow
                  id="add-service"
                  label="Add a service"
                  value={newService}
                  onChange={setNewService}
                  onAdd={handleAddService}
                  placeholder="e.g. Bay Window Installation"
                />
              </div>
            )}

            {step === "service_areas" && (
              <div className="space-y-4">
                <ChipList
                  items={serviceAreas}
                  onRemove={removeServiceArea}
                  emptyText="No service areas yet. Add the cities, counties or ZIP codes you cover."
                />
                <AddRow
                  id="add-area"
                  label="Add a service area"
                  value={newArea}
                  onChange={setNewArea}
                  onAdd={() => {
                    addServiceArea(newArea);
                    setNewArea("");
                  }}
                  placeholder="e.g. Tampa, FL"
                />
              </div>
            )}

            {step === "team" && (
              <div className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                  <div className="space-y-1.5">
                    <Label htmlFor="invite-email">Work email</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="teammate@yourcompany.com"
                      value={inviteEmail}
                      onChange={(e) => {
                        setInviteEmail(e.target.value);
                        setInviteError(null);
                      }}
                    />
                  </div>
                  <SelectField
                    label="Role"
                    value={inviteRole}
                    options={INVITABLE_ROLES.map((role) => ({
                      value: role,
                      label: TENANT_ROLE_LABELS[role],
                    }))}
                    onChange={(value) => setInviteRole(value as TenantRole)}
                  />
                </div>
                {inviteError && <p className="text-xs text-red-600">{inviteError}</p>}
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleInvite}
                  className="w-full sm:w-auto"
                >
                  <Plus className="h-4 w-4" />
                  Send invitation
                </Button>

                {sentInvites.length > 0 && (
                  <div className="space-y-2 rounded-lg border border-border p-3">
                    <p className="text-xs font-medium text-foreground">Invitations created</p>
                    {sentInvites.map((invite) => (
                      <div key={invite.link} className="space-y-1 border-t border-border pt-2">
                        <p className="text-sm">
                          {invite.email}{" "}
                          <span className="text-xs text-muted-foreground">
                            · {TENANT_ROLE_LABELS[invite.role]}
                          </span>
                        </p>
                        <p className="break-all rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                          {invite.link}
                        </p>
                      </div>
                    ))}
                    <p className="text-[11px] text-muted-foreground">
                      Sandbox: no email is sent. Copy the link above to accept an invitation. The
                      link is shown once — only its hash is stored.
                    </p>
                  </div>
                )}
              </div>
            )}

            {step === "lead_sources" && (
              <div className="space-y-4">
                <ul className="grid gap-2 sm:grid-cols-2">
                  {leadSources.map((option) => (
                    <li key={option.value}>
                      <label className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm hover:border-brand-blue">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-input accent-brand-blue"
                          checked={selectedSources.has(option.value)}
                          onChange={() => toggleSetValue(setSelectedSources, option.value)}
                        />
                        <span className="truncate">{option.label}</span>
                      </label>
                    </li>
                  ))}
                </ul>
                <AddRow
                  id="add-source"
                  label="Add a lead source"
                  value={newSource}
                  onChange={setNewSource}
                  onAdd={handleAddSource}
                  placeholder="e.g. Neighborhood Facebook Group"
                />
              </div>
            )}

            {step === "catalog" && (
              <div className="space-y-6">
                <div className="space-y-3">
                  <p className="text-sm font-medium text-foreground">Manufacturers</p>
                  <ChipList
                    items={manufacturers}
                    onRemove={removeManufacturer}
                    emptyText="No manufacturers added yet."
                  />
                  <AddRow
                    id="add-manufacturer"
                    label="Add a manufacturer"
                    value={newManufacturer}
                    onChange={setNewManufacturer}
                    onAdd={() => {
                      addManufacturer(newManufacturer);
                      setNewManufacturer("");
                    }}
                    placeholder="e.g. PGT"
                  />
                </div>
                <div className="space-y-3 border-t border-border pt-4">
                  <p className="text-sm font-medium text-foreground">Product lines</p>
                  <ChipList
                    items={productLines}
                    onRemove={removeProductLine}
                    emptyText="No product lines added yet."
                  />
                  <AddRow
                    id="add-product-line"
                    label="Add a product line"
                    value={newProductLine}
                    onChange={setNewProductLine}
                    onAdd={() => {
                      addProductLine(newProductLine);
                      setNewProductLine("");
                    }}
                    placeholder="e.g. WinGuard Impact"
                  />
                </div>
              </div>
            )}

            {step === "notifications" && (
              <div className="space-y-3">
                <ToggleRow
                  title="Email notifications"
                  description="Proposals, appointment confirmations and follow-up emails."
                  checked={Boolean(emailIntegration?.enabled)}
                  onToggle={() => toggleIntegration("email")}
                />
                <ToggleRow
                  title="SMS notifications"
                  description="Appointment reminders and follow-up text messages."
                  checked={Boolean(smsIntegration?.enabled)}
                  onToggle={() => toggleIntegration("twilio")}
                />
                <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
                  Sandbox mode blocks every outbound message. These preferences are saved but
                  nothing is sent until real credentials are configured.
                </p>
              </div>
            )}

            {step === "website_integration" && (
              <div className="space-y-4">
                <ToggleRow
                  title="Website lead forms"
                  description="Accept leads posted from your website contact and quote forms."
                  checked={Boolean(websiteIntegration?.enabled)}
                  onToggle={() => toggleIntegration("website_forms")}
                />
                <div className="rounded-lg border border-border p-3">
                  <p className="text-xs font-medium text-foreground">Intake endpoint</p>
                  <p className="mt-1 break-all rounded bg-muted px-2 py-1 text-[11px] text-muted-foreground">
                    POST /api/leads
                  </p>
                </div>
                <SelectField
                  label="Assign website leads to"
                  value={assignmentMode}
                  options={[
                    { value: "default_manager", label: "A default manager" },
                    { value: "round_robin", label: "Round robin across the team" },
                  ]}
                  onChange={(value) => {
                    const mode = value === "round_robin" ? "round_robin" : "default_manager";
                    setField("website_assignment_mode", mode);
                    setField("round_robin_enabled", mode === "round_robin");
                  }}
                />
              </div>
            )}

            {step === "review" && (
              <div className="space-y-4">
                <ReviewRow label="Company" value={company.name || tenant.name} />
                <ReviewRow
                  label="Services selected"
                  value={
                    services
                      .filter((o) => selectedServices.has(o.value))
                      .map((o) => o.label)
                      .join(", ") || "None yet"
                  }
                />
                <ReviewRow
                  label="Service areas"
                  value={serviceAreas.length > 0 ? serviceAreas.join(", ") : "None yet"}
                />
                <ReviewRow
                  label="Invitations sent"
                  value={sentInvites.length > 0 ? `${sentInvites.length}` : "0"}
                />
                <ReviewRow
                  label="Lead sources"
                  value={
                    leadSources
                      .filter((o) => selectedSources.has(o.value))
                      .map((o) => o.label)
                      .join(", ") || "None yet"
                  }
                />
                <ReviewRow
                  label="Catalog"
                  value={`${manufacturers.length} manufacturers · ${productLines.length} product lines`}
                />
                <ReviewRow
                  label="Skipped steps"
                  value={
                    ONBOARDING_STEPS.filter((s) => s !== "review" && !completed.includes(s))
                      .map((s) => ONBOARDING_STEP_LABELS[s])
                      .join(", ") || "None — everything is set up"
                  }
                />
                <p className="rounded-md bg-brand-blue-light px-3 py-2 text-xs text-brand-blue">
                  You can change any of this later in Settings. Skipped steps stay available and can
                  be finished at any time.
                </p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
              <Button
                type="button"
                variant="ghost"
                onClick={() => goTo(stepIndex - 1)}
                disabled={stepIndex === 0}
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>

              <div className="flex items-center gap-2">
                {isOptional(step) && (
                  <Button type="button" variant="outline" onClick={skipStep}>
                    Skip for now
                  </Button>
                )}
                <Button
                  type="button"
                  onClick={completeAndAdvance}
                  disabled={finishing}
                  className="bg-brand-blue hover:bg-brand-blue-dark"
                >
                  {step === "review" ? (
                    finishing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Finishing…
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4" />
                        Finish setup
                      </>
                    )
                  ) : (
                    <>
                      Save &amp; continue
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

const STEP_DESCRIPTIONS: Record<OnboardingStep, string> = {
  company_profile: "How your company appears on proposals, emails and customer-facing pages.",
  services: "Pick the work you sell. These become the options on every new lead.",
  service_areas: "The cities, counties or ZIP codes you cover.",
  team: "Invite the people who will use the CRM and set what each of them can do.",
  lead_sources: "Where your leads come from, so reporting can attribute them correctly.",
  catalog: "Manufacturers and product lines you quote from.",
  notifications: "Choose which notifications your team and customers receive.",
  website_integration: "Send leads from your website straight into the pipeline.",
  review: "Check everything over, then start using your workspace.",
};

function StepIcon({ step }: { step: OnboardingStep }) {
  const className = "h-5 w-5 text-brand-blue";
  switch (step) {
    case "company_profile":
      return <Building2 className={className} />;
    case "services":
      return <Wrench className={className} />;
    case "service_areas":
      return <MapPin className={className} />;
    case "team":
      return <Users className={className} />;
    case "lead_sources":
      return <ArrowRight className={className} />;
    case "catalog":
      return <Package className={className} />;
    case "notifications":
      return <Mail className={className} />;
    case "website_integration":
      return <Globe className={className} />;
    case "review":
      return <CheckCircle2 className={className} />;
    default:
      return <Check className={className} />;
  }
}

function AddRow({
  id,
  label,
  value,
  onChange,
  onAdd,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  onAdd: () => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onAdd();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </div>
    </div>
  );
}

function ChipList({
  items,
  onRemove,
  emptyText,
}: {
  items: string[];
  onRemove: (item: string) => void;
  emptyText: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li
          key={item}
          className="flex items-center gap-1 rounded-full bg-brand-blue-light px-3 py-1 text-xs text-brand-blue"
        >
          {item}
          <button
            type="button"
            onClick={() => onRemove(item)}
            aria-label={`Remove ${item}`}
            className="rounded-full p-0.5 hover:bg-white/60"
          >
            <X className="h-3 w-3" />
          </button>
        </li>
      ))}
    </ul>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onToggle,
}: {
  title: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3 hover:border-brand-blue">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-input accent-brand-blue"
        checked={checked}
        onChange={onToggle}
      />
      <span>
        <span className="block text-sm font-medium text-foreground">{title}</span>
        <span className="block text-xs text-muted-foreground">{description}</span>
      </span>
    </label>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-b border-border pb-3 last:border-0 sm:flex-row sm:items-baseline sm:gap-4">
      <span className="w-40 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
