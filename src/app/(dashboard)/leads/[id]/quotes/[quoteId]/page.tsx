"use client";

/**
 * Inventory-based Create / Edit Quote page for a specific lead + quote (§15/§24).
 *
 * The lead-derived context (customer, address, service, assigned rep,
 * appointment) is READ-ONLY here — it flows from the associated lead and is
 * never edited on the quote. Everything below the summary configures inventory
 * catalog items into immutable snapshot line items with integer-cent pricing.
 *
 * Access control is enforced at the data layer: a sales rep may not open another
 * rep's quote via direct URL. If the acting user cannot view the quote we render
 * an Unauthorized message and never read the quote's line data.
 */
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Package, Pencil, Plus, Trash2, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SelectField } from "@/components/ui/select-field";
import { useCRMStore } from "@/lib/store/crm-store";
import { useSettingsStore } from "@/lib/settings/settings-store";
import {
  QUOTE_STATUSES,
  QUOTE_STATUS_LABELS,
  canTransitionQuote,
  serviceDisplay,
} from "@/lib/domain";
import { canViewQuote, canEditQuote, canViewCost } from "@/lib/permissions";
import { primaryContact, leadDisplayName } from "@/lib/store/crm-extended";
import {
  priceConfiguration,
  lineTotals,
  validateNumericAttribute,
  type SelectionInput,
} from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type {
  CatalogItem,
  CatalogAttribute,
  QuoteItem,
} from "@/types/database";

export default function LeadQuotePage({
  params,
}: {
  params: Promise<{ id: string; quoteId: string }>;
}) {
  const { id: leadId, quoteId } = use(params);
  const router = useRouter();

  // ── Store selectors ──────────────────────────────────────────────
  const hydrated = useCRMStore((s) => s._hasHydrated);
  const teamMembers = useCRMStore((s) => s.teamMembers);
  const currentTeamMemberId = useCRMStore((s) => s.currentTeamMemberId);
  const lead = useCRMStore((s) => s.leads.find((l) => l.id === leadId));
  const quote = useCRMStore((s) => s.quotes.find((q) => q.id === quoteId));
  const catalogSeries = useCRMStore((s) => s.catalogSeries);
  const catalogWindowTypes = useCRMStore((s) => s.catalogWindowTypes);
  const catalogUniversalRanges = useCRMStore((s) => s.catalogUniversalRanges);
  const catalogItems = useCRMStore((s) => s.catalogItems);

  const createQuoteForLead = useCRMStore((s) => s.createQuoteForLead);
  const updateQuoteMeta = useCRMStore((s) => s.updateQuoteMeta);
  const addQuoteItem = useCRMStore((s) => s.addQuoteItem);
  const updateQuoteItemQuantity = useCRMStore((s) => s.updateQuoteItemQuantity);
  const removeQuoteItem = useCRMStore((s) => s.removeQuoteItem);
  const saveQuoteDraft = useCRMStore((s) => s.saveQuoteDraft);

  const managerCostVisible = useSettingsStore((s) => s.manager_cost_visible);

  const actingUser = useMemo(
    () => teamMembers.find((m) => m.id === currentTeamMemberId),
    [teamMembers, currentTeamMemberId]
  );

  // §8 — a quote is NOT persisted merely by opening this page. When the route
  // is `.../quotes/new`, nothing is created until the first real action (add an
  // item, save a draft, set notes/status). `ensureQuoteId` lazily creates the
  // quote on that first action and swaps the URL to the real id.
  const isNew = quoteId === "new";
  const ensureQuoteId = useCallback((): string | null => {
    if (quote) return quote.id;
    const created = createQuoteForLead(leadId);
    if (created) router.replace(`/leads/${leadId}/quotes/${created.id}`);
    return created?.id ?? null;
  }, [quote, createQuoteForLead, leadId, router]);

  // ── Local UI state ───────────────────────────────────────────────
  const [notes, setNotes] = useState("");
  const [statusError, setStatusError] = useState<string | null>(null);

  // Catalog browser filters
  const [filterSeries, setFilterSeries] = useState("");
  const [filterWindowType, setFilterWindowType] = useState("");
  const [filterRange, setFilterRange] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);

  // Configurator state
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectionInput, setSelectionInput] = useState<SelectionInput>({});
  const [quantity, setQuantity] = useState(1);
  const [editingLineId, setEditingLineId] = useState<string | null>(null);

  // Sync notes from the quote once it is available.
  useEffect(() => {
    if (quote) setNotes(quote.notes ?? "");
  }, [quote?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const configuratorDirty = selectedItemId !== null;

  // Warn before leaving (browser navigation) when a configuration is unsaved.
  useEffect(() => {
    if (!configuratorDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [configuratorDirty]);

  const canEdit = canEditQuote(actingUser, quote ?? { owner_id: lead?.assigned_estimator_id }, teamMembers);

  const selectedItem = useMemo(
    () => catalogItems.find((i) => i.id === selectedItemId) ?? null,
    [catalogItems, selectedItemId]
  );

  const activeAttributes = useMemo<CatalogAttribute[]>(
    () => (selectedItem?.attributes ?? []).filter((a) => a.active),
    [selectedItem]
  );

  // Live pricing for the current configuration.
  const priced = useMemo(() => {
    if (!selectedItem) return null;
    return priceConfiguration(selectedItem, selectionInput);
  }, [selectedItem, selectionInput]);

  // Per-attribute numeric validation errors.
  const numericErrors = useMemo<Record<string, string>>(() => {
    const errs: Record<string, string> = {};
    for (const attr of activeAttributes) {
      if (attr.type !== "number") continue;
      const raw = selectionInput[attr.id];
      const value = typeof raw === "number" ? raw : NaN;
      const err = validateNumericAttribute(attr, value);
      if (err) errs[attr.id] = err;
    }
    return errs;
  }, [activeAttributes, selectionInput]);

  const canAddConfig = !!selectedItem && Object.keys(numericErrors).length === 0 && quantity >= 1;

  // ── Catalog filtering ────────────────────────────────────────────
  const visibleWindowTypes = useMemo(
    () =>
      catalogWindowTypes.filter(
        (w) => w.active && (!filterSeries || w.series_id === filterSeries)
      ),
    [catalogWindowTypes, filterSeries]
  );

  const visibleRanges = useMemo(
    () =>
      catalogUniversalRanges.filter(
        (r) => r.active && (!filterWindowType || r.window_type_id === filterWindowType)
      ),
    [catalogUniversalRanges, filterWindowType]
  );

  const matchingItems = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return catalogItems.filter((item) => {
      if (!showInactive && (!item.active || item.archived)) return false;
      if (filterSeries && item.series_id !== filterSeries) return false;
      if (filterWindowType && item.window_type_id !== filterWindowType) return false;
      if (filterRange && item.universal_range_id !== filterRange) return false;
      if (needle) {
        const hay = `${item.name} ${item.sku ?? ""} ${item.supplier ?? ""}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [catalogItems, showInactive, filterSeries, filterWindowType, filterRange, search]);

  const seriesName = useCallback(
    (sid: string) => catalogSeries.find((s) => s.id === sid)?.name ?? "—",
    [catalogSeries]
  );
  const windowTypeName = useCallback(
    (wid: string) => catalogWindowTypes.find((w) => w.id === wid)?.name ?? "—",
    [catalogWindowTypes]
  );
  const rangeLabel = useCallback(
    (rid?: string) => (rid ? catalogUniversalRanges.find((r) => r.id === rid)?.label ?? "—" : "—"),
    [catalogUniversalRanges]
  );

  // ── Configurator open / reset ────────────────────────────────────
  const openConfigurator = useCallback((item: CatalogItem) => {
    const init: SelectionInput = {};
    for (const attr of item.attributes ?? []) {
      if (!attr.active) continue;
      if (attr.type === "select") {
        const def = (attr.options ?? []).find((o) => o.is_default && o.active) ?? (attr.options ?? []).find((o) => o.active);
        init[attr.id] = def?.id;
      } else {
        init[attr.id] = attr.default_value;
      }
    }
    setSelectedItemId(item.id);
    setSelectionInput(init);
    setQuantity(1);
    setEditingLineId(null);
  }, []);

  // Reopen configurator prefilled from an existing line's snapshot selections
  // (do not force a rebuild from catalog defaults).
  const editLine = useCallback(
    (line: QuoteItem) => {
      const item = catalogItems.find((i) => i.id === line.catalog_item_id);
      if (!item) return;
      const init: SelectionInput = {};
      for (const sel of line.selections) {
        init[sel.attribute_id] = sel.type === "select" ? sel.option_id : sel.number_value;
      }
      setSelectedItemId(item.id);
      setSelectionInput(init);
      setQuantity(line.quantity);
      setEditingLineId(line.id);
    },
    [catalogItems]
  );

  const closeConfigurator = useCallback(() => {
    setSelectedItemId(null);
    setSelectionInput({});
    setQuantity(1);
    setEditingLineId(null);
  }, []);

  const handleAddToQuote = useCallback(() => {
    if (!selectedItem || !priced) return;
    const qid = ensureQuoteId();
    if (!qid) return;
    const { line_total_cents, line_cost_cents } = lineTotals(
      priced.configured_unit_price_cents,
      priced.configured_unit_cost_cents,
      quantity
    );
    const snapshot: Omit<QuoteItem, "id" | "created_at"> = {
      catalog_item_id: selectedItem.id,
      series_snapshot: seriesName(selectedItem.series_id),
      window_type_snapshot: windowTypeName(selectedItem.window_type_id),
      universal_range_snapshot: rangeLabel(selectedItem.universal_range_id),
      item_name_snapshot: selectedItem.name,
      base_price_cents_snapshot: selectedItem.base_price_cents,
      base_cost_cents_snapshot: selectedItem.base_cost_cents,
      selections: priced.selections,
      configured_unit_price_cents: priced.configured_unit_price_cents,
      configured_unit_cost_cents: priced.configured_unit_cost_cents,
      quantity: Math.max(1, Math.floor(quantity)),
      line_total_cents,
      line_cost_cents,
    };
    // Editing an existing line: remove the old snapshot then add the new one.
    if (editingLineId) removeQuoteItem(qid, editingLineId);
    addQuoteItem(qid, snapshot);
    closeConfigurator();
  }, [
    selectedItem,
    priced,
    ensureQuoteId,
    quantity,
    editingLineId,
    seriesName,
    windowTypeName,
    rangeLabel,
    removeQuoteItem,
    addQuoteItem,
    closeConfigurator,
  ]);

  // ── Status change (validated transition) ─────────────────────────
  const handleStatusChange = useCallback(
    (next: string) => {
      const current = quote?.status ?? "draft";
      setStatusError(null);
      if (!canTransitionQuote(current, next)) {
        setStatusError(
          `Cannot change status from "${QUOTE_STATUS_LABELS[current] ?? current}" to "${
            QUOTE_STATUS_LABELS[next] ?? next
          }".`
        );
        return;
      }
      const qid = ensureQuoteId();
      if (qid) updateQuoteMeta(qid, { status: next as (typeof QUOTE_STATUSES)[number] });
    },
    [quote, ensureQuoteId, updateQuoteMeta]
  );

  const persistNotes = useCallback(() => {
    // Don't create an empty quote just because Notes was focused/blurred.
    if (!quote && !notes.trim()) return;
    if ((quote?.notes ?? "") !== notes) {
      const qid = ensureQuoteId();
      if (qid) updateQuoteMeta(qid, { notes });
    }
  }, [quote, notes, ensureQuoteId, updateQuoteMeta]);

  const guardedNavigate = useCallback(
    (href: string) => {
      if (configuratorDirty && !window.confirm("You have an unsaved configuration. Leave without adding it?")) {
        return;
      }
      router.push(href);
    },
    [configuratorDirty, router]
  );

  // ── Guards (after all hooks) ─────────────────────────────────────
  if (!hydrated) {
    return <div className="py-20 text-center text-muted-foreground">Loading...</div>;
  }

  // A brand-new (unsaved) quote has no store record yet; render from the lead.
  if (!quote && !(isNew && lead)) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Quote not found.</p>
        <Button variant="link" asChild className="mt-4">
          <Link href="/quotes">Back to quotes</Link>
        </Button>
      </div>
    );
  }

  // Read-only view model: the persisted quote, or a synthetic draft for `new`.
  const displayQuote = quote ?? {
    status: "draft" as const,
    items: [] as QuoteItem[],
    customer_name: lead ? leadDisplayName(lead) : "",
    service_type: lead?.service_requested ?? "custom",
    property_address: "",
    notes: "",
    owner_id: lead?.assigned_estimator_id,
    total_cents: 0,
    subtotal_cents: 0,
  };

  // Enforce visibility at the data layer — never render another rep's quote.
  if (!canViewQuote(actingUser, displayQuote, teamMembers)) {
    return (
      <div className="py-20 text-center">
        <p className="text-sm font-semibold text-foreground">Unauthorized</p>
        <p className="mt-1 text-sm text-muted-foreground">
          You do not have access to this quote.
        </p>
        <Button variant="link" asChild className="mt-4">
          <Link href="/quotes">Back to quotes</Link>
        </Button>
      </div>
    );
  }

  const items = displayQuote.items ?? [];
  const contact = lead ? primaryContact(lead) : undefined;
  const additionalContacts = lead
    ? (lead.contacts ?? []).filter((c) => c.id !== (lead.primary_contact_id ?? contact?.id))
    : [];
  const assignedRep =
    lead?.assigned_estimator_name ||
    teamMembers.find((m) => m.id === lead?.assigned_estimator_id)?.first_name ||
    "Unassigned";
  const propertyAddress =
    lead?.formatted_address ||
    [lead?.address, lead?.city, lead?.state, lead?.zip_code].filter(Boolean).join(", ") ||
    displayQuote.property_address ||
    "—";
  const showCost = canViewCost(actingUser, managerCostVisible);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configure Quote"
        description="Build this proposal from inventory catalog items."
        actions={
          <Button variant="outline" onClick={() => guardedNavigate(`/leads/${leadId}`)}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Lead
          </Button>
        }
      />

      {/* a) Lead Summary — READ ONLY */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Lead Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <SummaryRow label="Associated Lead">
            {lead ? (
              <Link
                href={`/leads/${leadId}`}
                className="text-primary hover:underline"
                onClick={(e) => {
                  if (configuratorDirty) {
                    e.preventDefault();
                    guardedNavigate(`/leads/${leadId}`);
                  }
                }}
              >
                {leadDisplayName(lead)}
              </Link>
            ) : (
              <span className="text-muted-foreground">Lead unavailable</span>
            )}
          </SummaryRow>
          <SummaryRow label="Primary Customer Name">
            {contact ? `${contact.first_name} ${contact.last_name}`.trim() : displayQuote.customer_name || "—"}
          </SummaryRow>
          <SummaryRow label="Additional Contacts">
            {additionalContacts.length > 0
              ? additionalContacts.map((c) => `${c.first_name} ${c.last_name}`.trim()).join(", ")
              : "None"}
          </SummaryRow>
          <SummaryRow label="Complete Property Address">{propertyAddress}</SummaryRow>
          <SummaryRow label="Service Type">
            {lead
              ? serviceDisplay(lead.service_requested, lead.custom_service_name)
              : serviceDisplay(displayQuote.service_type)}
          </SummaryRow>
          <SummaryRow label="Assigned Sales Representative">{assignedRep}</SummaryRow>
          <SummaryRow label="Appointment Date & Time">
            {lead?.appointment_at ? formatDateTime(lead.appointment_at) : "Not scheduled"}
          </SummaryRow>
        </CardContent>
      </Card>

      {!canEdit && (
        <div className="rounded-md border border-dashed bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          You have read-only access to this quote.
        </div>
      )}

      {/* b) Quote Status + c) Notes */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Quote Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <SelectField
              label="Status"
              value={displayQuote.status}
              disabled={!canEdit}
              onChange={handleStatusChange}
              options={QUOTE_STATUSES.map((s) => ({ value: s, label: QUOTE_STATUS_LABELS[s] }))}
            />
            {statusError && <p className="text-xs text-red-600">{statusError}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Notes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              value={notes}
              disabled={!canEdit}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={persistNotes}
              placeholder="Add notes for this quote…"
              rows={4}
            />
            <p className="text-xs text-muted-foreground">
              These notes will appear on the customer agreement.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* d) Inventory Catalog Browser */}
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Inventory Catalog</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SelectField
                label="Series"
                value={filterSeries}
                onChange={(v) => {
                  setFilterSeries(v);
                  setFilterWindowType("");
                  setFilterRange("");
                }}
                options={[
                  { value: "", label: "All Series" },
                  ...catalogSeries.filter((s) => s.active).map((s) => ({ value: s.id, label: s.name })),
                ]}
              />
              <SelectField
                label="Window Type"
                value={filterWindowType}
                onChange={(v) => {
                  setFilterWindowType(v);
                  setFilterRange("");
                }}
                options={[
                  { value: "", label: "All Window Types" },
                  ...visibleWindowTypes.map((w) => ({ value: w.id, label: w.name })),
                ]}
              />
              <SelectField
                label="Universal Inches"
                value={filterRange}
                onChange={setFilterRange}
                options={[
                  { value: "", label: "All Sizes" },
                  ...visibleRanges.map((r) => ({ value: r.id, label: r.label })),
                ]}
              />
              <div className="space-y-1.5">
                <Label>Search</Label>
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Item name, SKU…"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(e) => setShowInactive(e.target.checked)}
              />
              Include inactive / archived items
            </label>

            {matchingItems.length === 0 ? (
              <EmptyState
                icon={Package}
                title="No matching items"
                description="Adjust the filters above or add items to the inventory catalog."
              />
            ) : (
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {matchingItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openConfigurator(item)}
                    className={`rounded-lg border p-3 text-left transition-colors hover:border-brand-blue hover:bg-brand-blue-light ${
                      selectedItemId === item.id ? "border-brand-blue bg-brand-blue-light" : ""
                    }`}
                  >
                    <p className="text-sm font-medium">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {seriesName(item.series_id)} · {windowTypeName(item.window_type_id)}
                      {item.universal_range_id ? ` · ${rangeLabel(item.universal_range_id)}` : ""}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-brand-blue">
                      {formatCents(item.base_price_cents)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* e) Product Configurator */}
      {canEdit && selectedItem && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">
              {editingLineId ? "Edit Configuration" : "Configure"}: {selectedItem.name}
            </CardTitle>
            <Button variant="ghost" size="icon" onClick={closeConfigurator} title="Close">
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {activeAttributes.map((attr) => {
                if (attr.type === "select") {
                  const value = typeof selectionInput[attr.id] === "string" ? (selectionInput[attr.id] as string) : "";
                  return (
                    <SelectField
                      key={attr.id}
                      label={attr.name + (attr.required ? " *" : "")}
                      value={value}
                      onChange={(v) => setSelectionInput((p) => ({ ...p, [attr.id]: v || undefined }))}
                      options={[
                        ...(attr.required ? [] : [{ value: "", label: "None" }]),
                        ...(attr.options ?? [])
                          .filter((o) => o.active)
                          .map((o) => ({ value: o.id, label: o.label })),
                      ]}
                    />
                  );
                }
                const numValue = typeof selectionInput[attr.id] === "number" ? (selectionInput[attr.id] as number) : "";
                return (
                  <div key={attr.id} className="space-y-1.5">
                    <Label>
                      {attr.name}
                      {attr.required ? " *" : ""}
                      {attr.unit_label ? ` (${attr.unit_label})` : ""}
                    </Label>
                    <Input
                      type="number"
                      value={numValue}
                      min={attr.min}
                      max={attr.max}
                      step={attr.step ?? "any"}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setSelectionInput((p) => ({
                          ...p,
                          [attr.id]: raw === "" ? undefined : Number(raw),
                        }));
                      }}
                    />
                    {numericErrors[attr.id] && (
                      <p className="text-xs text-red-600">{numericErrors[attr.id]}</p>
                    )}
                  </div>
                );
              })}

              <div className="space-y-1.5">
                <Label>Quantity *</Label>
                <Input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setQuantity(isNaN(n) || n < 1 ? 1 : n);
                  }}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/40 px-4 py-3">
              <div className="text-sm">
                <span className="text-muted-foreground">Configured Unit Price: </span>
                <span className="font-semibold">
                  {priced ? formatCents(priced.configured_unit_price_cents) : "—"}
                </span>
                {showCost && priced && (
                  <span className="ml-4 text-muted-foreground">
                    Internal Cost: {formatCents(priced.configured_unit_cost_cents)}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={closeConfigurator}>
                  Cancel
                </Button>
                <Button
                  className="bg-brand-blue hover:bg-brand-blue-dark"
                  disabled={!canAddConfig}
                  onClick={handleAddToQuote}
                >
                  <Plus className="mr-1 h-4 w-4" />
                  {editingLineId ? "Update Line" : "Add to Quote"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* g) Added Quote Items */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Quote Items ({items.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No items added"
              description="Choose an inventory item above and configure it to build this quote."
            />
          ) : (
            <div className="space-y-3">
              {items.map((line) => (
                <div
                  key={line.id}
                  className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{line.item_name_snapshot}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {[
                        `Series: ${line.series_snapshot}`,
                        `Window Type: ${line.window_type_snapshot}`,
                        `Universal Inches: ${line.universal_range_snapshot}`,
                        ...line.selections.map((s) =>
                          s.type === "select"
                            ? `${s.attribute_name}: ${s.option_label ?? "—"}`
                            : `${s.attribute_name}: ${s.number_value ?? 0}${s.unit_label ? ` ${s.unit_label}` : ""}`
                        ),
                        `Quantity: ${line.quantity}`,
                      ].join(" / ")}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-sm font-semibold">{formatCents(line.line_total_cents)}</p>
                      {showCost && (
                        <p className="text-xs text-muted-foreground">
                          Cost: {formatCents(line.line_cost_cents)}
                        </p>
                      )}
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          value={line.quantity}
                          onChange={(e) => {
                            const n = parseInt(e.target.value, 10);
                            if (quote) updateQuoteItemQuantity(quote.id, line.id, isNaN(n) || n < 1 ? 1 : n);
                          }}
                          className="h-8 w-16"
                          title="Quantity"
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit Configuration"
                          onClick={() => editLine(line)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-600"
                          title="Remove"
                          onClick={() => quote && removeQuoteItem(quote.id, line.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* h) Calculated Totals */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calculated Totals</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">{formatCents(displayQuote.subtotal_cents ?? 0)}</span>
          </div>
          <div className="flex items-center justify-between border-t pt-2 text-base">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-brand-blue">{formatCents(displayQuote.total_cents ?? 0)}</span>
          </div>
        </CardContent>
      </Card>

      {/* i) Save Draft + Continue */}
      {canEdit && (
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => { persistNotes(); const qid = ensureQuoteId(); if (qid) saveQuoteDraft(qid); }}>
            Save Draft
          </Button>
          <Button
            className="bg-brand-blue hover:bg-brand-blue-dark"
            onClick={() => {
              persistNotes();
              const qid = ensureQuoteId();
              if (qid) saveQuoteDraft(qid);
              router.push(`/leads/${leadId}`);
            }}
          >
            Continue
          </Button>
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm">{children}</p>
    </div>
  );
}
