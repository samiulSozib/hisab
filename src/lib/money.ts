import Decimal from "decimal.js";

/**
 * Decimal-safe money helpers. All financial arithmetic in Hisab goes through decimal.js —
 * never through JavaScript floating point numbers.
 *
 * This module is isomorphic (safe to import from client components).
 */
export const MoneyDecimal = Decimal.clone({
  precision: 40,
  rounding: Decimal.ROUND_HALF_UP,
  toExpNeg: -30,
  toExpPos: 40,
});
export type MoneyDecimal = InstanceType<typeof MoneyDecimal>;

/** Anything that can be turned into a Decimal: number literal, numeric string, Prisma.Decimal, decimal.js. */
export type MoneyLike = string | number | { toString(): string } | null | undefined;

export const ZERO = new MoneyDecimal(0);

export function d(value: MoneyLike): MoneyDecimal {
  if (value === null || value === undefined || value === "") return new MoneyDecimal(0);
  if (value instanceof MoneyDecimal) return value;
  return new MoneyDecimal(typeof value === "number" ? value : value.toString());
}

/** Round to 2 decimal places, half-up (banking convention used by BD lenders). */
export function round2(value: MoneyLike): MoneyDecimal {
  return d(value).toDecimalPlaces(2, MoneyDecimal.ROUND_HALF_UP);
}

/** Canonical string for persisting into NUMERIC(18,2) columns. */
export function toMoneyString(value: MoneyLike): string {
  return round2(value).toFixed(2);
}

export function sum(values: Iterable<MoneyLike>): MoneyDecimal {
  let total = new MoneyDecimal(0);
  for (const v of values) total = total.plus(d(v));
  return total;
}

export function min(a: MoneyLike, b: MoneyLike): MoneyDecimal {
  return MoneyDecimal.min(d(a), d(b));
}

export function max(a: MoneyLike, b: MoneyLike): MoneyDecimal {
  return MoneyDecimal.max(d(a), d(b));
}

export function isPositive(value: MoneyLike): boolean {
  return d(value).greaterThan(0);
}

/** Strict validator for user-entered amounts ("1,250.50" → "1250.50"). Returns null if invalid. */
export function parseMoneyInput(raw: string): string | null {
  const cleaned = raw.replace(/[,\s৳]/g, "");
  if (!/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return new MoneyDecimal(cleaned).toFixed(2);
}

// ───────────── Formatting (Bangladeshi Taka, lakh/crore digit grouping) ─────────────

const formatters = new Map<string, Intl.NumberFormat>();

function getFormatter(fractionDigits: number, compact: boolean): Intl.NumberFormat {
  const key = `${fractionDigits}-${compact}`;
  let f = formatters.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-IN", {
      minimumFractionDigits: compact ? 0 : fractionDigits,
      maximumFractionDigits: fractionDigits,
      ...(compact ? { notation: "compact", compactDisplay: "short" } : {}),
    });
    formatters.set(key, f);
  }
  return f;
}

export type FormatMoneyOptions = {
  /** Show the ৳ symbol (default true). */
  symbol?: boolean;
  /** Number of decimals (default 2). */
  decimals?: number;
  /** Compact notation, e.g. ৳1.2L style ("1.2L" isn't standard Intl, so we use K/M/B/T). */
  compact?: boolean;
  /** Always show a leading +/− sign. */
  signed?: boolean;
};

/** Format as Bangladeshi Taka, e.g. `৳ 1,25,000.00`. */
export function formatMoney(value: MoneyLike, opts: FormatMoneyOptions = {}): string {
  const { symbol = true, decimals = 2, compact = false, signed = false } = opts;
  const v = d(value).toDecimalPlaces(decimals, MoneyDecimal.ROUND_HALF_UP);
  const abs = v.abs().toFixed(decimals);
  // Intl.NumberFormat#format accepts numeric strings exactly (no float conversion).
  const body = getFormatter(decimals, compact).format(abs as `${number}`);
  const sign = v.isNegative() && !v.isZero() ? "−" : signed && v.greaterThan(0) ? "+" : "";
  return `${sign}${symbol ? "৳" : ""}${body}`;
}

export function formatPercent(value: MoneyLike, decimals = 1): string {
  return `${d(value).toDecimalPlaces(decimals).toFixed(decimals)}%`;
}
