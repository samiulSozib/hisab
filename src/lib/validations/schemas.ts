import { z } from "zod";
import { d } from "@/lib/money";
import {
  ACCOUNT_TYPES,
  INTEREST_METHODS,
  PAYMENT_FREQUENCIES,
  RECURRING_FREQUENCIES,
} from "@/lib/constants";
import {
  dateOnly,
  id,
  money,
  optionalDateOnly,
  optionalId,
  optionalMoney,
  optionalPositiveInt,
  optionalText,
  positiveInt,
  rate,
  text,
} from "./common";

// ───────────── Auth & profile ─────────────

const password = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password is too long")
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/\d/, "Password must contain a number");

const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address")).pipe(z.string().max(254));

export const registerSchema = z
  .object({
    name: text(80, "Name"),
    email,
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(128),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    token: z.string().min(20).max(200),
    password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

export const profileSchema = z.object({
  name: text(80, "Name"),
  timezone: z.string().trim().min(1).max(64),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Current password is required"),
    newPassword: password,
    confirmPassword: z.string(),
  })
  .refine((v) => v.newPassword === v.confirmPassword, { path: ["confirmPassword"], message: "Passwords do not match" });

// ───────────── Accounts ─────────────

export const accountSchema = z.object({
  name: text(60, "Account name"),
  type: z.enum(ACCOUNT_TYPES),
  institution: optionalText(80),
  description: optionalText(300),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  openingBalance: money({ allowZero: true, allowNegative: true }),
  openingDate: dateOnly,
  includeInNetWorth: z.boolean(),
});

export const transferSchema = z
  .object({
    fromAccountId: id,
    toAccountId: id,
    amount: money(),
    date: dateOnly,
    description: optionalText(300),
    reference: optionalText(80),
  })
  .refine((v) => v.fromAccountId !== v.toAccountId, { path: ["toAccountId"], message: "Choose a different account" });

export const adjustmentSchema = z.object({
  accountId: id,
  actualBalance: money({ allowZero: true, allowNegative: true }),
  date: dateOnly,
  description: optionalText(300),
});

// ───────────── Categories ─────────────

export const categorySchema = z.object({
  name: text(50, "Category name"),
  kind: z.enum(["INCOME", "EXPENSE"]),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});

// ───────────── Income / expense ─────────────

export const cashflowSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: money(),
  date: dateOnly,
  accountId: id,
  categoryId: id,
  counterparty: optionalText(100),
  reference: optionalText(80),
  description: optionalText(500),
});

export const recurringSchema = z
  .object({
    type: z.enum(["INCOME", "EXPENSE"]),
    amount: money(),
    accountId: id,
    categoryId: id,
    counterparty: optionalText(100),
    description: optionalText(500),
    frequency: z.enum(RECURRING_FREQUENCIES),
    interval: positiveInt("Interval", 52),
    startDate: dateOnly,
    endDate: optionalDateOnly,
    isActive: z.boolean(),
  })
  .refine((v) => !v.endDate || v.endDate >= v.startDate, { path: ["endDate"], message: "End date must be after the start date" });

// ───────────── Loans ─────────────

export const personalLoanSchema = z.object({
  title: text(100, "Title"),
  counterparty: text(100, "Person's name"),
  direction: z.enum(["BORROWED", "LENT"]),
  principal: money(),
  startDate: dateOnly,
  interestRate: rate,
  repaymentTerms: optionalText(500),
  dueDate: optionalDateOnly,
  accountId: id,
  description: optionalText(1000),
  /** If false, the principal is recorded without moving money (e.g. an old loan being imported). */
  recordCashFlow: z.boolean(),
});

const scheduleFields = {
  interestRate: rate,
  interestMethod: z.enum(INTEREST_METHODS),
  frequency: z.enum(PAYMENT_FREQUENCIES),
  installmentCount: positiveInt("Number of installments"),
  firstPaymentDate: dateOnly,
};

export const emiLoanSchema = z
  .object({
    title: text(100, "Title"),
    counterparty: text(100, "Merchant / lender"),
    purchasePrice: money(),
    downPayment: optionalMoney(),
    installmentAmount: optionalMoney({ allowZero: false }),
    startDate: dateOnly,
    accountId: id,
    purchaseCategoryId: optionalId,
    finalPaymentDate: optionalDateOnly,
    description: optionalText(1000),
    /** Record the purchase as an expense (full price) — recommended. */
    recordPurchase: z.boolean(),
    ...scheduleFields,
  })
  .superRefine((v, ctx) => {
    if (d(v.downPayment ?? "0").greaterThanOrEqualTo(d(v.purchasePrice))) ctx.addIssue({ code: "custom", path: ["downPayment"], message: "Down payment must be less than the purchase price" });
    if (v.firstPaymentDate < v.startDate) ctx.addIssue({ code: "custom", path: ["firstPaymentDate"], message: "First installment cannot be before the purchase date" });
  });

export const bankLoanSchema = z
  .object({
    title: text(100, "Title"),
    counterparty: text(100, "Bank name"),
    loanType: optionalText(60),
    referenceNumber: optionalText(60),
    principal: money(),
    startDate: dateOnly,
    termMonths: optionalPositiveInt("Loan term (months)"),
    installmentAmount: optionalMoney({ allowZero: false }),
    processingFee: optionalMoney(),
    accountId: id,
    description: optionalText(1000),
    recordCashFlow: z.boolean(),
    ...scheduleFields,
  })
  .superRefine((v, ctx) => {
    if (v.firstPaymentDate < v.startDate) ctx.addIssue({ code: "custom", path: ["firstPaymentDate"], message: "First payment cannot be before the loan start date" });
  });

export const loanUpdateSchema = z.object({
  title: text(100, "Title"),
  counterparty: text(100, "Counterparty"),
  repaymentTerms: optionalText(500),
  dueDate: optionalDateOnly,
  referenceNumber: optionalText(60),
  description: optionalText(1000),
});

export const loanPaymentSchema = z
  .object({
    amount: money(),
    date: dateOnly,
    accountId: id,
    installmentId: optionalId,
    fee: optionalMoney(),
    splitMode: z.enum(["auto", "manual"]),
    principalAmount: optionalMoney(),
    interestAmount: optionalMoney(),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.splitMode === "manual" && (v.principalAmount === undefined || v.interestAmount === undefined)) {
      ctx.addIssue({ code: "custom", path: ["principalAmount"], message: "Enter both principal and interest" });
    }
  });

export const rescheduleSchema = z.object({
  mode: z.enum(["KEEP_TERM", "KEEP_INSTALLMENT"]),
});

export const installmentUpdateSchema = z.object({
  status: z.enum(["PENDING", "MISSED", "WAIVED"]),
  dueDate: dateOnly,
  notes: optionalText(300),
});

// ───────────── Filters (URL search params) ─────────────

export const transactionFilterSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  type: z.enum(["INCOME", "EXPENSE", "TRANSFER", "LOAN_RECEIVED", "LOAN_GIVEN", "LOAN_REPAYMENT", "LOAN_COLLECTION", "EMI_PAYMENT", "OPENING_BALANCE", "ADJUSTMENT"]).optional().catch(undefined),
  accountId: z.string().max(64).optional().catch(undefined),
  categoryId: z.string().max(64).optional().catch(undefined),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().catch(undefined),
  min: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().catch(undefined),
  max: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().catch(undefined),
  sort: z.enum(["date_desc", "date_asc", "amount_desc", "amount_asc"]).catch("date_desc"),
  page: z.coerce.number().int().min(1).max(10000).catch(1),
});

export type TransactionFilters = z.output<typeof transactionFilterSchema>;

export type RegisterInput = z.input<typeof registerSchema>;
export type LoginInput = z.input<typeof loginSchema>;
export type AccountInput = z.input<typeof accountSchema>;
export type TransferInput = z.input<typeof transferSchema>;
export type AdjustmentInput = z.input<typeof adjustmentSchema>;
export type CategoryInput = z.input<typeof categorySchema>;
export type CashflowInput = z.input<typeof cashflowSchema>;
export type RecurringInput = z.input<typeof recurringSchema>;
export type PersonalLoanInput = z.input<typeof personalLoanSchema>;
export type EmiLoanInput = z.input<typeof emiLoanSchema>;
export type BankLoanInput = z.input<typeof bankLoanSchema>;
export type LoanPaymentInput = z.input<typeof loanPaymentSchema>;

// ───────────── Service input types ─────────────

type UndefinedKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T];
type Simplify<T> = { [K in keyof T]: T[K] } & {};
/** Validated (Zod output) data with `T | undefined` fields made optional — what services accept. */
export type ServiceInput<S extends z.ZodType> = Simplify<
  Omit<z.output<S>, UndefinedKeys<z.output<S>>> & Partial<Pick<z.output<S>, UndefinedKeys<z.output<S>>>>
>;
