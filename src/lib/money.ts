/**
 * Cents-safe money handling.
 *
 * All persisted financial amounts are stored as INTEGER CENTS. Never do
 * floating-point arithmetic on stored money — convert to cents, operate on
 * integers, and only format for display. (§5, §20, §25)
 */

/** Parse a user-entered dollar string/number into integer cents. */
export function toCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === "") return 0;
  const n = typeof input === "number" ? input : parseFloat(String(input).replace(/[^0-9.-]/g, ""));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Convert integer cents back to a dollar number (for input fields). */
export function fromCents(cents: number | null | undefined): number {
  if (!cents) return 0;
  return Math.round(cents) / 100;
}

/** Format integer cents as en-US USD, e.g. 123456 -> "$1,234.56". */
export function formatCents(cents: number | null | undefined, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(fromCents(cents ?? 0));
}

/** Format integer cents with no decimals for compact display (e.g. tables). */
export function formatCentsShort(cents: number | null | undefined, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(fromCents(cents ?? 0));
}

/** Sum a list of cents amounts safely (integer math). */
export function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + Math.round(v ?? 0), 0);
}

/** Multiply a cents unit price by an integer quantity safely. */
export function multiplyCents(unitCents: number, quantity: number): number {
  return Math.round((unitCents || 0) * (quantity || 0));
}
