"use client";

/**
 * Small shared controls for the platform admin console (Deliverables 1–9).
 *
 * These are thin compositions of the existing UI primitives (Button, Card,
 * SelectField, Badge) rather than new primitives — the admin panel repeats the
 * same pagination / CSV / metadata patterns on six pages and duplicating them
 * would let them drift apart.
 */

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SelectField } from "@/components/ui/select-field";
import { buildCsv, csvFilename, paginate, type CsvColumn } from "@/lib/tenancy/platform-metrics";

export const PER_PAGE_OPTIONS = [
  { value: "10", label: "10 per page" },
  { value: "25", label: "25 per page" },
  { value: "50", label: "50 per page" },
];

/**
 * 1-based pagination state that never strands the user on a page that no longer
 * exists — `paginate()` clamps, and the clamped page is what gets rendered.
 */
export function usePagination<T>(rows: T[], initialPerPage = 25) {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(String(initialPerPage));
  const result = useMemo(() => paginate(rows, page, Number(perPage)), [rows, page, perPage]);
  return {
    ...result,
    perPage,
    setPerPage: (v: string) => {
      setPerPage(v);
      setPage(1);
    },
    setPage,
  };
}

export interface PaginationBarProps {
  page: number;
  totalPages: number;
  total: number;
  perPage: string;
  onPage: (page: number) => void;
  onPerPage: (perPage: string) => void;
  label?: string;
}

export function PaginationBar({
  page,
  totalPages,
  total,
  perPage,
  onPage,
  onPerPage,
  label = "rows",
}: PaginationBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3">
      <p className="text-xs text-muted-foreground">
        {total === 0 ? `No ${label}` : `${total} ${label} · page ${page} of ${totalPages}`}
      </p>
      <div className="flex items-center gap-2">
        <div className="w-36">
          <SelectField
            aria-label="Rows per page"
            value={perPage}
            options={PER_PAGE_OPTIONS}
            onChange={onPerPage}
          />
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export interface ExportCsvButtonProps<T> {
  rows: T[];
  columns: CsvColumn<T>[];
  filenamePrefix: string;
  label?: string;
}

/**
 * Client-side CSV export of the CURRENTLY FILTERED rows. Nothing is fetched and
 * nothing is fabricated — an empty filter result exports a header-only file.
 */
export function ExportCsvButton<T>({
  rows,
  columns,
  filenamePrefix,
  label = "Export CSV",
}: ExportCsvButtonProps<T>) {
  const download = () => {
    const csv = buildCsv(rows, columns);
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = csvFilename(filenamePrefix);
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={rows.length === 0}>
      <Download className="mr-2 h-4 w-4" />
      {label}
      {rows.length > 0 && <span className="ml-1 text-muted-foreground">({rows.length})</span>}
    </Button>
  );
}

/** Pretty-printed metadata for audit / system-event detail rows. */
export function MetadataBlock({ value }: { value: unknown }) {
  if (value === undefined || value === null || (typeof value === "object" && Object.keys(value as object).length === 0)) {
    return <p className="text-xs text-muted-foreground">No metadata recorded.</p>;
  }
  return (
    <pre className="max-h-64 overflow-auto rounded-lg bg-slate-950 p-3 text-[11px] leading-relaxed text-slate-200">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

/** Small labelled value used across the detail pages. */
export function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="truncate text-sm font-medium">{value === "" || value == null ? "—" : value}</div>
    </div>
  );
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "success" | "warning" | "danger" | "outline"> = {
  active: "success",
  trial: "default",
  trialing: "default",
  suspended: "danger",
  cancelled: "secondary",
  past_due: "warning",
  pending: "warning",
  accepted: "success",
  revoked: "secondary",
  expired: "secondary",
};

export function StatusPill({ status }: { status: string }) {
  return <Badge variant={STATUS_VARIANT[status] ?? "outline"}>{status.replace(/_/g, " ")}</Badge>;
}

/** Locale-stable short timestamp. Returns "—" for missing values. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
