"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_COMPANY,
  SERVICES,
  SERVICE_LABELS,
  LEAD_STAGES,
  LEAD_STAGE_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  USER_ROLES,
  ROLE_LABELS,
  AUTOMATION_TEMPLATES,
} from "@/lib/domain";

export interface EditableOption {
  value: string;
  label: string;
  enabled: boolean;
}

export interface IntegrationConfig {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface AutomationConfig {
  id: string;
  name: string;
  trigger: string;
  delay: string;
  action: string;
  enabled: boolean;
}

export interface CompanyProfile {
  name: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
  service_area: string;
}

export interface CompanySettings {
  company: CompanyProfile;
  service_areas: string[];
  services: EditableOption[];
  lead_stages: EditableOption[];
  lead_sources: EditableOption[];
  user_roles: EditableOption[];
  manufacturers: string[];
  product_lines: string[];
  tax_rate: number;
  currency: string;
  timezone: string;
  review_link: string;
  review_message_template: string;
  proposal_validity_days: number;
  default_deposit_percent: number;
  integrations: IntegrationConfig[];
  automations: AutomationConfig[];
  // §10 appointment confirmation expiry
  confirmation_expiry_days: number;
  // §12 website lead auto-assignment
  website_assignment_mode: "default_manager" | "round_robin";
  default_website_manager_id: string;
  round_robin_enabled: boolean;
  round_robin_cursor: number;
  // §20 cost visibility for managers
  manager_cost_visible: boolean;
}

const toOptions = (
  values: readonly string[],
  labels: Record<string, string>
): EditableOption[] =>
  values.map((value) => ({ value, label: labels[value] ?? value, enabled: true }));

// Default generic review message. {{name}} and {{service}} are substituted
// at send-time. {{link}} pulls from settings.review_link.
export const DEFAULT_REVIEW_TEMPLATE =
  "Hi {{name}}, thank you for choosing us for your {{service}} project. " +
  "If you were happy with our work, would you mind leaving us a quick review? " +
  "It really helps other homeowners find us. {{link}}";

const DEFAULT_INTEGRATIONS: IntegrationConfig[] = [
  { id: "twilio", name: "Twilio SMS", description: "Send appointment and follow-up text messages.", enabled: false },
  { id: "email", name: "Email (Resend / Gmail)", description: "Send proposals and follow-up emails.", enabled: false },
  { id: "google_business", name: "Google Business Profile", description: "Sync reviews and business info.", enabled: false },
  { id: "website_forms", name: "Website Lead Forms", description: "Receive leads from your website.", enabled: false },
  { id: "accounting", name: "Accounting", description: "Sync invoices and payments.", enabled: false },
  { id: "payments", name: "Payments", description: "Collect deposits and balances online.", enabled: false },
];

const DEFAULT_AUTOMATIONS: AutomationConfig[] = AUTOMATION_TEMPLATES.map((t) => ({
  ...t,
  enabled: false,
}));

export function defaultSettings(): CompanySettings {
  return {
    company: {
      name: DEFAULT_COMPANY.name,
      phone: DEFAULT_COMPANY.phone,
      email: DEFAULT_COMPANY.email,
      website: DEFAULT_COMPANY.website,
      logo_url: DEFAULT_COMPANY.logo_url,
      service_area: DEFAULT_COMPANY.service_area,
    },
    service_areas: [],
    services: toOptions(SERVICES, SERVICE_LABELS),
    lead_stages: toOptions(LEAD_STAGES, LEAD_STAGE_LABELS),
    lead_sources: toOptions(LEAD_SOURCES, LEAD_SOURCE_LABELS),
    user_roles: toOptions(USER_ROLES, ROLE_LABELS),
    manufacturers: [],
    product_lines: [],
    tax_rate: DEFAULT_COMPANY.default_tax_rate,
    currency: DEFAULT_COMPANY.currency,
    timezone: DEFAULT_COMPANY.timezone,
    review_link: DEFAULT_COMPANY.review_link,
    review_message_template: DEFAULT_REVIEW_TEMPLATE,
    proposal_validity_days: DEFAULT_COMPANY.proposal_validity_days,
    default_deposit_percent: DEFAULT_COMPANY.default_deposit_percent,
    integrations: DEFAULT_INTEGRATIONS,
    automations: DEFAULT_AUTOMATIONS,
    confirmation_expiry_days: 14,
    website_assignment_mode: "default_manager",
    default_website_manager_id: "",
    round_robin_enabled: false,
    round_robin_cursor: 0,
    manager_cost_visible: false,
  };
}

interface SettingsState extends CompanySettings {
  _hasHydrated: boolean;
  setHasHydrated: (v: boolean) => void;
  updateCompany: (patch: Partial<CompanyProfile>) => void;
  setField: <K extends keyof CompanySettings>(key: K, value: CompanySettings[K]) => void;
  addService: (label: string) => void;
  removeService: (value: string) => void;
  toggleService: (value: string) => void;
  addServiceArea: (name: string) => void;
  removeServiceArea: (name: string) => void;
  addManufacturer: (name: string) => void;
  removeManufacturer: (name: string) => void;
  addProductLine: (name: string) => void;
  removeProductLine: (name: string) => void;
  addLeadSource: (label: string) => void;
  removeLeadSource: (value: string) => void;
  toggleIntegration: (id: string) => void;
  toggleAutomation: (id: string) => void;
  resetSettings: () => void;
}

const slug = (label: string) =>
  label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...defaultSettings(),
      _hasHydrated: false,
      setHasHydrated: (v) => set({ _hasHydrated: v }),

      updateCompany: (patch) =>
        set((s) => ({ company: { ...s.company, ...patch } })),

      setField: (key, value) => set({ [key]: value } as Partial<SettingsState>),

      addService: (label) =>
        set((s) => {
          const value = slug(label);
          if (!value || s.services.some((o) => o.value === value)) return s;
          return { services: [...s.services, { value, label: label.trim(), enabled: true }] };
        }),
      removeService: (value) =>
        set((s) => ({ services: s.services.filter((o) => o.value !== value) })),
      toggleService: (value) =>
        set((s) => ({
          services: s.services.map((o) =>
            o.value === value ? { ...o, enabled: !o.enabled } : o
          ),
        })),

      addServiceArea: (name) =>
        set((s) =>
          !name.trim() || s.service_areas.includes(name.trim())
            ? s
            : { service_areas: [...s.service_areas, name.trim()] }
        ),
      removeServiceArea: (name) =>
        set((s) => ({ service_areas: s.service_areas.filter((n) => n !== name) })),

      addManufacturer: (name) =>
        set((s) =>
          !name.trim() || s.manufacturers.includes(name.trim())
            ? s
            : { manufacturers: [...s.manufacturers, name.trim()] }
        ),
      removeManufacturer: (name) =>
        set((s) => ({ manufacturers: s.manufacturers.filter((n) => n !== name) })),

      addProductLine: (name) =>
        set((s) =>
          !name.trim() || s.product_lines.includes(name.trim())
            ? s
            : { product_lines: [...s.product_lines, name.trim()] }
        ),
      removeProductLine: (name) =>
        set((s) => ({ product_lines: s.product_lines.filter((n) => n !== name) })),

      addLeadSource: (label) =>
        set((s) => {
          const value = slug(label);
          if (!value || s.lead_sources.some((o) => o.value === value)) return s;
          return { lead_sources: [...s.lead_sources, { value, label: label.trim(), enabled: true }] };
        }),
      removeLeadSource: (value) =>
        set((s) => ({ lead_sources: s.lead_sources.filter((o) => o.value !== value) })),

      toggleIntegration: (id) =>
        set((s) => ({
          integrations: s.integrations.map((i) =>
            i.id === id ? { ...i, enabled: !i.enabled } : i
          ),
        })),
      toggleAutomation: (id) =>
        set((s) => ({
          automations: s.automations.map((a) =>
            a.id === id ? { ...a, enabled: !a.enabled } : a
          ),
        })),

      resetSettings: () => set({ ...defaultSettings() }),
    }),
    {
      name: "dg-window-crm-sandbox-settings-v1",
      version: 1,
      onRehydrateStorage: () => (state) => state?.setHasHydrated(true),
      partialize: (state): CompanySettings => ({
        company: state.company,
        service_areas: state.service_areas,
        services: state.services,
        lead_stages: state.lead_stages,
        lead_sources: state.lead_sources,
        user_roles: state.user_roles,
        manufacturers: state.manufacturers,
        product_lines: state.product_lines,
        tax_rate: state.tax_rate,
        currency: state.currency,
        timezone: state.timezone,
        review_link: state.review_link,
        review_message_template: state.review_message_template,
        proposal_validity_days: state.proposal_validity_days,
        default_deposit_percent: state.default_deposit_percent,
        integrations: state.integrations,
        automations: state.automations,
        confirmation_expiry_days: state.confirmation_expiry_days,
        website_assignment_mode: state.website_assignment_mode,
        default_website_manager_id: state.default_website_manager_id,
        round_robin_enabled: state.round_robin_enabled,
        round_robin_cursor: state.round_robin_cursor,
        manager_cost_visible: state.manager_cost_visible,
      }),
    }
  )
);

/** Non-hook accessor for the current settings snapshot. */
export function getSettings(): CompanySettings {
  return useSettingsStore.getState();
}

/** Format a number as currency using the configured currency code. */
export function formatMoney(amount: number, currency?: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || getSettings().currency || "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount || 0);
}
