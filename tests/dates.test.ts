import { describe, expect, it } from "vitest";
import { addMonths, addPeriods, isDateOnlyString, parseDateOnly, resolvePeriod, toDateOnly, todayString } from "@/lib/dates";

describe("dates", () => {
  it("validates date-only strings", () => {
    expect(isDateOnlyString("2026-02-28")).toBe(true);
    expect(isDateOnlyString("2026-02-30")).toBe(false);
    expect(isDateOnlyString("2026-2-3")).toBe(false);
  });

  it("clamps month ends and keeps the anchor day", () => {
    const jan31 = parseDateOnly("2027-01-31");
    expect(toDateOnly(addMonths(jan31, 1))).toBe("2027-02-28");
    expect(toDateOnly(addPeriods(jan31, "MONTHLY", 2))).toBe("2027-03-31");
    expect(toDateOnly(addPeriods(parseDateOnly("2028-01-31"), "MONTHLY", 1))).toBe("2028-02-29");
    expect(toDateOnly(addPeriods(parseDateOnly("2026-11-30"), "MONTHLY", 3))).toBe("2027-02-28");
    expect(toDateOnly(addPeriods(parseDateOnly("2026-11-09"), "QUARTERLY", 1))).toBe("2027-02-09");
    expect(toDateOnly(addPeriods(parseDateOnly("2026-11-09"), "WEEKLY", 2))).toBe("2026-11-23");
  });

  it("computes today in Asia/Dhaka", () => {
    // 2026-11-09T20:00Z is already 10 Nov in Dhaka (UTC+6)
    expect(todayString("Asia/Dhaka", new Date("2026-11-09T20:00:00Z"))).toBe("2026-11-10");
  });

  it("resolves reporting periods", () => {
    const t = parseDateOnly("2026-11-09");
    const m = resolvePeriod({ period: "month" }, t);
    expect([toDateOnly(m.from), toDateOnly(m.to)]).toEqual(["2026-11-01", "2026-11-30"]);
    const q = resolvePeriod({ period: "quarter" }, t);
    expect([toDateOnly(q.from), toDateOnly(q.to)]).toEqual(["2026-10-01", "2026-12-31"]);
    const y = resolvePeriod({ period: "year" }, t);
    expect([toDateOnly(y.from), toDateOnly(y.to)]).toEqual(["2026-01-01", "2026-12-31"]);
    const c = resolvePeriod({ period: "custom", from: "2026-12-01", to: "2026-06-01" }, t);
    expect([toDateOnly(c.from), toDateOnly(c.to)]).toEqual(["2026-06-01", "2026-12-01"]);
  });
});
