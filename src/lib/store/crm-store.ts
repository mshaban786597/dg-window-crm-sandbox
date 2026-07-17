import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Lead,
  Customer,
  Quote,
  Job,
  Estimate,
  PurchaseOrder,
  Communication,
  Review,
  Invoice,
  Crew,
  Material,
  ScheduleEvent,
  Profile,
  QuoteLineItem,
  MarketingCampaign,
  InventoryLog,
} from "@/types/database";
import type {
  LeadFormData,
  QuoteFormData,
  CustomerFormData,
  EstimateFormData,
  PurchaseOrderFormData,
  JobFormData,
  CalendarEventFormData,
  CrewFormData,
  InventoryFormData,
  ReviewRequestFormData,
  MarketingCampaignFormData,
} from "./form-types";
import { createModuleActions } from "./crm-modules";
import {
  computeDashboardStats,
  getLeadSourceStats,
  getLeadsByCity,
  getServiceDemand,
  getOrdersByManufacturer,
  getPipelineByStage,
} from "./stats";
import {
  LEADS,
  CUSTOMERS,
  QUOTES,
  JOBS,
  ESTIMATES,
  PURCHASE_ORDERS,
  COMMUNICATIONS,
  REVIEWS,
  INVOICES,
  CREWS,
  MATERIALS,
  SCHEDULE_EVENTS,
  MARKETING_CAMPAIGNS,
  INVENTORY_LOGS,
  SANDBOX_USER,
  PROFILES,
} from "@/lib/data/mock-data";

// Persistence key for this isolated sandbox. Intentionally different from
// any prior CRM key so the sandbox never reads or writes another app's data.
const STORAGE_KEY = "dg-window-crm-sandbox-v1";

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function now(): string {
  return new Date().toISOString();
}

/** Window quote math: totals derive entirely from line items. No defaults. */
function calculateQuoteTotals(data: QuoteFormData) {
  const lineItems: QuoteLineItem[] = (data.line_items || []).map((li) => ({
    ...li,
    total: (li.quantity || 0) * (li.unit_price || 0),
  }));
  const subtotal = lineItems.reduce((s, i) => s + i.total, 0);
  const taxable = Math.max(0, subtotal - (data.discount || 0));
  const tax = taxable * ((data.tax_rate || 0) / 100);
  const total = taxable + tax;
  return { lineItems, subtotal, tax, total };
}

export interface ToastMessage {
  id: string;
  type: "success" | "error";
  message: string;
}

interface CRMState {
  _hasHydrated: boolean;
  leads: Lead[];
  customers: Customer[];
  quotes: Quote[];
  jobs: Job[];
  estimates: Estimate[];
  purchaseOrders: PurchaseOrder[];
  communications: Communication[];
  reviews: Review[];
  invoices: Invoice[];
  crews: Crew[];
  materials: Material[];
  scheduleEvents: ScheduleEvent[];
  marketingCampaigns: MarketingCampaign[];
  inventoryLogs: InventoryLog[];
  currentUser: Profile;
  toasts: ToastMessage[];

  setHasHydrated: (v: boolean) => void;
  showToast: (type: "success" | "error", message: string) => void;
  dismissToast: (id: string) => void;

  addLead: (data: LeadFormData) => Lead;
  updateLead: (id: string, data: Partial<Lead>, options?: { silent?: boolean }) => void;
  deleteLead: (id: string) => void;

  addQuote: (data: QuoteFormData) => Quote;
  updateQuote: (id: string, data: Partial<QuoteFormData> & { status?: Quote["status"] }) => void;
  deleteQuote: (id: string) => void;
  convertQuoteToJob: (quoteId: string) => Job | null;

  ensureCustomerFromLead: (leadId: string) => Customer;
  addCommunication: (comm: Omit<Communication, "id" | "created_at">) => void;

  addCustomer: (data: CustomerFormData) => Customer;
  updateCustomer: (id: string, data: Partial<CustomerFormData>) => void;
  deleteCustomer: (id: string) => void;
  convertLeadToCustomer: (leadId: string) => Customer;

  addEstimate: (data: EstimateFormData) => Estimate;
  updateEstimate: (id: string, data: Partial<EstimateFormData>) => void;
  deleteEstimate: (id: string) => void;
  createQuoteFromEstimate: (estimateId: string) => Quote | null;

  addPurchaseOrder: (data: PurchaseOrderFormData) => PurchaseOrder;
  updatePurchaseOrder: (id: string, data: Partial<PurchaseOrderFormData>) => void;
  deletePurchaseOrder: (id: string) => void;
  createPurchaseOrderFromQuote: (quoteId: string) => PurchaseOrder | null;

  addJob: (data: JobFormData) => Job;
  updateJob: (id: string, data: Partial<JobFormData> & { stage?: Job["stage"] }) => void;
  deleteJob: (id: string) => void;
  updateJobStage: (id: string, stage: Job["stage"]) => void;
  assignCrewToJob: (jobId: string, crewId: string) => void;

  addCalendarEvent: (data: CalendarEventFormData) => ScheduleEvent;
  updateCalendarEvent: (id: string, data: Partial<CalendarEventFormData>) => void;
  deleteCalendarEvent: (id: string) => void;

  addCrew: (data: CrewFormData) => Crew;
  updateCrew: (id: string, data: Partial<CrewFormData>) => void;
  deleteCrew: (id: string) => void;

  addMaterial: (data: InventoryFormData) => Material;
  updateMaterial: (id: string, data: Partial<InventoryFormData>) => void;
  deleteMaterial: (id: string) => void;
  adjustInventory: (
    materialId: string,
    change: number,
    action: InventoryLog["action"],
    jobId?: string,
    notes?: string
  ) => void;

  addReviewRequest: (data: ReviewRequestFormData) => Review;
  updateReviewRequest: (id: string, data: Partial<ReviewRequestFormData>) => void;
  deleteReviewRequest: (id: string) => void;
  createReviewFromJob: (jobId: string, method?: "sms" | "email" | "manual") => Review | null;

  addMarketingCampaign: (data: MarketingCampaignFormData) => MarketingCampaign;
  updateMarketingCampaign: (id: string, data: Partial<MarketingCampaignFormData>) => void;
  deleteMarketingCampaign: (id: string) => void;

  getDashboardStats: () => ReturnType<typeof computeDashboardStats>;
  getLeadSourceStats: () => ReturnType<typeof getLeadSourceStats>;
  getLeadsByCity: () => ReturnType<typeof getLeadsByCity>;
  getServiceDemand: () => ReturnType<typeof getServiceDemand>;
  getOrdersByManufacturer: () => ReturnType<typeof getOrdersByManufacturer>;
  getPipelineByStage: () => ReturnType<typeof getPipelineByStage>;
}

// Clean sandbox: every collection starts empty (see mock-data.ts).
const seedState = {
  leads: LEADS,
  customers: CUSTOMERS,
  quotes: QUOTES,
  jobs: JOBS,
  estimates: ESTIMATES,
  purchaseOrders: PURCHASE_ORDERS,
  communications: COMMUNICATIONS,
  reviews: REVIEWS,
  invoices: INVOICES,
  crews: CREWS,
  materials: MATERIALS,
  scheduleEvents: SCHEDULE_EVENTS,
  marketingCampaigns: MARKETING_CAMPAIGNS,
  inventoryLogs: INVENTORY_LOGS,
  currentUser: SANDBOX_USER,
};

export const useCRMStore = create<CRMState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,
      toasts: [],
      ...seedState,

      setHasHydrated: (v) => set({ _hasHydrated: v }),

      showToast: (type, message) => {
        const id = generateId("toast");
        set((s) => ({ toasts: [...s.toasts, { id, type, message }] }));
        setTimeout(() => get().dismissToast(id), 4000);
      },

      dismissToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      addLead: (data) => {
        const ts = now();
        const lead: Lead = {
          id: generateId("lead"),
          ...data,
          created_at: ts,
          updated_at: ts,
        };
        set((s) => ({ leads: [lead, ...s.leads] }));
        get().addCommunication({
          entity_type: "lead",
          entity_id: lead.id,
          type: "note",
          subject: "Lead created",
          body: `New lead added for ${lead.full_name}`,
          created_by: get().currentUser.full_name,
        });
        get().showToast("success", `Lead "${lead.full_name}" saved successfully`);
        return lead;
      },

      updateLead: (id, data, options) => {
        const ts = now();
        set((s) => ({
          leads: s.leads.map((l) =>
            l.id === id ? { ...l, ...data, updated_at: ts } : l
          ),
        }));
        if (!options?.silent) {
          get().showToast("success", "Lead updated successfully");
        }
      },

      deleteLead: (id) => {
        set((s) => ({
          leads: s.leads.filter((l) => l.id !== id),
          quotes: s.quotes.filter((q) => q.lead_id !== id),
        }));
        get().showToast("success", "Lead deleted");
      },

      ensureCustomerFromLead: (leadId) => {
        const lead = get().leads.find((l) => l.id === leadId);
        if (!lead) throw new Error("Lead not found");

        if (lead.customer_id) {
          const existing = get().customers.find((c) => c.id === lead.customer_id);
          if (existing) return existing;
        }

        const existingByPhone = get().customers.find((c) => c.phone === lead.phone);
        if (existingByPhone) {
          get().updateLead(leadId, { customer_id: existingByPhone.id }, { silent: true });
          return existingByPhone;
        }

        const ts = now();
        const customer: Customer = {
          id: generateId("cust"),
          full_name: lead.full_name,
          phone: lead.phone,
          email: lead.email,
          address: lead.address,
          city: lead.city,
          county: lead.county,
          zip_code: lead.zip_code,
          property_type: lead.property_type,
          lead_id: leadId,
          notes: lead.notes,
          review_status: "none",
          happy_customer: false,
          created_at: ts,
          updated_at: ts,
          total_revenue: 0,
        };

        get().showToast("success", `Customer "${customer.full_name}" created from lead`);

        set((s) => ({
          customers: [customer, ...s.customers],
          leads: s.leads.map((l) =>
            l.id === leadId ? { ...l, customer_id: customer.id, updated_at: ts } : l
          ),
        }));

        return customer;
      },

      addQuote: (data) => {
        const ts = now();
        let customerId = data.customer_id;
        let customerName = data.customer_name;

        if (data.lead_id && !customerId) {
          const customer = get().ensureCustomerFromLead(data.lead_id);
          customerId = customer.id;
          customerName = customer.full_name;
        }

        if (!customerId) {
          get().showToast("error", "Please select a customer or lead");
          throw new Error("Customer required");
        }

        const { lineItems, subtotal, tax, total } = calculateQuoteTotals(data);

        const quote: Quote = {
          id: generateId("quote"),
          estimate_id: data.estimate_id,
          lead_id: data.lead_id,
          customer_id: customerId,
          customer_name: customerName,
          property_address: data.property_address,
          service_type: data.service_type,
          status: data.status,
          scope_of_work: data.scope_of_work,
          line_items: lineItems,
          subtotal,
          discount: data.discount || 0,
          tax,
          deposit_amount: data.deposit_amount,
          total,
          optional_upgrades: data.optional_upgrades,
          financing_option: data.financing_option,
          production_lead_time: data.production_lead_time,
          installation_duration: data.installation_duration,
          warranty_notes: data.warranty_notes,
          expires_at: data.expires_at,
          customer_notes: data.customer_notes,
          internal_notes: data.internal_notes,
          sent_at: data.status === "sent" ? ts : undefined,
          created_at: ts,
          updated_at: ts,
        };

        set((s) => ({ quotes: [quote, ...s.quotes] }));

        if (data.lead_id) {
          get().updateLead(
            data.lead_id,
            { status: "proposal_sent", estimated_project_value: total },
            { silent: true }
          );
        }

        get().addCommunication({
          entity_type: "customer",
          entity_id: customerId,
          type: "quote",
          subject: "Quote created",
          body: `Quote #${quote.id.slice(-6)} for ${formatCurrency(total)} — ${data.status}`,
          created_by: get().currentUser.full_name,
        });

        get().showToast("success", `Quote saved — ${formatCurrency(total)}`);
        return quote;
      },

      updateQuote: (id, data) => {
        const ts = now();
        const existing = get().quotes.find((q) => q.id === id);
        if (!existing) return;

        const merged: QuoteFormData = {
          lead_id: data.lead_id ?? existing.lead_id,
          customer_id: data.customer_id ?? existing.customer_id,
          customer_name: data.customer_name ?? existing.customer_name,
          property_address: data.property_address ?? existing.property_address,
          service_type: data.service_type ?? existing.service_type,
          scope_of_work: data.scope_of_work ?? existing.scope_of_work,
          line_items: data.line_items ?? existing.line_items,
          discount: data.discount ?? existing.discount,
          tax_rate:
            data.tax_rate ??
            (((existing.tax / Math.max(existing.subtotal - existing.discount, 1)) * 100) || 0),
          deposit_amount: data.deposit_amount ?? existing.deposit_amount,
          optional_upgrades: data.optional_upgrades ?? existing.optional_upgrades,
          financing_option: data.financing_option ?? existing.financing_option,
          production_lead_time: data.production_lead_time ?? existing.production_lead_time,
          installation_duration: data.installation_duration ?? existing.installation_duration,
          warranty_notes: data.warranty_notes ?? existing.warranty_notes,
          expires_at: data.expires_at ?? existing.expires_at,
          status: data.status ?? existing.status,
          internal_notes: data.internal_notes ?? existing.internal_notes,
          customer_notes: data.customer_notes ?? existing.customer_notes,
        };

        const { lineItems, subtotal, tax, total } = calculateQuoteTotals(merged);

        set((s) => ({
          quotes: s.quotes.map((q) =>
            q.id === id
              ? {
                  ...q,
                  ...data,
                  line_items: lineItems,
                  subtotal,
                  tax,
                  total,
                  updated_at: ts,
                  sent_at: data.status === "sent" && !q.sent_at ? ts : q.sent_at,
                }
              : q
          ),
        }));

        if (data.status === "accepted" && existing.lead_id) {
          get().updateLead(existing.lead_id, { status: "won" }, { silent: true });
        }

        get().showToast("success", "Quote updated successfully");
      },

      deleteQuote: (id) => {
        set((s) => ({ quotes: s.quotes.filter((q) => q.id !== id) }));
        get().showToast("success", "Quote deleted");
      },

      convertQuoteToJob: (quoteId) => {
        const quote = get().quotes.find((q) => q.id === quoteId);
        if (!quote) {
          get().showToast("error", "Quote not found");
          return null;
        }

        if (quote.status !== "accepted") {
          get().updateQuote(quoteId, { status: "accepted" });
        }

        const customer = get().customers.find((c) => c.id === quote.customer_id);
        const lead = quote.lead_id ? get().leads.find((l) => l.id === quote.lead_id) : null;
        const ts = now();
        const units = quote.line_items
          .filter((li) => li.category === "window_unit" || li.opening_id)
          .reduce((s, li) => s + (li.quantity || 0), 0);

        const job: Job = {
          id: generateId("job"),
          quote_id: quoteId,
          estimate_id: quote.estimate_id,
          customer_id: quote.customer_id,
          customer_name: quote.customer_name,
          customer_phone: customer?.phone || lead?.phone || "",
          address: quote.property_address.split(",")[0]?.trim() || quote.property_address,
          city: lead?.city || customer?.city || "",
          service_type: quote.service_type,
          stage: "deposit_pending",
          priority: "medium",
          units_count: units || undefined,
          deposit_status: "pending",
          job_value: quote.total,
          created_at: ts,
          updated_at: ts,
        };

        set((s) => ({ jobs: [job, ...s.jobs] }));

        if (quote.lead_id) {
          get().updateLead(quote.lead_id, { status: "won" }, { silent: true });
        }

        get().addCommunication({
          entity_type: "job",
          entity_id: job.id,
          type: "job",
          subject: "Job created from quote",
          body: `Converted quote ${quote.id.slice(-6)} to job`,
          created_by: get().currentUser.full_name,
        });

        get().showToast("success", "Quote converted to job successfully");
        return job;
      },

      addCommunication: (comm) => {
        const entry: Communication = {
          ...comm,
          id: generateId("comm"),
          created_at: now(),
        };
        set((s) => ({ communications: [entry, ...s.communications] }));
      },

      getDashboardStats: () =>
        computeDashboardStats({
          leads: get().leads,
          customers: get().customers,
          quotes: get().quotes,
          jobs: get().jobs,
          estimates: get().estimates,
          purchaseOrders: get().purchaseOrders,
          invoices: get().invoices,
          reviews: get().reviews,
          crews: get().crews,
          materials: get().materials,
        }),

      getLeadSourceStats: () => getLeadSourceStats(get().leads),
      getLeadsByCity: () => getLeadsByCity(get().leads),
      getServiceDemand: () => getServiceDemand(get().leads),
      getOrdersByManufacturer: () => getOrdersByManufacturer(get().purchaseOrders),
      getPipelineByStage: () => getPipelineByStage(get().leads),

      ...createModuleActions(set, get as never),
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      // Fresh sandbox schema. Never import data from any prior storage key.
      migrate: (persisted) => persisted as CRMState,
      partialize: (state) => ({
        leads: state.leads,
        customers: state.customers,
        quotes: state.quotes,
        jobs: state.jobs,
        estimates: state.estimates,
        purchaseOrders: state.purchaseOrders,
        communications: state.communications,
        reviews: state.reviews,
        invoices: state.invoices,
        crews: state.crews,
        materials: state.materials,
        scheduleEvents: state.scheduleEvents,
        marketingCampaigns: state.marketingCampaigns,
        inventoryLogs: state.inventoryLogs,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHasHydrated(true);
      },
    }
  )
);

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function getLeadById(id: string): Lead | undefined {
  return useCRMStore.getState().leads.find((l) => l.id === id);
}

export function getCustomerById(id: string): Customer | undefined {
  return useCRMStore.getState().customers.find((c) => c.id === id);
}

export function getQuoteById(id: string): Quote | undefined {
  return useCRMStore.getState().quotes.find((q) => q.id === id);
}

export function getJobById(id: string): Job | undefined {
  return useCRMStore.getState().jobs.find((j) => j.id === id);
}

export function getCommunicationsForEntity(entityType: string, entityId: string) {
  return useCRMStore
    .getState()
    .communications.filter(
      (c) => c.entity_type === entityType && c.entity_id === entityId
    );
}

export { PROFILES };
