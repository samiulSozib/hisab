import { describe, expect, it } from "vitest";
import {
  accruedSimpleInterest,
  allocatePayment,
  calculateEmi,
  generateSchedule,
  installmentStatus,
  installmentsNeeded,
  periodicRate,
  rescheduleRemaining,
  summarizeSchedule,
} from "@/lib/finance/loan-math";
import { parseDateOnly, toDateOnly } from "@/lib/dates";

const first = parseDateOnly("2026-12-05");

describe("calculateEmi", () => {
  it("matches the standard amortization formula", () => {
    // 1,00,000 @ 12% p.a. for 12 months → 8,884.88
    expect(calculateEmi(100000, periodicRate(12, "MONTHLY"), 12).toFixed(2)).toBe("8884.88");
    // 5,00,000 @ 9% p.a. for 60 months → 10,379.18
    expect(calculateEmi(500000, periodicRate(9, "MONTHLY"), 60).toFixed(2)).toBe("10379.18");
    // 20,00,000 @ 10.5% p.a. for 240 months → 19,967.60
    expect(calculateEmi(2000000, periodicRate("10.5", "MONTHLY"), 240).toFixed(2)).toBe("19967.60");
  });

  it("divides principal evenly when interest is zero", () => {
    expect(calculateEmi(120000, 0, 12).toFixed(2)).toBe("10000.00");
    expect(calculateEmi(100000, 0, 3).toFixed(2)).toBe("33333.33");
  });

  it("rejects invalid input", () => {
    expect(() => calculateEmi(0, 0.01, 12)).toThrow();
    expect(() => calculateEmi(1000, 0.01, 0)).toThrow();
    expect(() => calculateEmi(1000, -0.01, 12)).toThrow();
  });
});

describe("generateSchedule (reducing balance)", () => {
  const rows = generateSchedule({
    principal: 100000,
    annualRate: 12,
    installments: 12,
    firstDueDate: first,
    frequency: "MONTHLY",
    method: "REDUCING_BALANCE",
  });

  it("produces n rows that fully repay the principal", () => {
    expect(rows).toHaveLength(12);
    expect(rows.at(-1)!.closingBalance.toFixed(2)).toBe("0.00");
    const s = summarizeSchedule(rows);
    expect(s.totalPrincipal.toFixed(2)).toBe("100000.00");
    expect(s.totalPayment.toFixed(2)).toBe(s.totalPrincipal.plus(s.totalInterest).toFixed(2));
  });

  it("computes interest on the reducing balance", () => {
    expect(rows[0].interest.toFixed(2)).toBe("1000.00");
    expect(rows[0].principal.toFixed(2)).toBe("7884.88");
    expect(rows[1].interest.toFixed(2)).toBe("921.15");
    expect(rows[0].payment.toFixed(2)).toBe("8884.88");
    // last installment absorbs rounding
    expect(rows[11].payment.minus("8884.88").abs().lessThan(1)).toBe(true);
    expect(summarizeSchedule(rows).totalInterest.toFixed(2)).toBe("6618.53");
  });

  it("assigns monthly due dates", () => {
    expect(toDateOnly(rows[0].dueDate)).toBe("2026-12-05");
    expect(toDateOnly(rows[11].dueDate)).toBe("2027-11-05");
  });

  it("handles interest-free EMI with rounding on the last installment", () => {
    const r = generateSchedule({ principal: 100000, annualRate: 0, installments: 3, firstDueDate: first, frequency: "MONTHLY", method: "REDUCING_BALANCE" });
    expect(r.map((x) => x.payment.toFixed(2))).toEqual(["33333.33", "33333.33", "33333.34"]);
    expect(summarizeSchedule(r).totalInterest.toFixed(2)).toBe("0.00");
  });

  it("supports a merchant-quoted installment amount", () => {
    const r = generateSchedule({ principal: 60000, annualRate: 0, installments: 6, firstDueDate: first, frequency: "MONTHLY", method: "NONE", installmentAmount: 12000 });
    expect(r).toHaveLength(5); // paid off early because installment is larger than P/n
    expect(r.at(-1)!.closingBalance.toFixed(2)).toBe("0.00");
  });

  it("rejects an installment that cannot cover interest", () => {
    expect(() =>
      generateSchedule({ principal: 100000, annualRate: 24, installments: 12, firstDueDate: first, frequency: "MONTHLY", method: "REDUCING_BALANCE", installmentAmount: 1000 }),
    ).toThrow(/too small/);
  });
});

describe("generateSchedule (flat rate)", () => {
  it("spreads flat interest evenly", () => {
    const r = generateSchedule({ principal: 100000, annualRate: 10, installments: 12, firstDueDate: first, frequency: "MONTHLY", method: "FLAT_RATE" });
    const s = summarizeSchedule(r);
    expect(s.totalInterest.toFixed(2)).toBe("10000.00");
    expect(s.totalPrincipal.toFixed(2)).toBe("100000.00");
    expect(r[0].interest.toFixed(2)).toBe("833.33");
    expect(r[11].interest.toFixed(2)).toBe("833.37");
    expect(r[11].closingBalance.toFixed(2)).toBe("0.00");
  });
});

describe("installmentsNeeded / reschedule", () => {
  it("inverts the EMI formula", () => {
    expect(installmentsNeeded(100000, periodicRate(12, "MONTHLY"), "8884.88")).toBe(12);
    expect(installmentsNeeded(100000, 0, 30000)).toBe(4);
  });

  it("keeps the installment and shortens the term after a prepayment", () => {
    const rows = rescheduleRemaining({
      outstandingPrincipal: 50000,
      annualRate: 12,
      method: "REDUCING_BALANCE",
      frequency: "MONTHLY",
      nextDueDate: first,
      nextNumber: 5,
      remainingInstallments: 8,
      currentInstallmentAmount: "8884.88",
      mode: "KEEP_INSTALLMENT",
    });
    expect(rows[0].number).toBe(5);
    expect(rows.length).toBeLessThan(8);
    expect(rows.at(-1)!.closingBalance.toFixed(2)).toBe("0.00");
  });

  it("keeps the term and lowers the installment", () => {
    const rows = rescheduleRemaining({
      outstandingPrincipal: 50000,
      annualRate: 12,
      method: "REDUCING_BALANCE",
      frequency: "MONTHLY",
      nextDueDate: first,
      nextNumber: 5,
      remainingInstallments: 8,
      currentInstallmentAmount: "8884.88",
      mode: "KEEP_TERM",
    });
    expect(rows).toHaveLength(8);
    expect(rows[0].payment.lessThan("8884.88")).toBe(true);
  });
});

describe("allocatePayment", () => {
  it("applies fee → interest → principal", () => {
    const a = allocatePayment({ amount: "9000", fee: "100", interestDue: "1000", outstandingPrincipal: "100000" });
    expect([a.fee.toFixed(2), a.interest.toFixed(2), a.principal.toFixed(2)]).toEqual(["100.00", "1000.00", "7900.00"]);
  });

  it("partial payment covers interest first", () => {
    const a = allocatePayment({ amount: "600", interestDue: "1000", outstandingPrincipal: "100000" });
    expect([a.interest.toFixed(2), a.principal.toFixed(2)]).toEqual(["600.00", "0.00"]);
  });

  it("rejects overpayment beyond outstanding", () => {
    expect(() => allocatePayment({ amount: "5000", interestDue: "0", outstandingPrincipal: "4000" })).toThrow(/exceeds/);
  });

  it("validates manual overrides", () => {
    const a = allocatePayment({ amount: "1000", interestDue: "0", outstandingPrincipal: "5000", override: { principal: "800", interest: "200" } });
    expect(a.principal.toFixed(2)).toBe("800.00");
    expect(() => allocatePayment({ amount: "1000", interestDue: "0", outstandingPrincipal: "5000", override: { principal: "800", interest: "100" } })).toThrow();
  });
});

describe("misc", () => {
  it("accrues simple interest actual/365", () => {
    expect(accruedSimpleInterest(100000, 12, parseDateOnly("2026-01-01"), parseDateOnly("2027-01-01")).toFixed(2)).toBe("12000.00");
    expect(accruedSimpleInterest(100000, 12, parseDateOnly("2026-01-01"), parseDateOnly("2026-01-31")).toFixed(2)).toBe("986.30");
  });

  it("derives installment status", () => {
    expect(installmentStatus("0", "1000")).toBe("PENDING");
    expect(installmentStatus("500", "1000")).toBe("PARTIAL");
    expect(installmentStatus("1000", "1000")).toBe("PAID");
    expect(installmentStatus("0", "1000", "MISSED")).toBe("MISSED");
  });
});
