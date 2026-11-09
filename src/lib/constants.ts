/** Labels and option lists shared by server and client. Values mirror the Prisma enums. */

export const ACCOUNT_TYPES = ["CASH", "BANK", "BKASH", "NAGAD", "ROCKET", "SAVINGS", "CREDIT_CARD", "OTHER"] as const;
export type AccountTypeValue = (typeof ACCOUNT_TYPES)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountTypeValue, string> = {
  CASH: "Cash",
  BANK: "Bank account",
  BKASH: "bKash",
  NAGAD: "Nagad",
  ROCKET: "Rocket",
  SAVINGS: "Savings",
  CREDIT_CARD: "Credit card",
  OTHER: "Other",
};

export const ACCOUNT_COLORS = ["#0f766e", "#2563eb", "#e2136e", "#f97316", "#8b5cf6", "#16a34a", "#dc2626", "#64748b"] as const;

export const DEFAULT_ACCOUNT_COLOR: Record<AccountTypeValue, string> = {
  CASH: "#16a34a",
  BANK: "#2563eb",
  BKASH: "#e2136e",
  NAGAD: "#f97316",
  ROCKET: "#8b5cf6",
  SAVINGS: "#0f766e",
  CREDIT_CARD: "#dc2626",
  OTHER: "#64748b",
};

export const TRANSACTION_TYPES = [
  "INCOME",
  "EXPENSE",
  "TRANSFER",
  "LOAN_RECEIVED",
  "LOAN_GIVEN",
  "LOAN_REPAYMENT",
  "LOAN_COLLECTION",
  "EMI_PAYMENT",
  "OPENING_BALANCE",
  "ADJUSTMENT",
] as const;
export type TransactionTypeValue = (typeof TRANSACTION_TYPES)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionTypeValue, string> = {
  INCOME: "Income",
  EXPENSE: "Expense",
  TRANSFER: "Transfer",
  LOAN_RECEIVED: "Loan received",
  LOAN_GIVEN: "Loan given",
  LOAN_REPAYMENT: "Loan repayment",
  LOAN_COLLECTION: "Loan collection",
  EMI_PAYMENT: "EMI payment",
  OPENING_BALANCE: "Opening balance",
  ADJUSTMENT: "Adjustment",
};

export const LOAN_KIND_LABELS = { PERSONAL: "Personal loan", EMI: "EMI", BANK: "Bank loan" } as const;
export const LOAN_STATUS_LABELS = { ACTIVE: "Active", CLOSED: "Closed", DEFAULTED: "Defaulted" } as const;

export const PAYMENT_FREQUENCIES = ["WEEKLY", "BIWEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export const PAYMENT_FREQUENCY_LABELS: Record<(typeof PAYMENT_FREQUENCIES)[number], string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

export const RECURRING_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY"] as const;
export const RECURRING_FREQUENCY_LABELS: Record<(typeof RECURRING_FREQUENCIES)[number], string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
};

export const INTEREST_METHODS = ["NONE", "REDUCING_BALANCE", "FLAT_RATE", "SIMPLE"] as const;
export const INTEREST_METHOD_LABELS: Record<(typeof INTEREST_METHODS)[number], string> = {
  NONE: "Interest-free",
  REDUCING_BALANCE: "Reducing balance (amortizing)",
  FLAT_RATE: "Flat rate",
  SIMPLE: "Simple interest",
};

export const INSTALLMENT_STATUS_LABELS = {
  PENDING: "Pending",
  PARTIAL: "Partial",
  PAID: "Paid",
  MISSED: "Missed",
  WAIVED: "Waived",
} as const;

export const DEFAULT_INCOME_CATEGORIES = [
  { name: "Salary", color: "#16a34a" },
  { name: "Bonus", color: "#22c55e" },
  { name: "Freelancing", color: "#0ea5e9" },
  { name: "Business", color: "#6366f1" },
  { name: "Interest & Profit", color: "#14b8a6" },
  { name: "Gifts Received", color: "#f59e0b" },
  { name: "Other Income", color: "#64748b" },
] as const;

export const DEFAULT_EXPENSE_CATEGORIES = [
  { name: "Food & Groceries", color: "#f97316" },
  { name: "Rent & Housing", color: "#8b5cf6" },
  { name: "Utilities", color: "#0ea5e9" },
  { name: "Transport", color: "#eab308" },
  { name: "Mobile & Internet", color: "#06b6d4" },
  { name: "Healthcare", color: "#ef4444" },
  { name: "Education", color: "#3b82f6" },
  { name: "Shopping", color: "#ec4899" },
  { name: "Electronics", color: "#6366f1" },
  { name: "Entertainment", color: "#a855f7" },
  { name: "Family & Gifts", color: "#f43f5e" },
  { name: "Bank Fees & Charges", color: "#64748b" },
  { name: "Loan Interest", color: "#b91c1c" },
  { name: "Other Expenses", color: "#94a3b8" },
] as const;

/** Category used for loan processing fees. */
export const FEES_CATEGORY = "Bank Fees & Charges";

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel serverless request limit is 4.5 MB
export const ALLOWED_UPLOAD_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"] as const;
