import type {
  Customer,
  Estimate,
  Job,
  ScheduleEvent,
  Crew,
  Material,
  Review,
  MarketingCampaign,
  InventoryLog,
  Quote,
  QuoteLineItem,
  PurchaseOrder,
  PurchaseOrderItem,
} from "@/types/database";
import type {
  CustomerFormData,
  EstimateFormData,
  JobFormData,
  CalendarEventFormData,
  CrewFormData,
  InventoryFormData,
  ReviewRequestFormData,
  MarketingCampaignFormData,
  QuoteFormData,
  PurchaseOrderFormData,
} from "./form-types";
import { SERVICE_LABELS, WINDOW_STYLE_LABELS } from "@/lib/domain";
import { getSettings } from "@/lib/settings/settings-store";

type SetState = (partial: object | ((s: object) => object)) => void;
type GetState = () => CRMModuleGetters;

export interface CRMModuleGetters {
  customers: Customer[];
  estimates: Estimate[];
  jobs: Job[];
  quotes: Quote[];
  purchaseOrders: PurchaseOrder[];
  crews: Crew[];
  materials: Material[];
  scheduleEvents: ScheduleEvent[];
  reviews: Review[];
  marketingCampaigns: MarketingCampaign[];
  inventoryLogs: InventoryLog[];
  leads: import("@/types/database").Lead[];
  currentUser: { full_name: string };
  showToast: (type: "success" | "error", msg: string) => void;
  addCommunication: (c: object) => void;
  updateLead: (id: string, data: object, opts?: { silent?: boolean }) => void;
  addQuote: (data: QuoteFormData) => Quote;
  updateQuote: (id: string, data: Partial<QuoteFormData> & { status?: Quote["status"] }) => void;
  ensureCustomerFromLead: (leadId: string) => Customer;
}

export function generateId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ts() {
  return new Date().toISOString();
}

function buildEventTimes(date?: string, time?: string, durationHours = 2) {
  const base = date ? new Date(date) : new Date();
  if (time) {
    const [h, m] = time.split(":").map(Number);
    base.setHours(h || 9, m || 0, 0, 0);
  } else if (date) {
    base.setHours(9, 0, 0, 0);
  }
  const end = new Date(base);
  end.setHours(end.getHours() + durationHours);
  return { start: base.toISOString(), end: end.toISOString() };
}

export function createCalendarFromEstimate(
  get: GetState,
  set: SetState,
  estimate: Estimate
) {
  const { start, end } = buildEventTimes(
    estimate.scheduled_date,
    estimate.scheduled_time,
    2
  );
  const event: ScheduleEvent = {
    id: generateId("evt"),
    title: `Measurement — ${estimate.customer_name}`,
    type: "measurement",
    start,
    end,
    customer_name: estimate.customer_name,
    address: estimate.property_address,
    city: estimate.city,
    crew_name: estimate.estimator_name,
    lead_id: estimate.lead_id,
    customer_id: estimate.customer_id,
    estimate_id: estimate.id,
    status: estimate.status,
    created_at: ts(),
    updated_at: ts(),
  };
  set((s: CRMModuleGetters) => ({
    scheduleEvents: [event, ...s.scheduleEvents],
  }));
}

export function createCalendarFromJob(get: GetState, set: SetState, job: Job) {
  const { start, end } = buildEventTimes(job.start_date, job.start_time, 8);
  const event: ScheduleEvent = {
    id: generateId("evt"),
    title: `Installation — ${job.customer_name}`,
    type: job.service_type === "window_repair" ? "repair" : "installation",
    start,
    end,
    customer_name: job.customer_name,
    address: job.address,
    city: job.city,
    crew_id: job.crew_id,
    crew_name: job.crew_name,
    customer_id: job.customer_id,
    job_id: job.id,
    status: job.stage,
    created_at: ts(),
    updated_at: ts(),
  };
  set((s: CRMModuleGetters) => ({
    scheduleEvents: [
      event,
      ...s.scheduleEvents.filter((e) => e.job_id !== job.id || !e.job_id),
    ],
  }));
}

export function recalcCustomerStats(get: GetState, set: SetState, customerId: string) {
  const jobs = get().jobs.filter((j) => j.customer_id === customerId);
  const revenue = jobs
    .filter((j) => ["completed", "paid", "invoice_sent", "review_requested", "closed"].includes(j.stage))
    .reduce((s, j) => s + j.job_value, 0);
  set((s: CRMModuleGetters) => ({
    customers: s.customers.map((c) =>
      c.id === customerId ? { ...c, total_revenue: revenue, updated_at: ts() } : c
    ),
  }));
}

export function recalcCrewStats(get: GetState, set: SetState, crewId: string) {
  const jobs = get().jobs;
  const active = jobs.filter(
    (j) =>
      j.crew_id === crewId &&
      !["completed", "paid", "closed", "review_requested"].includes(j.stage)
  ).length;
  const completed = jobs.filter(
    (j) => j.crew_id === crewId && ["completed", "paid", "closed"].includes(j.stage)
  ).length;
  set((s: CRMModuleGetters) => ({
    crews: s.crews.map((c) =>
      c.id === crewId ? { ...c, active_jobs: active, completed_jobs: completed } : c
    ),
  }));
}

/** Build a generic, settings-driven review message. No hardcoded brand/URL. */
export function buildReviewMessage(name: string, service: string): string {
  const settings = getSettings();
  const svcLabel = SERVICE_LABELS[service] || "window";
  const link = settings.review_link || "";
  return settings.review_message_template
    .replace(/\{\{name\}\}/g, name)
    .replace(/\{\{service\}\}/g, svcLabel)
    .replace(/\{\{link\}\}/g, link)
    .trim();
}

function persistReviewRequest(
  set: SetState,
  get: GetState,
  data: ReviewRequestFormData
): Review {
  const t = ts();
  const status = data.status || "sent";
  const reviewLink = getSettings().review_link || undefined;
  const review: Review = {
    id: generateId("rev"),
    customer_id: data.customer_id,
    customer_name: data.customer_name,
    job_id: data.job_id,
    status,
    rating: data.rating,
    platform: "google",
    request_method: data.request_method,
    review_link: reviewLink,
    service_type: data.service_type,
    phone: data.phone,
    email: data.email,
    message: buildReviewMessage(data.customer_name, data.service_type),
    requested_at: t,
    sent_at: status === "sent" ? t : undefined,
    received_at: status === "received" ? t : undefined,
    happy_customer: true,
    notes: data.notes,
    created_at: t,
    updated_at: t,
  };
  set((s: CRMModuleGetters) => ({ reviews: [review, ...s.reviews] }));
  if (data.job_id) {
    set((s: CRMModuleGetters) => ({
      jobs: s.jobs.map((j) =>
        j.id === data.job_id
          ? { ...j, review_request_status: "requested" as const, updated_at: t }
          : j
      ),
    }));
  }
  set((s: CRMModuleGetters) => ({
    customers: s.customers.map((c) =>
      c.id === data.customer_id
        ? { ...c, review_status: "requested" as const, updated_at: t }
        : c
    ),
  }));
  get().showToast("success", "Review request created");
  return review;
}

export function createModuleActions(set: SetState, get: GetState) {
  return {
    addCustomer: (data: CustomerFormData) => {
      const t = ts();
      const customer: Customer = {
        id: generateId("cust"),
        ...data,
        review_status: "none",
        happy_customer: false,
        created_at: t,
        updated_at: t,
        total_revenue: 0,
      };
      set((s: CRMModuleGetters) => ({ customers: [customer, ...s.customers] }));
      if (data.lead_id) {
        get().updateLead(data.lead_id, { customer_id: customer.id }, { silent: true });
      }
      get().showToast("success", `Customer "${customer.full_name}" saved`);
      return customer;
    },

    updateCustomer: (id: string, data: Partial<CustomerFormData>) => {
      const t = ts();
      set((s: CRMModuleGetters) => ({
        customers: s.customers.map((c) =>
          c.id === id ? { ...c, ...data, updated_at: t } : c
        ),
      }));
      get().showToast("success", "Customer updated");
    },

    deleteCustomer: (id: string) => {
      set((s: CRMModuleGetters) => ({
        customers: s.customers.filter((c) => c.id !== id),
      }));
      get().showToast("success", "Customer deleted");
    },

    convertLeadToCustomer: (leadId: string) => {
      return get().ensureCustomerFromLead(leadId);
    },

    addEstimate: (data: EstimateFormData) => {
      const t = ts();
      const estimate: Estimate = {
        id: generateId("est"),
        lead_id: data.lead_id,
        customer_id: data.customer_id,
        customer_name: data.customer_name,
        property_address: data.property_address,
        city: data.city,
        county: data.county,
        service_type: data.service_type,
        status: data.status,
        scheduled_date: data.scheduled_date,
        scheduled_time: data.scheduled_time,
        estimator_name: data.estimator_name,
        project_type: data.project_type,
        year_built: data.year_built,
        stories: data.stories,
        exterior_type: data.exterior_type,
        access_difficulty: data.access_difficulty,
        lead_safe_pre1978: data.lead_safe_pre1978,
        permit_required: data.permit_required,
        hoa_approval_required: data.hoa_approval_required,
        installation_method: data.installation_method,
        preferred_manufacturer: data.preferred_manufacturer,
        preferred_product_line: data.preferred_product_line,
        interior_trim_work: data.interior_trim_work,
        exterior_trim_capping: data.exterior_trim_capping,
        visible_damage: data.visible_damage,
        disposal_required: data.disposal_required,
        estimator_notes: data.estimator_notes,
        openings: data.openings || [],
        created_at: t,
        updated_at: t,
      };
      set((s: CRMModuleGetters) => ({ estimates: [estimate, ...s.estimates] }));
      if (data.lead_id) {
        get().updateLead(data.lead_id, { status: "measurement_scheduled" }, { silent: true });
      }
      if (data.status === "scheduled" && data.scheduled_date) {
        createCalendarFromEstimate(get, set, estimate);
      }
      get().showToast("success", "Measurement saved");
      return estimate;
    },

    updateEstimate: (id: string, data: Partial<EstimateFormData>) => {
      const t = ts();
      let updated: Estimate | undefined;
      set((s: CRMModuleGetters) => ({
        estimates: s.estimates.map((e) => {
          if (e.id !== id) return e;
          updated = { ...e, ...data, updated_at: t };
          return updated;
        }),
      }));
      if (updated && data.status === "scheduled") {
        createCalendarFromEstimate(get, set, updated);
      }
      get().showToast("success", "Measurement updated");
    },

    deleteEstimate: (id: string) => {
      set((s: CRMModuleGetters) => ({
        estimates: s.estimates.filter((e) => e.id !== id),
        scheduleEvents: s.scheduleEvents.filter((e) => e.estimate_id !== id),
      }));
      get().showToast("success", "Measurement deleted");
    },

    createQuoteFromEstimate: (estimateId: string) => {
      const est = get().estimates.find((e) => e.id === estimateId);
      if (!est) {
        get().showToast("error", "Measurement not found");
        return null;
      }
      // Build one line item per window opening. No fabricated pricing —
      // unit prices start at 0 and are set by the user in the quote builder.
      const lineItems: QuoteLineItem[] = (est.openings || []).map((o) => {
        const style = o.window_style ? WINDOW_STYLE_LABELS[o.window_style] || "Window" : "Window";
        const qty = o.quantity || 1;
        return {
          id: generateId("li"),
          description: `${style} — ${o.room_location || "Opening"}${o.opening_number ? ` (#${o.opening_number})` : ""}`,
          category: "window_unit",
          opening_id: o.id,
          quantity: qty,
          unit_price: 0,
          total: 0,
        };
      });
      const quote = get().addQuote({
        estimate_id: estimateId,
        lead_id: est.lead_id,
        customer_id: est.customer_id,
        customer_name: est.customer_name,
        property_address: est.property_address,
        service_type: est.service_type,
        scope_of_work: `Window project per measurement at ${est.property_address}. ${est.estimator_notes || ""}`.trim(),
        line_items: lineItems,
        discount: 0,
        tax_rate: getSettings().tax_rate,
        status: "draft",
        internal_notes: est.estimator_notes,
      });
      const t = ts();
      set((s: CRMModuleGetters) => ({
        estimates: s.estimates.map((e) =>
          e.id === estimateId ? { ...e, status: "converted_to_quote" as const, updated_at: t } : e
        ),
      }));
      return quote;
    },

    // ── Purchase orders (Window Orders) ──────────────────────────
    addPurchaseOrder: (data: PurchaseOrderFormData) => {
      const t = ts();
      const order: PurchaseOrder = {
        id: generateId("po"),
        ...data,
        items: data.items || [],
        created_at: t,
        updated_at: t,
      };
      set((s: CRMModuleGetters) => ({ purchaseOrders: [order, ...s.purchaseOrders] }));
      get().addCommunication({
        entity_type: "customer",
        entity_id: order.customer_id || "",
        type: "order",
        subject: "Window order created",
        body: `Purchase order ${order.po_number || order.id.slice(-6)} — ${order.status}`,
        created_by: get().currentUser.full_name,
      });
      get().showToast("success", "Window order saved");
      return order;
    },

    updatePurchaseOrder: (id: string, data: Partial<PurchaseOrderFormData>) => {
      const t = ts();
      set((s: CRMModuleGetters) => ({
        purchaseOrders: s.purchaseOrders.map((p) =>
          p.id === id ? { ...p, ...data, updated_at: t } : p
        ),
      }));
      get().showToast("success", "Window order updated");
    },

    deletePurchaseOrder: (id: string) => {
      set((s: CRMModuleGetters) => ({
        purchaseOrders: s.purchaseOrders.filter((p) => p.id !== id),
      }));
      get().showToast("success", "Window order deleted");
    },

    createPurchaseOrderFromQuote: (quoteId: string) => {
      const quote = get().quotes.find((q) => q.id === quoteId);
      if (!quote) {
        get().showToast("error", "Quote not found");
        return null;
      }
      const items: PurchaseOrderItem[] = quote.line_items
        .filter((li) => li.category === "window_unit" || li.opening_id)
        .map((li) => ({
          id: generateId("poi"),
          opening_ref: li.description,
          quantity: li.quantity || 1,
          received_quantity: 0,
          damaged: false,
        }));
      return (get() as unknown as { addPurchaseOrder: (d: PurchaseOrderFormData) => PurchaseOrder }).addPurchaseOrder({
        quote_id: quoteId,
        customer_id: quote.customer_id,
        customer_name: quote.customer_name,
        status: "draft",
        order_date: ts(),
        items,
      });
    },

    addJob: (data: JobFormData) => {
      const t = ts();
      const job: Job = {
        id: generateId("job"),
        quote_id: data.quote_id,
        estimate_id: data.estimate_id,
        purchase_order_id: data.purchase_order_id,
        customer_id: data.customer_id,
        customer_name: data.customer_name,
        customer_phone: data.customer_phone,
        address: data.address,
        city: data.city,
        county: data.county,
        service_type: data.service_type,
        stage: data.stage,
        crew_id: data.crew_id,
        crew_name: data.crew_name,
        start_date: data.start_date,
        start_time: data.start_time,
        end_time: data.end_time,
        estimated_install_days: data.estimated_install_days,
        priority: data.priority,
        units_count: data.units_count,
        permit_status: data.permit_status,
        inspection_status: data.inspection_status,
        material_delivery_status: data.material_delivery_status,
        deposit_status: data.deposit_status,
        final_walkthrough_status: data.final_walkthrough_status,
        materials: data.materials,
        internal_notes: data.internal_notes,
        customer_notes: data.customer_notes,
        completion_notes: data.completion_notes,
        job_value: data.job_value,
        invoice_status: "none",
        payment_status: "none",
        review_request_status: "not_requested",
        quality_check_status: "pending",
        created_at: t,
        updated_at: t,
      };
      set((s: CRMModuleGetters) => ({ jobs: [job, ...s.jobs] }));
      if (data.crew_id) recalcCrewStats(get, set, data.crew_id);
      if (data.start_date) createCalendarFromJob(get, set, job);
      recalcCustomerStats(get, set, data.customer_id);
      get().showToast("success", "Job created");
      return job;
    },

    updateJob: (id: string, data: Partial<JobFormData> & { stage?: Job["stage"] }) => {
      const t = ts();
      let updated: Job | undefined;
      set((s: CRMModuleGetters) => ({
        jobs: s.jobs.map((j) => {
          if (j.id !== id) return j;
          updated = { ...j, ...data, updated_at: t };
          return updated;
        }),
      }));
      if (updated) {
        if (updated.crew_id) recalcCrewStats(get, set, updated.crew_id);
        recalcCustomerStats(get, set, updated.customer_id);
        if (data.start_date || data.stage === "installation_scheduled") {
          createCalendarFromJob(get, set, updated);
        }
      }
      get().showToast("success", "Job updated");
    },

    deleteJob: (id: string) => {
      const job = get().jobs.find((j) => j.id === id);
      set((s: CRMModuleGetters) => ({
        jobs: s.jobs.filter((j) => j.id !== id),
        scheduleEvents: s.scheduleEvents.filter((e) => e.job_id !== id),
      }));
      if (job?.crew_id) recalcCrewStats(get, set, job.crew_id);
      get().showToast("success", "Job deleted");
    },

    updateJobStage: (id: string, stage: Job["stage"]) => {
      const t = ts();
      let updated: Job | undefined;
      set((s: CRMModuleGetters) => ({
        jobs: s.jobs.map((j) => {
          if (j.id !== id) return j;
          updated = {
            ...j,
            stage,
            updated_at: t,
            ...(stage === "completed"
              ? { review_request_status: "not_requested" as const }
              : {}),
          };
          return updated;
        }),
      }));
      if (updated) {
        if (updated.crew_id) recalcCrewStats(get, set, updated.crew_id);
        recalcCustomerStats(get, set, updated.customer_id);
      }
      get().showToast("success", "Job status updated");
    },

    assignCrewToJob: (jobId: string, crewId: string) => {
      const crew = get().crews.find((c) => c.id === crewId);
      const t = ts();
      let updated: Job | undefined;
      set((s: CRMModuleGetters) => ({
        jobs: s.jobs.map((j) => {
          if (j.id !== jobId) return j;
          updated = {
            ...j,
            crew_id: crewId,
            crew_name: crew?.name,
            stage: "crew_assigned",
            updated_at: t,
          };
          return updated;
        }),
      }));
      if (updated) {
        recalcCrewStats(get, set, crewId);
        if (updated.start_date) createCalendarFromJob(get, set, updated);
      }
      get().showToast("success", "Crew assigned to job");
    },

    addCalendarEvent: (data: CalendarEventFormData) => {
      const t = ts();
      const event: ScheduleEvent = {
        id: generateId("evt"),
        ...data,
        created_at: t,
        updated_at: t,
      };
      set((s: CRMModuleGetters) => ({
        scheduleEvents: [event, ...s.scheduleEvents],
      }));
      get().showToast("success", "Calendar event saved");
      return event;
    },

    updateCalendarEvent: (id: string, data: Partial<CalendarEventFormData>) => {
      const t = ts();
      set((s: CRMModuleGetters) => ({
        scheduleEvents: s.scheduleEvents.map((e) =>
          e.id === id ? { ...e, ...data, updated_at: t } : e
        ),
      }));
      get().showToast("success", "Event updated");
    },

    deleteCalendarEvent: (id: string) => {
      set((s: CRMModuleGetters) => ({
        scheduleEvents: s.scheduleEvents.filter((e) => e.id !== id),
      }));
      get().showToast("success", "Event deleted");
    },

    addCrew: (data: CrewFormData) => {
      const t = ts();
      const crew: Crew = {
        id: generateId("crew"),
        name: data.name,
        lead_name: data.lead_name,
        phone: data.phone,
        email: data.email,
        member_count: data.skills.length || 1,
        members: [],
        skills: data.skills,
        availability: data.availability,
        status: data.status,
        active_jobs: 0,
        completed_jobs: 0,
        notes: data.notes,
        created_at: t,
        updated_at: t,
      };
      set((s: CRMModuleGetters) => ({ crews: [crew, ...s.crews] }));
      get().showToast("success", "Crew saved");
      return crew;
    },

    updateCrew: (id: string, data: Partial<CrewFormData>) => {
      const t = ts();
      set((s: CRMModuleGetters) => ({
        crews: s.crews.map((c) =>
          c.id === id ? { ...c, ...data, updated_at: t } : c
        ),
      }));
      get().showToast("success", "Crew updated");
    },

    deleteCrew: (id: string) => {
      set((s: CRMModuleGetters) => ({
        crews: s.crews.filter((c) => c.id !== id),
      }));
      get().showToast("success", "Crew deleted");
    },

    addMaterial: (data: InventoryFormData) => {
      const t = ts();
      void t;
      const material: Material = {
        id: generateId("mat"),
        name: data.name,
        category: data.category,
        quantity: data.quantity,
        unit: data.unit,
        reorder_level: data.reorder_level,
        supplier: data.supplier,
        cost: data.cost,
        color_options: data.color_options ? data.color_options.split(",").map((s) => s.trim()) : undefined,
        notes: data.notes,
      };
      set((s: CRMModuleGetters) => ({ materials: [material, ...s.materials] }));
      get().showToast("success", "Inventory item saved");
      return material;
    },

    updateMaterial: (id: string, data: Partial<InventoryFormData>) => {
      set((s: CRMModuleGetters) => ({
        materials: s.materials.map((m) => {
          if (m.id !== id) return m;
          return {
            ...m,
            ...data,
            color_options:
              data.color_options !== undefined
                ? data.color_options.split(",").map((s) => s.trim())
                : m.color_options,
          };
        }),
      }));
      get().showToast("success", "Inventory updated");
    },

    deleteMaterial: (id: string) => {
      set((s: CRMModuleGetters) => ({
        materials: s.materials.filter((m) => m.id !== id),
      }));
      get().showToast("success", "Item deleted");
    },

    adjustInventory: (
      materialId: string,
      change: number,
      action: InventoryLog["action"],
      jobId?: string,
      notes?: string
    ) => {
      const mat = get().materials.find((m) => m.id === materialId);
      if (!mat) return;
      const log: InventoryLog = {
        id: generateId("invlog"),
        material_id: materialId,
        item_name: mat.name,
        action,
        quantity_changed: change,
        job_id: jobId,
        notes,
        created_at: ts(),
      };
      set((s: CRMModuleGetters) => ({
        materials: s.materials.map((m) =>
          m.id === materialId
            ? { ...m, quantity: Math.max(0, m.quantity + change) }
            : m
        ),
        inventoryLogs: [log, ...s.inventoryLogs],
      }));
      get().showToast("success", `Inventory ${change > 0 ? "added" : "removed"}`);
    },

    addReviewRequest: (data: ReviewRequestFormData) => persistReviewRequest(set, get, data),

    updateReviewRequest: (id: string, data: Partial<ReviewRequestFormData>) => {
      const t = ts();
      set((s: CRMModuleGetters) => ({
        reviews: s.reviews.map((r) =>
          r.id === id
            ? {
                ...r,
                ...data,
                received_at: data.status === "received" ? t : r.received_at,
                updated_at: t,
              }
            : r
        ),
      }));
      get().showToast("success", "Review updated");
    },

    deleteReviewRequest: (id: string) => {
      set((s: CRMModuleGetters) => ({
        reviews: s.reviews.filter((r) => r.id !== id),
      }));
      get().showToast("success", "Review deleted");
    },

    createReviewFromJob: (jobId: string, method: "sms" | "email" | "manual" = "manual") => {
      const job = get().jobs.find((j) => j.id === jobId);
      if (!job) {
        get().showToast("error", "Job not found");
        return null;
      }
      if (!["completed", "paid", "invoice_sent", "quality_check", "review_requested", "closed"].includes(job.stage)) {
        get().showToast("error", "Job must be completed first");
        return null;
      }
      const customer = get().customers.find((c) => c.id === job.customer_id);
      return persistReviewRequest(set, get, {
        customer_id: job.customer_id,
        job_id: jobId,
        customer_name: job.customer_name,
        phone: job.customer_phone,
        email: customer?.email,
        service_type: job.service_type,
        request_method: method,
        status: "sent",
      });
    },

    addMarketingCampaign: (data: MarketingCampaignFormData) => {
      const t = ts();
      const campaign: MarketingCampaign = {
        id: generateId("camp"),
        name: data.name,
        source: data.source,
        city: data.city,
        county: data.county,
        service_type: data.service_type,
        spend: data.spend,
        leads_generated: data.leads_generated,
        qualified_leads: data.qualified_leads,
        measurements_booked: data.measurements_booked,
        proposals_issued: data.proposals_issued,
        jobs_won: data.jobs_won,
        estimated_revenue: data.estimated_revenue,
        sold_revenue: data.sold_revenue,
        collected_revenue: data.collected_revenue,
        cost: data.spend,
        actual_revenue: data.sold_revenue,
        notes: data.notes,
        created_at: t,
        updated_at: t,
      };
      set((s: CRMModuleGetters) => ({
        marketingCampaigns: [campaign, ...(s.marketingCampaigns || [])],
      }));
      get().showToast("success", "Campaign saved");
      return campaign;
    },

    updateMarketingCampaign: (id: string, data: Partial<MarketingCampaignFormData>) => {
      const t = ts();
      set((s: CRMModuleGetters) => ({
        marketingCampaigns: (s.marketingCampaigns || []).map((c) =>
          c.id === id
            ? {
                ...c,
                ...data,
                cost: data.spend ?? c.cost,
                actual_revenue: data.sold_revenue ?? c.actual_revenue,
                updated_at: t,
              }
            : c
        ),
      }));
      get().showToast("success", "Campaign updated");
    },

    deleteMarketingCampaign: (id: string) => {
      set((s: CRMModuleGetters) => ({
        marketingCampaigns: (s.marketingCampaigns || []).filter((c) => c.id !== id),
      }));
      get().showToast("success", "Campaign deleted");
    },
  };
}
