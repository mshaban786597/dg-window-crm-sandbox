import { describe, it, expect } from "vitest";
import { toCents, fromCents, formatCents, sumCents, multiplyCents } from "@/lib/money";

describe("money (cents-safe)", () => {
  it("parses dollars to integer cents without float drift", () => {
    expect(toCents("19.99")).toBe(1999);
    expect(toCents(0.1 + 0.2)).toBe(30); // 0.30000000000000004 → 30
    expect(toCents("$1,234.56")).toBe(123456);
    expect(toCents("")).toBe(0);
  });
  it("round-trips cents to dollars", () => {
    expect(fromCents(1999)).toBe(19.99);
    expect(fromCents(0)).toBe(0);
  });
  it("formats USD", () => {
    expect(formatCents(123456)).toBe("$1,234.56");
  });
  it("sums and multiplies with integer math", () => {
    expect(sumCents([1999, 1, 2000])).toBe(4000);
    expect(multiplyCents(2499, 3)).toBe(7497);
  });
});
