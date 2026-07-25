/**
 * Extended CRM state for the §3–§30 feature build: team management, repeatable
 * lead contacts, notifications + appointment confirmations, activity logging,
 * inventory catalog hierarchy, and inventory-based quote snapshots.
 *
 * Wired into the main persisted store (crm-store.ts). All money is integer cents.
 */
import type {
  Lead,
  LeadContact,
  TeamMember,
  NotificationRecord,
  AppointmentConfirmation,
  LeadActivity,
  LeadActivityType,
  CatalogSeries,
  CatalogWindowType,
  CatalogUniversalRange,
  CatalogItem,
  Quote,
  QuoteItem,
  QuoteItemAttributeSelection,
} from "@/types/database";
import {
  DEFAULT_CATALOG_SERIES,
  DEFAULT_CONFIRMATION_EXPIRY_DAYS,
  canTransitionQuote,
} from "@/lib/domain";
import { sumCents } from "@/lib/money";
import { generateToken, hashToken } from "@/lib/tokens";
import { buildAssignmentEmail } from "@/lib/email/templates";
import { sendEmail } from "@/lib/email/service";
import { getSettings, useSettingsStore } from "@/lib/settings/settings-store";
import { activeManagers } from "@/lib/permissions";

type SetState = (partial: object | ((s: ExtendedGetters) => object)) => void;

export interface ExtendedGetters {
  leads: Lead[];
  teamMembers: TeamMember[];
  notifications: NotificationRecord[];
  appointmentConfirmations: AppointmentConfirmation[];
  leadActivities: LeadActivity[];
  catalogSeries: CatalogSeries[];
  catalogWindowTypes: CatalogWindowType[];
  catalogUniversalRanges: CatalogUniversalRange[];
  catalogItems: CatalogItem[];
  quotes: Quote[];
  currentTeamMemberId: string;
  currentUser: { full_name: string };
  showToast: (t: "success" | "error", m: string) => void;
  updateLead: (id: string, data: Partial<Lead>, opts?: { silent?: boolean }) => void;
  addLead: (data: import("./form-types").LeadFormData) => Lead;
}

const gid = (p: string) => `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const now = () => new Date().toISOString();

// ── Seeds ────────────────────────────────────────────────────────
export const SANDBOX_ADMIN_MEMBER: TeamMember = {
  id: "tm-admin",
  first_name: "Sandbox",
  last_name: "Admin",
  email: "admin@windowcrm.local",
  role: "administrator",
  active: true,
  notification_preferences: { email_assignment: true, email_confirmation: true },
  created_at: "2024-01-01T00:00:00Z",
};

// Default editable Series so the catalog is not empty (§18). No items/costs seeded.
const seedSeries: CatalogSeries[] = DEFAULT_CATALOG_SERIES.map((s, i) => ({
  id: `series-${s.name}`,
  name: s.name,
  description: s.description,
  active: true,
  sort_order: i,
  created_at: "2024-01-01T00:00:00Z",
}));

export const extendedSeed = {
  teamMembers: [SANDBOX_ADMIN_MEMBER] as TeamMember[],
  currentTeamMemberId: SANDBOX_ADMIN_MEMBER.id,
  notifications: [] as NotificationRecord[],
  appointmentConfirmations: [] as AppointmentConfirmation[],
  leadActivities: [] as LeadActivity[],
  catalogSeries: seedSeries,
  catalogWindowTypes: [] as CatalogWindowType[],
  catalogUniversalRanges: [] as CatalogUniversalRange[],
  catalogItems: [] as CatalogItem[],
};

// ── Migration v2 → v3: single contact → contacts[] and county → state ──
export function migrateLeadToContacts(lead: Lead): Lead {
  if (lead.contacts && lead.contacts.length > 0) return lead;
  const [first, ...rest] = (lead.full_name || "").trim().split(/\s+/);
  const contact: LeadContact = {
    id: gid("contact"),
    lead_id: lead.id,
    first_name: first || lead.full_name || "Contact",
    last_name: rest.join(" ") || "",
    phone: lead.phone || "",
    email: lead.email,
    is_primary: true,
    created_at: lead.created_at || now(),
  };
  return {
    ...lead,
    contacts: [contact],
    primary_contact_id: contact.id,
    state: lead.state || lead.county || "",
  };
}

// ── Helpers exported for reuse (website intake, tests) ───────────
export function primaryContact(lead: Lead): LeadContact | undefined {
  return lead.contacts?.find((c) => c.id === lead.primary_contact_id) || lead.contacts?.[0];
}

export function leadDisplayName(lead: Lead): string {
  const c = primaryContact(lead);
  return c ? `${c.first_name} ${c.last_name}`.trim() : lead.full_name || "Unnamed Lead";
}

export function leadMatchesQuery(lead: Lead, q: string): boolean {
  const needle = q.toLowerCase().trim();
  if (!needle) return true;
  const fields = [
    lead.full_name,
    lead.address,
    lead.city,
    lead.state,
    lead.zip_code,
    ...(lead.contacts || []).flatMap((c) => [c.first_name, c.last_name, `${c.first_name} ${c.last_name}`, c.phone, c.email]),
  ];
  return fields.some((f) => (f || "").toLowerCase().includes(needle));
}

function quoteTotals(items: QuoteItem[]) {
  const subtotal_cents = sumCents(items.map((i) => i.line_total_cents));
  return { subtotal_cents, total_cents: subtotal_cents };
}

// ── Actions ──────────────────────────────────────────────────────
export function createExtendedActions(set: SetState, get: () => ExtendedGetters) {
  const addActivity = (
    lead_id: string,
    type: LeadActivityType,
    description: string,
    related_id?: string,
    metadata?: LeadActivity["metadata"]
  ) => {
    const entry: LeadActivity = {
      id: gid("act"),
      lead_id,
      type,
      actor: get().currentUser.full_name || "System",
      description,
      related_id,
      metadata,
      created_at: now(),
    };
    set((s) => ({ leadActivities: [entry, ...s.leadActivities] }));
  };

  const actingUser = () => get().teamMembers.find((m) => m.id === get().currentTeamMemberId);

  return {
    // expose helpers as store methods
    addLeadActivity: addActivity,
    getActingUser: actingUser,
    setActingUser: (id: string) => set({ currentTeamMemberId: id }),

    // ── Team management (§7) ─────────────────────────────────────
    addTeamMember: (data: Omit<TeamMember, "id" | "created_at">) => {
      const member: TeamMember = { ...data, id: gid("tm"), created_at: now(), updated_at: now() };
      set((s) => ({ teamMembers: [member, ...s.teamMembers] }));
      get().showToast("success", "Team member added");
      return member;
    },
    updateTeamMember: (id: string, data: Partial<TeamMember>) => {
      set((s) => ({
        teamMembers: s.teamMembers.map((m) => (m.id === id ? { ...m, ...data, updated_at: now() } : m)),
      }));
      get().showToast("success", "Team member updated");
    },
    deactivateTeamMember: (id: string) => {
      set((s) => ({
        teamMembers: s.teamMembers.map((m) => (m.id === id ? { ...m, active: false, updated_at: now() } : m)),
      }));
      get().showToast("success", "Team member deactivated");
    },

    // ── Assignment notifications + confirmations (§8, §9, §10) ────
    async notifyLeadAssignment(leadId: string, opts?: { retry?: boolean }) {
      const state = get();
      const lead = state.leads.find((l) => l.id === leadId);
      if (!lead || !lead.assigned_estimator_id) return { sent: 0, failed: 0 };
      const rep = state.teamMembers.find((m) => m.id === lead.assigned_estimator_id);
      const recipients: { member: TeamMember; kind: NotificationRecord["kind"] }[] = [];
      if (rep) recipients.push({ member: rep, kind: "lead_assignment" });
      if (rep?.manager_id) {
        const mgr = state.teamMembers.find((m) => m.id === rep.manager_id);
        if (mgr) recipients.push({ member: mgr, kind: "manager_assignment" });
      }

      const settings = getSettings();
      const base = process.env.NEXT_PUBLIC_APP_URL || "";
      let sent = 0;
      let failed = 0;

      for (const { member, kind } of recipients) {
        const dedupe_key = `assign:${leadId}:${member.id}`;
        const existing = get().notifications.find(
          (n) => n.dedupe_key === dedupe_key && (n.status === "sent" || n.status === "sandbox")
        );
        if (existing && !opts?.retry) continue; // §8 no duplicate on retry

        // Confirmation token (§10) — store only the hash.
        const token = generateToken();
        const token_hash = await hashToken(token);
        const confirmationId = gid("conf");
        const expires = new Date();
        expires.setDate(expires.getDate() + (settings.confirmation_expiry_days || DEFAULT_CONFIRMATION_EXPIRY_DAYS));
        const confirmation: AppointmentConfirmation = {
          id: confirmationId,
          notification_id: "",
          lead_id: leadId,
          recipient_user_id: member.id,
          recipient_role: member.role,
          token_hash,
          status: "pending",
          expires_at: expires.toISOString(),
          created_at: now(),
        };

        const { subject, html } = buildAssignmentEmail({
          lead,
          recipientName: `${member.first_name} ${member.last_name}`.trim(),
          leadUrl: `${base}/leads/${leadId}`,
          confirmUrl: `${base}/confirm/${token}`,
          timezone: settings.timezone,
          currency: settings.currency,
          sandbox: true,
        });

        const notifId = gid("notif");
        confirmation.notification_id = notifId;
        addActivity(leadId, "assignment_email_generated", `Assignment email generated for ${member.first_name} ${member.last_name}`, notifId);

        const result = await sendEmail({ to: member.email, subject, html });
        const record: NotificationRecord = {
          id: notifId,
          kind,
          lead_id: leadId,
          recipient_user_id: member.id,
          recipient_role: member.role,
          to_email: member.email,
          subject,
          body_html: html,
          status: result.status === "sent" ? "sent" : result.status === "failed" ? "failed" : "sandbox",
          error: result.error,
          dedupe_key,
          confirmation_id: confirmationId,
          created_at: now(),
          sent_at: result.status !== "failed" ? now() : undefined,
        };

        // Replace (not append) any prior notification/confirmation for this
        // (lead, recipient) so a retry is idempotent — no duplicate outbox
        // entries and no stale pending confirmations (§8/§10).
        set((s) => ({
          notifications: [record, ...s.notifications.filter((n) => n.dedupe_key !== dedupe_key)],
          appointmentConfirmations: [
            confirmation,
            ...s.appointmentConfirmations.filter(
              (c) => !(c.lead_id === leadId && c.recipient_user_id === member.id)
            ),
          ],
        }));

        if (record.status === "failed") {
          failed++;
          addActivity(leadId, "assignment_email_failed", `Assignment email FAILED for ${member.email}: ${result.error || "unknown"}`, notifId);
        } else {
          sent++;
          addActivity(leadId, "assignment_email_sent", `Assignment email ${record.status === "sandbox" ? "generated (sandbox)" : "sent"} to ${member.email}`, notifId);
        }
      }
      return { sent, failed };
    },

    async retryNotification(notificationId: string) {
      const notif = get().notifications.find((n) => n.id === notificationId);
      if (!notif) return;
      await (get() as unknown as { notifyLeadAssignment: (id: string, o?: { retry?: boolean }) => Promise<unknown> })
        .notifyLeadAssignment(notif.lead_id, { retry: true });
      get().showToast("success", "Notification retried");
    },

    async confirmAppointment(rawToken: string) {
      const token_hash = await hashToken(rawToken);
      const conf = get().appointmentConfirmations.find((c) => c.token_hash === token_hash);
      if (!conf) return { ok: false, reason: "invalid" as const };
      if (conf.status === "confirmed") return { ok: true, already: true as const };
      if (new Date(conf.expires_at) < new Date() || conf.status === "expired") {
        set((s) => ({
          appointmentConfirmations: s.appointmentConfirmations.map((c) =>
            c.id === conf.id ? { ...c, status: "expired" as const } : c
          ),
        }));
        return { ok: false, reason: "expired" as const };
      }
      set((s) => ({
        appointmentConfirmations: s.appointmentConfirmations.map((c) =>
          c.id === conf.id ? { ...c, status: "confirmed" as const, confirmed_at: now() } : c
        ),
      }));
      addActivity(
        conf.lead_id,
        conf.recipient_role === "manager" ? "manager_confirmed_receipt" : "rep_confirmed_receipt",
        `${conf.recipient_role || "Recipient"} confirmed appointment receipt`,
        conf.id
      );
      return { ok: true, already: false as const };
    },

    // ── Catalog CRUD (§18–§22) ───────────────────────────────────
    addCatalogSeries: (name: string, description?: string) => {
      const s: CatalogSeries = { id: gid("series"), name, description, active: true, sort_order: get().catalogSeries.length, created_at: now() };
      set((st) => ({ catalogSeries: [...st.catalogSeries, s] }));
      return s;
    },
    updateCatalogSeries: (id: string, data: Partial<CatalogSeries>) =>
      set((st) => ({ catalogSeries: st.catalogSeries.map((x) => (x.id === id ? { ...x, ...data, updated_at: now() } : x)) })),
    addCatalogWindowType: (series_id: string, name: string) => {
      const t: CatalogWindowType = { id: gid("wt"), series_id, name, active: true, sort_order: get().catalogWindowTypes.filter((w) => w.series_id === series_id).length, created_at: now() };
      set((st) => ({ catalogWindowTypes: [...st.catalogWindowTypes, t] }));
      return t;
    },
    updateCatalogWindowType: (id: string, data: Partial<CatalogWindowType>) =>
      set((st) => ({ catalogWindowTypes: st.catalogWindowTypes.map((x) => (x.id === id ? { ...x, ...data, updated_at: now() } : x)) })),
    addCatalogRange: (data: Omit<CatalogUniversalRange, "id" | "created_at" | "sort_order" | "active"> & { active?: boolean }) => {
      const r: CatalogUniversalRange = {
        ...data,
        active: data.active ?? true,
        id: gid("range"),
        sort_order: get().catalogUniversalRanges.filter((x) => x.window_type_id === data.window_type_id).length,
        created_at: now(),
      };
      set((st) => ({ catalogUniversalRanges: [...st.catalogUniversalRanges, r] }));
      return r;
    },
    updateCatalogRange: (id: string, data: Partial<CatalogUniversalRange>) =>
      set((st) => ({ catalogUniversalRanges: st.catalogUniversalRanges.map((x) => (x.id === id ? { ...x, ...data, updated_at: now() } : x)) })),
    addCatalogItem: (data: Omit<CatalogItem, "id" | "created_at" | "active" | "archived" | "attributes"> & { attributes?: CatalogItem["attributes"]; active?: boolean }) => {
      const item: CatalogItem = {
        ...data,
        attributes: data.attributes || [],
        active: data.active ?? true,
        archived: false,
        id: gid("item"),
        created_at: now(),
      };
      set((st) => ({ catalogItems: [item, ...st.catalogItems] }));
      get().showToast("success", "Inventory item saved");
      return item;
    },
    updateCatalogItem: (id: string, data: Partial<CatalogItem>) =>
      set((st) => ({ catalogItems: st.catalogItems.map((x) => (x.id === id ? { ...x, ...data, updated_at: now() } : x)) })),
    archiveCatalogItem: (id: string) =>
      set((st) => ({ catalogItems: st.catalogItems.map((x) => (x.id === id ? { ...x, archived: true, active: false, updated_at: now() } : x)) })),
    duplicateCatalogItem: (id: string) => {
      const src = get().catalogItems.find((x) => x.id === id);
      if (!src) return null;
      const copy: CatalogItem = { ...src, id: gid("item"), name: `${src.name} (copy)`, created_at: now(), attributes: src.attributes.map((a) => ({ ...a, id: gid("attr"), options: a.options?.map((o) => ({ ...o, id: gid("opt") })) })) };
      set((st) => ({ catalogItems: [copy, ...st.catalogItems] }));
      return copy;
    },

    // ── Quotes from a lead + inventory items (§15, §24, §25, §26) ─
    createQuoteForLead: (leadId: string): Quote | null => {
      const lead = get().leads.find((l) => l.id === leadId);
      if (!lead) { get().showToast("error", "Lead not found"); return null; }
      const contact = primaryContact(lead);
      const quote: Quote = {
        id: gid("quote"),
        lead_id: leadId,
        owner_id: lead.assigned_estimator_id,
        customer_id: lead.customer_id || "",
        customer_name: contact ? `${contact.first_name} ${contact.last_name}`.trim() : lead.full_name,
        property_address: [lead.address, lead.city, lead.state, lead.zip_code].filter(Boolean).join(", "),
        service_type: lead.service_requested,
        status: "draft",
        notes: "",
        items: [],
        subtotal_cents: 0,
        total_cents: 0,
        total: 0,
        created_at: now(),
        updated_at: now(),
      };
      set((s) => ({ quotes: [quote, ...s.quotes] }));
      addActivity(leadId, "quote_started", "Quote started", quote.id);
      return quote;
    },
    updateQuoteMeta: (quoteId: string, data: { notes?: string; status?: Quote["status"] }) => {
      const q = get().quotes.find((x) => x.id === quoteId);
      if (!q) return;
      if (data.status && !canTransitionQuote(q.status, data.status)) {
        get().showToast("error", `Cannot change status ${q.status} → ${data.status}`);
        return;
      }
      set((s) => ({ quotes: s.quotes.map((x) => (x.id === quoteId ? { ...x, ...data, updated_at: now() } : x)) }));
      if (data.status && data.status !== q.status && q.lead_id) {
        addActivity(q.lead_id, "quote_status_changed", `Quote status ${q.status} → ${data.status}`, quoteId);
      }
    },
    addQuoteItem: (quoteId: string, item: Omit<QuoteItem, "id" | "created_at">) => {
      const full: QuoteItem = { ...item, id: gid("qi"), created_at: now() };
      set((s) => ({
        quotes: s.quotes.map((q) => {
          if (q.id !== quoteId) return q;
          const items = [...(q.items || []), full];
          const t = quoteTotals(items);
          return { ...q, items, ...t, total: t.total_cents / 100, updated_at: now() };
        }),
      }));
    },
    updateQuoteItemQuantity: (quoteId: string, itemId: string, quantity: number) => {
      const q = Math.max(1, Math.floor(quantity || 1));
      set((s) => ({
        quotes: s.quotes.map((quote) => {
          if (quote.id !== quoteId) return quote;
          const items = (quote.items || []).map((it) =>
            it.id === itemId
              ? { ...it, quantity: q, line_total_cents: it.configured_unit_price_cents * q, line_cost_cents: it.configured_unit_cost_cents * q }
              : it
          );
          const t = quoteTotals(items);
          return { ...quote, items, ...t, total: t.total_cents / 100, updated_at: now() };
        }),
      }));
    },
    removeQuoteItem: (quoteId: string, itemId: string) => {
      set((s) => ({
        quotes: s.quotes.map((quote) => {
          if (quote.id !== quoteId) return quote;
          const items = (quote.items || []).filter((it) => it.id !== itemId);
          const t = quoteTotals(items);
          return { ...quote, items, ...t, total: t.total_cents / 100, updated_at: now() };
        }),
      }));
    },
    saveQuoteDraft: (quoteId: string) => {
      const q = get().quotes.find((x) => x.id === quoteId);
      if (q?.lead_id) addActivity(q.lead_id, "quote_saved", "Quote saved as draft", quoteId);
      get().showToast("success", "Quote saved");
    },

    // ── Website lead intake (§12) — persists into the CRM store ──────
    async importWebsiteLead(payload: WebsiteLeadInput) {
      const team = get().teamMembers;
      const settings = getSettings();
      const { manager, cursorNext } = pickWebsiteManager(team, settings);
      if (cursorNext !== undefined) useSettingsStore.getState().setField("round_robin_cursor", cursorNext);

      const service = resolveWebsiteService(payload.service_needed);
      const contact: LeadContact = {
        id: gid("contact"),
        first_name: payload.first_name || "Website",
        last_name: payload.last_name || "Lead",
        phone: normalizePhone(payload.phone),
        email: normalizeEmail(payload.email),
        is_primary: true,
        created_at: now(),
      };
      const lead = get().addLead({
        contacts: [contact],
        address: payload.address || "",
        city: payload.city || "",
        state: payload.state || "",
        zip_code: payload.zip || "",
        country: payload.country,
        latitude: payload.latitude,
        longitude: payload.longitude,
        formatted_address: payload.formatted_address,
        service_requested: service.service_requested,
        custom_service_name: service.custom_service_name,
        lead_source: "website_form",
        urgency: "medium",
        property_type: (payload.property_type as Lead["property_type"]) || "residential",
        status: "new_lead",
        notes: payload.message,
        campaign_name: payload.campaign,
        utm_source: payload.utm_source,
        utm_medium: payload.utm_medium,
        utm_campaign: payload.utm_campaign,
        assigned_estimator_id: manager?.id,
        assigned_estimator_name: manager ? `${manager.first_name} ${manager.last_name}`.trim() : undefined,
        needs_assignment: !manager,
      });

      addActivity(lead.id, "website_lead_imported", "Lead imported from website form");

      if (manager) {
        await (get() as unknown as { notifyLeadAssignment: (id: string) => Promise<{ sent: number; failed: number }> })
          .notifyLeadAssignment(lead.id);
        return { leadId: lead.id, assignedTo: manager.id, needsAssignment: false };
      }

      // No active manager: flag + notify an administrator (§12) — never discard.
      const admin = team.find((m) => m.role === "administrator" && m.active);
      const record: NotificationRecord = {
        id: gid("notif"),
        kind: "admin_unassigned",
        lead_id: lead.id,
        recipient_user_id: admin?.id,
        recipient_role: "administrator",
        to_email: admin?.email || "admin@windowcrm.local",
        subject: "[SANDBOX] Website lead requires assignment",
        body_html: `<p>A website lead was created but no active Manager is available. Please assign it.</p>`,
        status: "sandbox",
        dedupe_key: `unassigned:${lead.id}`,
        created_at: now(),
        sent_at: now(),
      };
      set((s) => ({ notifications: [record, ...s.notifications] }));
      return { leadId: lead.id, assignedTo: null, needsAssignment: true };
    },
  };
}

// ── Website intake helpers (pure — shared with API layer) ─────────
export interface WebsiteLeadInput {
  first_name?: string;
  last_name?: string;
  phone: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  formatted_address?: string;
  service_needed?: string;
  property_type?: string;
  message?: string;
  source?: string;
  campaign?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
}

export function normalizePhone(p: string | undefined): string {
  if (!p) return "";
  const digits = p.replace(/[^\d+]/g, "");
  return digits;
}
export function normalizeEmail(e: string | undefined): string | undefined {
  if (!e) return undefined;
  return e.trim().toLowerCase();
}

const STANDARD_SERVICES = ["window_replacement", "window_repair", "sliding_glass_doors"];
export function resolveWebsiteService(input: string | undefined): {
  service_requested: Lead["service_requested"];
  custom_service_name?: string;
} {
  if (!input) return { service_requested: "window_replacement" };
  const key = input.toLowerCase().replace(/\s+/g, "_");
  if (STANDARD_SERVICES.includes(key)) return { service_requested: key as Lead["service_requested"] };
  return { service_requested: "custom", custom_service_name: input };
}

export function pickWebsiteManager(
  team: TeamMember[],
  settings: { website_assignment_mode: string; round_robin_enabled: boolean; round_robin_cursor: number; default_website_manager_id: string }
): { manager?: TeamMember; cursorNext?: number } {
  const mgrs = activeManagers(team);
  if (mgrs.length === 0) return {};
  if (settings.website_assignment_mode === "round_robin" && settings.round_robin_enabled) {
    const idx = (settings.round_robin_cursor || 0) % mgrs.length;
    return { manager: mgrs[idx], cursorNext: idx + 1 };
  }
  const def = mgrs.find((m) => m.id === settings.default_website_manager_id);
  return { manager: def || mgrs[0] };
}

export type { QuoteItemAttributeSelection };
