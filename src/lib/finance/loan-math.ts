/**
 * Loan calculation engine (pure functions, decimal-safe, fully unit tested).
 *
 * Supported interest methods
 *  - NONE              interest-free; principal split evenly (last installment absorbs rounding).
 *  - REDUCING_BALANCE  standard amortizing loan: EMI = P·r·(1+r)^n / ((1+r)^n − 1).
 *  - FLAT_RATE         interest = P × annual rate × term (years), spread evenly over installments.
 *  - SIMPLE            same schedule maths as FLAT_RATE; for personal loans without a schedule the
 *                      principal / interest split is entered per repayment.
 *
 * NOT supported (documented in README): daily-reducing balance, variable / floating rates,
 * compounding frequencies different from the payment frequency, balloon payments, moratoriums.
 */
import { d, MoneyDecimal, round2, ZERO, type MoneyLike } from "@/lib/money";
import { addPeriods, periodsPerYear, diffInDays } from "@/lib/dates";

export type PaymentFrequency = "WEEKLY" | "BIWEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY";
export type InterestMethod = "NONE" | "REDUCING_BALANCE" | "FLAT_RATE" | "SIMPLE";

export class LoanMathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoanMathError";
  }
}

/** Interest rate per payment period as a fraction (9% p.a. monthly → 0.0075). */
export function periodicRate(annualRatePercent: MoneyLike, frequency: PaymentFrequency): MoneyDecimal {
  return d(annualRatePercent).dividedBy(100).dividedBy(periodsPerYear(frequency));
}

/**
 * Equated installment for a fixed-rate amortizing loan, rounded half-up to 2 dp.
 * If the rate is zero the EMI is simply P / n.
 */
export function calculateEmi(principal: MoneyLike, ratePerPeriod: MoneyLike, installments: number): MoneyDecimal {
  const P = d(principal);
  const r = d(ratePerPeriod);
  if (!Number.isInteger(installments) || installments <= 0) {
    throw new LoanMathError("Number of installments must be a positive integer");
  }
  if (P.lessThanOrEqualTo(0)) throw new LoanMathError("Principal must be greater than zero");
  if (r.isNegative()) throw new LoanMathError("Interest rate cannot be negative");
  if (r.isZero()) return round2(P.dividedBy(installments));
  const factor = r.plus(1).pow(installments);
  return round2(P.times(r).times(factor).dividedBy(factor.minus(1)));
}

export type ScheduleRow = {
  number: number;
  dueDate: Date;
  openingBalance: MoneyDecimal;
  payment: MoneyDecimal;
  principal: MoneyDecimal;
  interest: MoneyDecimal;
  closingBalance: MoneyDecimal;
};

export type ScheduleInput = {
  principal: MoneyLike;
  /** Annual percentage, e.g. 12.5 */
  annualRate: MoneyLike;
  installments: number;
  firstDueDate: Date;
  frequency: PaymentFrequency;
  method: InterestMethod;
  /** Optional fixed installment (e.g. EMI quoted by the merchant). Reducing-balance / interest-free only. */
  installmentAmount?: MoneyLike;
  /** Number of the first generated row (used when re-scheduling remaining installments). */
  startNumber?: number;
};

export function generateSchedule(input: ScheduleInput): ScheduleRow[] {
  const P = round2(input.principal);
  const n = input.installments;
  const startNumber = input.startNumber ?? 1;
  if (!Number.isInteger(n) || n <= 0) throw new LoanMathError("Number of installments must be a positive integer");
  if (n > 1200) throw new LoanMathError("Too many installments (max 1200)");
  if (P.lessThanOrEqualTo(0)) throw new LoanMathError("Principal must be greater than zero");
  const rate = d(input.annualRate);
  if (rate.isNegative()) throw new LoanMathError("Interest rate cannot be negative");

  const method: InterestMethod = rate.isZero() ? "NONE" : input.method;
  const dueDate = (i: number) => addPeriods(input.firstDueDate, input.frequency, i);

  if (method === "FLAT_RATE" || method === "SIMPLE") {
    const years = new MoneyDecimal(n).dividedBy(periodsPerYear(input.frequency));
    const totalInterest = round2(P.times(rate).dividedBy(100).times(years));
    const principalPer = round2(P.dividedBy(n));
    const interestPer = round2(totalInterest.dividedBy(n));
    const rows: ScheduleRow[] = [];
    let balance = P;
    let interestLeft = totalInterest;
    for (let i = 0; i < n; i++) {
      const last = i === n - 1;
      const principal = last ? balance : MoneyDecimal.min(principalPer, balance);
      const interest = last ? interestLeft : MoneyDecimal.min(interestPer, interestLeft);
      const closing = balance.minus(principal);
      rows.push({
        number: startNumber + i,
        dueDate: dueDate(i),
        openingBalance: balance,
        payment: principal.plus(interest),
        principal,
        interest,
        closingBalance: closing,
      });
      balance = closing;
      interestLeft = interestLeft.minus(interest);
    }
    return rows;
  }

  // REDUCING_BALANCE or NONE
  const r = method === "NONE" ? ZERO : periodicRate(rate, input.frequency);
  const emi =
    input.installmentAmount !== undefined && input.installmentAmount !== null && d(input.installmentAmount).greaterThan(0)
      ? round2(input.installmentAmount)
      : calculateEmi(P, r, n);

  const rows: ScheduleRow[] = [];
  let balance = P;
  for (let i = 0; i < n && balance.greaterThan(0); i++) {
    const interest = round2(balance.times(r));
    let principal = emi.minus(interest);
    if (principal.lessThanOrEqualTo(0)) {
      throw new LoanMathError("Installment amount is too small to cover the interest for the period");
    }
    const last = i === n - 1;
    if (last || principal.greaterThanOrEqualTo(balance)) principal = balance;
    const closing = balance.minus(principal);
    rows.push({
      number: startNumber + i,
      dueDate: dueDate(i),
      openingBalance: balance,
      payment: principal.plus(interest),
      principal,
      interest,
      closingBalance: closing,
    });
    balance = closing;
  }
  return rows;
}

export type ScheduleSummary = {
  installments: number;
  totalPayment: MoneyDecimal;
  totalPrincipal: MoneyDecimal;
  totalInterest: MoneyDecimal;
  firstPayment: MoneyDecimal;
  lastDueDate: Date | null;
};

export function summarizeSchedule(rows: ScheduleRow[]): ScheduleSummary {
  let totalPayment = ZERO;
  let totalPrincipal = ZERO;
  let totalInterest = ZERO;
  for (const row of rows) {
    totalPayment = totalPayment.plus(row.payment);
    totalPrincipal = totalPrincipal.plus(row.principal);
    totalInterest = totalInterest.plus(row.interest);
  }
  return {
    installments: rows.length,
    totalPayment,
    totalPrincipal,
    totalInterest,
    firstPayment: rows[0]?.payment ?? ZERO,
    lastDueDate: rows.at(-1)?.dueDate ?? null,
  };
}

/**
 * Number of installments of `installmentAmount` needed to repay `principal` at `ratePerPeriod`.
 * n = −ln(1 − r·P/A) / ln(1 + r), rounded up.
 */
export function installmentsNeeded(principal: MoneyLike, ratePerPeriod: MoneyLike, installmentAmount: MoneyLike): number {
  const P = d(principal);
  const r = d(ratePerPeriod);
  const A = d(installmentAmount);
  if (A.lessThanOrEqualTo(0)) throw new LoanMathError("Installment amount must be greater than zero");
  if (P.lessThanOrEqualTo(0)) return 0;
  if (r.isZero()) return P.dividedBy(A).ceil().toNumber();
  const ratio = r.times(P).dividedBy(A);
  if (ratio.greaterThanOrEqualTo(1)) {
    throw new LoanMathError("Installment amount is too small to cover the interest for the period");
  }
  const n = new MoneyDecimal(1).minus(ratio).ln().negated().dividedBy(r.plus(1).ln());
  // Guard against representation noise (e.g. 11.9999999999 → 12).
  return n.minus("1e-9").ceil().toNumber();
}

export type RescheduleMode = "KEEP_TERM" | "KEEP_INSTALLMENT";

export type RescheduleInput = {
  outstandingPrincipal: MoneyLike;
  annualRate: MoneyLike;
  method: InterestMethod;
  frequency: PaymentFrequency;
  nextDueDate: Date;
  nextNumber: number;
  remainingInstallments: number;
  currentInstallmentAmount: MoneyLike;
  mode: RescheduleMode;
};

/**
 * Rebuild the remaining schedule after a prepayment or missed payment.
 *  - KEEP_TERM:         same number of remaining installments, new (usually lower) installment.
 *  - KEEP_INSTALLMENT:  same installment, fewer (or more) installments.
 */
export function rescheduleRemaining(input: RescheduleInput): ScheduleRow[] {
  const P = round2(input.outstandingPrincipal);
  if (P.lessThanOrEqualTo(0)) return [];
  const method: InterestMethod = d(input.annualRate).isZero() ? "NONE" : input.method;

  if (input.mode === "KEEP_TERM" || method === "FLAT_RATE" || method === "SIMPLE") {
    return generateSchedule({
      principal: P,
      annualRate: input.annualRate,
      installments: Math.max(1, input.remainingInstallments),
      firstDueDate: input.nextDueDate,
      frequency: input.frequency,
      method,
      startNumber: input.nextNumber,
    });
  }

  const r = method === "NONE" ? ZERO : periodicRate(input.annualRate, input.frequency);
  const n = installmentsNeeded(P, r, input.currentInstallmentAmount);
  return generateSchedule({
    principal: P,
    annualRate: input.annualRate,
    installments: Math.max(1, n),
    firstDueDate: input.nextDueDate,
    frequency: input.frequency,
    method,
    installmentAmount: input.currentInstallmentAmount,
    startNumber: input.nextNumber,
  });
}

// ───────────── Payment allocation ─────────────

export type AllocationInput = {
  amount: MoneyLike;
  fee?: MoneyLike;
  /** Interest currently due (unpaid scheduled interest of the installment, or accrued interest). */
  interestDue: MoneyLike;
  outstandingPrincipal: MoneyLike;
  /** Explicit split entered by the user. Must satisfy principal + interest + fee = amount. */
  override?: { principal: MoneyLike; interest: MoneyLike } | null;
};

export type Allocation = {
  amount: MoneyDecimal;
  fee: MoneyDecimal;
  interest: MoneyDecimal;
  principal: MoneyDecimal;
};

/**
 * Split a payment into fee → interest → principal (standard waterfall).
 * Throws if the payment would repay more principal than is outstanding.
 */
export function allocatePayment(input: AllocationInput): Allocation {
  const amount = round2(input.amount);
  const fee = round2(input.fee ?? 0);
  const outstanding = round2(input.outstandingPrincipal);
  if (amount.lessThanOrEqualTo(0)) throw new LoanMathError("Payment amount must be greater than zero");
  if (fee.isNegative()) throw new LoanMathError("Fees cannot be negative");
  if (fee.greaterThan(amount)) throw new LoanMathError("Fees cannot exceed the payment amount");

  if (input.override) {
    const principal = round2(input.override.principal);
    const interest = round2(input.override.interest);
    if (principal.isNegative() || interest.isNegative()) {
      throw new LoanMathError("Principal and interest cannot be negative");
    }
    if (!principal.plus(interest).plus(fee).equals(amount)) {
      throw new LoanMathError("Principal + interest + fees must equal the payment amount");
    }
    if (principal.greaterThan(outstanding)) {
      throw new LoanMathError("Principal portion exceeds the outstanding principal");
    }
    return { amount, fee, interest, principal };
  }

  const afterFee = amount.minus(fee);
  const interestDue = MoneyDecimal.max(round2(input.interestDue), ZERO);
  const interest = MoneyDecimal.min(afterFee, interestDue);
  const principal = afterFee.minus(interest);
  if (principal.greaterThan(outstanding)) {
    throw new LoanMathError(
      `Payment exceeds the amount owed. Maximum payable now is ${outstanding.plus(interest).plus(fee).toFixed(2)}`,
    );
  }
  return { amount, fee, interest, principal };
}

/** Simple interest accrued on a balance between two dates (actual/365). */
export function accruedSimpleInterest(
  principal: MoneyLike,
  annualRatePercent: MoneyLike,
  from: Date,
  to: Date,
): MoneyDecimal {
  const days = Math.max(0, diffInDays(to, from));
  return round2(d(principal).times(d(annualRatePercent)).dividedBy(100).times(days).dividedBy(365));
}

export type InstallmentState = "PENDING" | "PARTIAL" | "PAID" | "MISSED" | "WAIVED";

/** Derive an installment's status from what has been paid against it. */
export function installmentStatus(
  paidAmount: MoneyLike,
  scheduledAmount: MoneyLike,
  current: InstallmentState = "PENDING",
): InstallmentState {
  const paid = d(paidAmount);
  if (paid.greaterThanOrEqualTo(d(scheduledAmount))) return "PAID";
  if (paid.greaterThan(0)) return "PARTIAL";
  return current === "MISSED" || current === "WAIVED" ? current : "PENDING";
}
