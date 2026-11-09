import "server-only";
import type { DbTx } from "@/lib/db";
import { parseDateOnly } from "@/lib/dates";
import { balanceEffects, directionFor, mergeEffects, type BalanceEffect, type TransactionType } from "@/lib/finance/ledger";
import { d, toMoneyString } from "@/lib/money";
import { DomainError, NotFoundError } from "@/server/errors";

/**
 * Ledger primitives. Every change to an account balance in Hisab goes through these functions,
 * which must be called inside `db.$transaction` so the ledger row and the balance update commit
 * (or roll back) together.
 */

export async function applyEffects(tx: DbTx, effects: BalanceEffect[]) {
  // Sorted by account id → consistent lock order, no deadlocks between concurrent writers.
  for (const e of mergeEffects(effects)) {
    await tx.account.update({
      where: { id: e.accountId },
      data: { currentBalance: { increment: e.delta.toFixed(2) } },
    });
  }
}

/** Ensure every account id belongs to the user (and is active, unless `allowArchived`). */
export async function assertAccountsOwned(tx: DbTx, userId: string, ids: (string | null | undefined)[], allowArchived = false) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (unique.length === 0) return;
  const found = await tx.account.findMany({
    where: { id: { in: unique }, userId },
    select: { id: true, isArchived: true },
  });
  if (found.length !== unique.length) throw new NotFoundError("Account");
  if (!allowArchived && found.some((a) => a.isArchived)) throw new DomainError("This account is archived. Restore it first.");
}

export async function assertCategoryOwned(tx: DbTx, userId: string, categoryId: string | null | undefined, kind?: "INCOME" | "EXPENSE") {
  if (!categoryId) return;
  const cat = await tx.category.findFirst({ where: { id: categoryId, userId }, select: { kind: true } });
  if (!cat) throw new NotFoundError("Category");
  if (kind && cat.kind !== kind) throw new DomainError(`Choose an ${kind.toLowerCase()} category`);
}

export type LedgerEntryInput = {
  type: TransactionType;
  /** Required for OPENING_BALANCE and ADJUSTMENT. */
  direction?: "INFLOW" | "OUTFLOW";
  amount: string;
  date: string; // YYYY-MM-DD
  accountId: string;
  toAccountId?: string | null;
  categoryId?: string | null;
  loanId?: string | null;
  recurringId?: string | null;
  counterparty?: string | null;
  reference?: string | null;
  description?: string | null;
};

/** Create a ledger transaction and update account balances. Caller must have checked ownership. */
export async function createLedgerEntry(tx: DbTx, userId: string, input: LedgerEntryInput) {
  const amount = d(input.amount);
  if (amount.lessThanOrEqualTo(0)) throw new DomainError("Amount must be greater than zero");
  const direction = directionFor(input.type, input.direction);
  if (direction === "TRANSFER" && (!input.toAccountId || input.toAccountId === input.accountId)) {
    throw new DomainError("Choose two different accounts for a transfer");
  }
  const row = await tx.transaction.create({
    data: {
      userId,
      type: input.type,
      direction,
      amount: toMoneyString(amount),
      date: parseDateOnly(input.date),
      accountId: input.accountId,
      toAccountId: direction === "TRANSFER" ? input.toAccountId : null,
      categoryId: input.categoryId ?? null,
      loanId: input.loanId ?? null,
      recurringId: input.recurringId ?? null,
      counterparty: input.counterparty ?? null,
      reference: input.reference ?? null,
      description: input.description ?? null,
    },
  });
  await applyEffects(tx, balanceEffects({ direction, amount, accountId: row.accountId, toAccountId: row.toAccountId }));
  return row;
}

type ExistingEntry = {
  id: string;
  direction: "INFLOW" | "OUTFLOW" | "TRANSFER";
  amount: { toString(): string };
  accountId: string;
  toAccountId: string | null;
};

/** Reverse the balance effect of an entry and delete it. */
export async function deleteLedgerEntry(tx: DbTx, entry: ExistingEntry) {
  await applyEffects(tx, balanceEffects({ ...entry, amount: entry.amount.toString() }, -1));
  await tx.transaction.delete({ where: { id: entry.id } });
}

/** Replace an entry's amount/accounts/direction, re-applying balance effects as a single net change. */
export async function updateLedgerEntry(
  tx: DbTx,
  existing: ExistingEntry,
  next: Omit<LedgerEntryInput, "type"> & { type: TransactionType },
) {
  const direction = directionFor(next.type, next.direction);
  const amount = d(next.amount);
  if (amount.lessThanOrEqualTo(0)) throw new DomainError("Amount must be greater than zero");
  const effects = [
    ...balanceEffects({ ...existing, amount: existing.amount.toString() }, -1),
    ...balanceEffects({ direction, amount, accountId: next.accountId, toAccountId: next.toAccountId }),
  ];
  const row = await tx.transaction.update({
    where: { id: existing.id },
    data: {
      type: next.type,
      direction,
      amount: toMoneyString(amount),
      date: parseDateOnly(next.date),
      accountId: next.accountId,
      toAccountId: direction === "TRANSFER" ? next.toAccountId : null,
      categoryId: next.categoryId ?? null,
      counterparty: next.counterparty ?? null,
      reference: next.reference ?? null,
      description: next.description ?? null,
    },
  });
  await applyEffects(tx, effects);
  return row;
}
