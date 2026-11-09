/**
 * Ledger rules: how each transaction type affects account balances, and how balances roll up
 * into assets, liabilities and net worth. Pure functions — unit tested.
 */
import { d, MoneyDecimal, ZERO, type MoneyLike } from "@/lib/money";

export type TransactionType =
  | "INCOME"
  | "EXPENSE"
  | "TRANSFER"
  | "LOAN_RECEIVED"
  | "LOAN_GIVEN"
  | "LOAN_REPAYMENT"
  | "LOAN_COLLECTION"
  | "EMI_PAYMENT"
  | "OPENING_BALANCE"
  | "ADJUSTMENT";

export type TransactionDirection = "INFLOW" | "OUTFLOW" | "TRANSFER";

const FIXED_DIRECTION: Partial<Record<TransactionType, TransactionDirection>> = {
  INCOME: "INFLOW",
  LOAN_RECEIVED: "INFLOW",
  LOAN_COLLECTION: "INFLOW",
  EXPENSE: "OUTFLOW",
  LOAN_GIVEN: "OUTFLOW",
  LOAN_REPAYMENT: "OUTFLOW",
  EMI_PAYMENT: "OUTFLOW",
  TRANSFER: "TRANSFER",
};

/** Direction for a type. OPENING_BALANCE / ADJUSTMENT need an explicit direction. */
export function directionFor(type: TransactionType, requested?: "INFLOW" | "OUTFLOW"): TransactionDirection {
  const fixed = FIXED_DIRECTION[type];
  if (fixed) return fixed;
  if (!requested) throw new Error(`${type} requires an explicit direction`);
  return requested;
}

/** Transaction types that count as income / spending in reports. Transfers and loan principal never do. */
export const INCOME_TYPES: TransactionType[] = ["INCOME"];
export const EXPENSE_TYPES: TransactionType[] = ["EXPENSE"];
export const LOAN_TYPES: TransactionType[] = ["LOAN_RECEIVED", "LOAN_GIVEN", "LOAN_REPAYMENT", "LOAN_COLLECTION", "EMI_PAYMENT"];

export type LedgerEntry = {
  direction: TransactionDirection;
  amount: MoneyLike;
  accountId: string;
  toAccountId?: string | null;
};

export type BalanceEffect = { accountId: string; delta: MoneyDecimal };

/** The balance changes a ledger entry causes. Multiply by −1 to reverse. */
export function balanceEffects(entry: LedgerEntry, sign: 1 | -1 = 1): BalanceEffect[] {
  const amount = d(entry.amount).times(sign);
  switch (entry.direction) {
    case "INFLOW":
      return [{ accountId: entry.accountId, delta: amount }];
    case "OUTFLOW":
      return [{ accountId: entry.accountId, delta: amount.negated() }];
    case "TRANSFER": {
      if (!entry.toAccountId) throw new Error("Transfer requires a destination account");
      if (entry.toAccountId === entry.accountId) throw new Error("Cannot transfer to the same account");
      return [
        { accountId: entry.accountId, delta: amount.negated() },
        { accountId: entry.toAccountId, delta: amount },
      ];
    }
  }
}

/** Merge effects so each account is updated once (keeps row-lock order deterministic). */
export function mergeEffects(effects: BalanceEffect[]): BalanceEffect[] {
  const map = new Map<string, MoneyDecimal>();
  for (const e of effects) map.set(e.accountId, (map.get(e.accountId) ?? ZERO).plus(e.delta));
  return [...map.entries()]
    .filter(([, delta]) => !delta.isZero())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([accountId, delta]) => ({ accountId, delta }));
}

/** Signed effect on net cash of a single entry for one account (used for balance-trend charts). */
export function signedAmount(entry: { direction: TransactionDirection; amount: MoneyLike }): MoneyDecimal {
  if (entry.direction === "INFLOW") return d(entry.amount);
  if (entry.direction === "OUTFLOW") return d(entry.amount).negated();
  return ZERO; // transfers are net-zero across the user's accounts
}

// ───────────── Net worth ─────────────

export type NetWorthInput = {
  accounts: { currentBalance: MoneyLike; includeInNetWorth: boolean; isArchived?: boolean }[];
  loans: { direction: "BORROWED" | "LENT"; status: string; outstandingPrincipal: MoneyLike }[];
};

export type NetWorth = {
  /** Sum of all (non-archived, included) account balances. */
  availableBalance: MoneyDecimal;
  /** Money owed to the user (outstanding principal of money lent). */
  receivables: MoneyDecimal;
  /** Outstanding principal of all borrowed loans (personal, EMI, bank). */
  loanLiabilities: MoneyDecimal;
  /** Negative account balances (credit cards / overdrafts). */
  overdrafts: MoneyDecimal;
  totalAssets: MoneyDecimal;
  totalLiabilities: MoneyDecimal;
  netWorth: MoneyDecimal;
};

export function computeNetWorth(input: NetWorthInput): NetWorth {
  let availableBalance = ZERO;
  let positive = ZERO;
  let overdrafts = ZERO;
  for (const a of input.accounts) {
    if (a.isArchived || !a.includeInNetWorth) continue;
    const bal = d(a.currentBalance);
    availableBalance = availableBalance.plus(bal);
    if (bal.isNegative()) overdrafts = overdrafts.plus(bal.abs());
    else positive = positive.plus(bal);
  }
  let receivables = ZERO;
  let loanLiabilities = ZERO;
  for (const l of input.loans) {
    if (l.status === "CLOSED") continue;
    if (l.direction === "LENT") receivables = receivables.plus(d(l.outstandingPrincipal));
    else loanLiabilities = loanLiabilities.plus(d(l.outstandingPrincipal));
  }
  const totalAssets = positive.plus(receivables);
  const totalLiabilities = loanLiabilities.plus(overdrafts);
  return {
    availableBalance,
    receivables,
    loanLiabilities,
    overdrafts,
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets.minus(totalLiabilities),
  };
}
