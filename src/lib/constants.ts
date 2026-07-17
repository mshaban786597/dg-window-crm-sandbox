/**
 * Backwards-compatible constants surface.
 *
 * All window-domain taxonomy now lives in `@/lib/domain` (the single
 * source of truth). This module re-exports it so existing imports keep
 * working, and adds a couple of legacy aliases used across the app.
 */
export * from "./domain";

import {
  APP,
  DEFAULT_COMPANY,
  MEASUREMENT_STATUSES,
  MEASUREMENT_STATUS_LABELS,
} from "./domain";

/**
 * Static product identity. Company-specific details (name, phone, email,
 * service area, review link, tax rate…) are NOT hardcoded here — they are
 * configured and persisted from Settings. See `useSettingsStore`.
 */
export const COMPANY = {
  name: APP.name,
  tagline: APP.subtitle,
  defaults: DEFAULT_COMPANY,
} as const;

// Legacy aliases: the Measurements module still lives at the /estimates
// route internally, so keep the old constant names pointing at the new
// measurement taxonomy.
export const ESTIMATE_STATUSES = MEASUREMENT_STATUSES;
export const ESTIMATE_STATUS_LABELS = MEASUREMENT_STATUS_LABELS;

export const CUSTOMER_TYPES = ["new", "returning", "commercial", "referral"] as const;
