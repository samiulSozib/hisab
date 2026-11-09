/**
 * Date-only helpers. Financial dates are stored as PostgreSQL DATE columns and handled in the app
 * as UTC-midnight `Date` objects or `YYYY-MM-DD` strings, so no time-zone drift can move a
 * transaction to a different day.
 *
 * Isomorphic — safe for client components.
 */

export const DEFAULT_TIMEZONE = "Asia/Dhaka";

export type Frequency = "DAILY" | "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnlyString(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const dt = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(dt.getTime()) && dt.toISOString().startsWith(value);
}

/** "2026-11-09" → Date(2026-11-09T00:00:00Z) */
export function parseDateOnly(value: string): Date {
  if (!isDateOnlyString(value)) throw new Error(`Invalid date: ${value}`);
  return new Date(`${value}T00:00:00.000Z`);
}

/** Date → "YYYY-MM-DD" (UTC calendar day). */
export function toDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in the given time zone as "YYYY-MM-DD". */
export function todayString(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function today(timeZone: string = DEFAULT_TIMEZONE, now: Date = new Date()): Date {
  return parseDateOnly(todayString(timeZone, now));
}

function daysInMonthUTC(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

export function addDays(date: Date, days: number): Date {
  const r = new Date(date.getTime());
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

/**
 * Add calendar months, clamping to the end of month (Jan 31 + 1 month = Feb 28/29).
 * `anchorDay` keeps the original day-of-month for schedules (Jan 31 → Feb 28 → Mar 31).
 */
export function addMonths(date: Date, months: number, anchorDay?: number): Date {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + months;
  const targetYear = y + Math.floor(m / 12);
  const targetMonth = ((m % 12) + 12) % 12;
  const day = Math.min(anchorDay ?? date.getUTCDate(), daysInMonthUTC(targetYear, targetMonth));
  return new Date(Date.UTC(targetYear, targetMonth, day));
}

/** The n-th occurrence date of a schedule starting at `start` (n = 0 → start). */
export function addPeriods(start: Date, frequency: Frequency, n: number, interval = 1): Date {
  const steps = n * interval;
  switch (frequency) {
    case "DAILY":
      return addDays(start, steps);
    case "WEEKLY":
      return addDays(start, steps * 7);
    case "BIWEEKLY":
      return addDays(start, steps * 14);
    case "MONTHLY":
      return addMonths(start, steps, start.getUTCDate());
    case "QUARTERLY":
      return addMonths(start, steps * 3, start.getUTCDate());
    case "YEARLY":
      return addMonths(start, steps * 12, start.getUTCDate());
  }
}

export function periodsPerYear(frequency: Exclude<Frequency, "DAILY">): number {
  switch (frequency) {
    case "WEEKLY":
      return 52;
    case "BIWEEKLY":
      return 26;
    case "MONTHLY":
      return 12;
    case "QUARTERLY":
      return 4;
    case "YEARLY":
      return 1;
  }
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

export function startOfQuarter(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
}

export function endOfQuarter(date: Date): Date {
  return endOfMonth(addMonths(startOfQuarter(date), 2, 1));
}

export function startOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
}

export function endOfYear(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), 11, 31));
}

export function diffInDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/** "YYYY-MM" month key. */
export function monthKey(date: Date): string {
  return toDateOnly(date).slice(0, 7);
}

/** Inclusive list of month starts between two dates. */
export function monthsBetween(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  let cursor = startOfMonth(from);
  const last = startOfMonth(to);
  while (cursor.getTime() <= last.getTime()) {
    out.push(cursor);
    cursor = addMonths(cursor, 1, 1);
  }
  return out;
}

// ───────────── Formatting ─────────────

const dateFmt = new Intl.DateTimeFormat("en-GB", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const monthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
const shortMonthFmt = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });

function asDate(value: Date | string): Date {
  return typeof value === "string" ? (isDateOnlyString(value) ? parseDateOnly(value) : new Date(value)) : value;
}

/** 09 Nov 2026 */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return "—";
  return dateFmt.format(asDate(value));
}

/** Nov 2026 */
export function formatMonth(value: Date | string): string {
  return monthFmt.format(asDate(value));
}

/** Nov */
export function formatShortMonth(value: Date | string): string {
  return shortMonthFmt.format(asDate(value));
}

/** Timestamp in the user's zone, e.g. "09 Nov 2026, 14:05" */
export function formatDateTime(value: Date | string, timeZone: string = DEFAULT_TIMEZONE): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(typeof value === "string" ? new Date(value) : value);
}

// ───────────── Reporting periods ─────────────

export type PeriodPreset = "month" | "quarter" | "year" | "custom" | "last30" | "last12m";

export type ResolvedPeriod = {
  preset: PeriodPreset;
  from: Date;
  to: Date;
  label: string;
};

export function resolvePeriod(
  input: { period?: string | null; from?: string | null; to?: string | null },
  todayDate: Date,
): ResolvedPeriod {
  const preset = (input.period ?? "month") as PeriodPreset;
  switch (preset) {
    case "quarter": {
      const from = startOfQuarter(todayDate);
      return { preset, from, to: endOfQuarter(todayDate), label: `Q${Math.floor(from.getUTCMonth() / 3) + 1} ${from.getUTCFullYear()}` };
    }
    case "year":
      return { preset, from: startOfYear(todayDate), to: endOfYear(todayDate), label: `${todayDate.getUTCFullYear()}` };
    case "last30":
      return { preset, from: addDays(todayDate, -29), to: todayDate, label: "Last 30 days" };
    case "last12m": {
      const from = startOfMonth(addMonths(todayDate, -11, 1));
      return { preset, from, to: endOfMonth(todayDate), label: "Last 12 months" };
    }
    case "custom": {
      if (input.from && input.to && isDateOnlyString(input.from) && isDateOnlyString(input.to)) {
        let from = parseDateOnly(input.from);
        let to = parseDateOnly(input.to);
        if (from > to) [from, to] = [to, from];
        return { preset, from, to, label: `${formatDate(from)} – ${formatDate(to)}` };
      }
      return resolvePeriod({ period: "month" }, todayDate);
    }
    case "month":
    default:
      return { preset: "month", from: startOfMonth(todayDate), to: endOfMonth(todayDate), label: formatMonth(todayDate) };
  }
}
