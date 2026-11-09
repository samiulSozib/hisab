import "server-only";
import { db } from "@/lib/db";
import { parseDateOnly, toDateOnly } from "@/lib/dates";
import { balanceEffects } from "@/lib/finance/ledger";
import { d, toMoneyString, ZERO } from "@/lib/money";
import type { accountSchema, adjustmentSchema, transferSchema, ServiceInput } from "@/lib/validations/schemas";
import { DomainError, NotFoundError } from "@/server/errors";
import { audit, diff } from "./audit";
import { applyEffects, assertAccountsOwned, createLedgerEntry, updateLedgerEntry } from "./ledger";

type AccountData = ServiceInput<typeof accountSchema>;

export type AccountDTO = {
  id: string;
  name: string;
  type: string;
  institution: string | null;
  description: string | null;
  color: string | null;
  openingBalance: string;
  currentBalance: string;
  openingDate: string;
  includeInNetWorth: boolean;
  isArchived: boolean;
  transactionCount: number;
};

export async function listAccounts(userId: string, opts: { includeArchived?: boolean } = {}): Promise<AccountDTO[]> {
  const rows = await db.account.findMany({
    where: { userId, ...(opts.includeArchived ? {} : { isArchived: false }) },
    orderBy: [{ isArchived: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { transactions: true, incomingTransfers: true } } },
  });
  return rows.map((a) => ({
    id: a.id,
    name: a.name,
    type: a.type,
    institution: a.institution,
    description: a.description,
    color: a.color,
    openingBalance: a.openingBalance.toFixed(2),
    currentBalance: a.currentBalance.toFixed(2),
    openingDate: toDateOnly(a.openingDate),
    includeInNetWorth: a.includeInNetWorth,
    isArchived: a.isArchived,
    transactionCount: a._count.transactions + a._count.incomingTransfers,
  }));
}

/** Lightweight list for select inputs. */
export async function accountOptions(userId: string) {
  const rows = await db.account.findMany({
    where: { userId, isArchived: false },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, type: true, currentBalance: true },
  });
  return rows.map((a) => ({ id: a.id, name: a.name, type: a.type, balance: a.currentBalance.toFixed(2) }));
}

export async function createAccount(userId: string, data: AccountData) {
  return db.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        userId,
        name: data.name,
        type: data.type,
        institution: data.institution ?? null,
        description: data.description ?? null,
        color: data.color ?? null,
        openingBalance: data.openingBalance,
        currentBalance: "0",
        openingDate: parseDateOnly(data.openingDate),
        includeInNetWorth: data.includeInNetWorth,
      },
    });
    const opening = d(data.openingBalance);
    if (!opening.isZero()) {
      await createLedgerEntry(tx, userId, {
        type: "OPENING_BALANCE",
        direction: opening.isNegative() ? "OUTFLOW" : "INFLOW",
        amount: toMoneyString(opening.abs()),
        date: data.openingDate,
        accountId: account.id,
        description: "Opening balance",
      });
    }
    await audit(tx, {
      userId,
      action: "CREATE",
      entityType: "Account",
      entityId: account.id,
      summary: `Created account "${account.name}" with opening balance ${toMoneyString(opening)}`,
    });
    return account;
  });
}

export async function updateAccount(userId: string, accountId: string, data: AccountData) {
  return db.$transaction(async (tx) => {
    const existing = await tx.account.findFirst({ where: { id: accountId, userId } });
    if (!existing) throw new NotFoundError("Account");

    const updated = await tx.account.update({
      where: { id: accountId },
      data: {
        name: data.name,
        type: data.type,
        institution: data.institution ?? null,
        description: data.description ?? null,
        color: data.color ?? null,
        openingBalance: data.openingBalance,
        openingDate: parseDateOnly(data.openingDate),
        includeInNetWorth: data.includeInNetWorth,
      },
    });

    // Re-state the opening-balance ledger entry if it changed.
    const newOpening = d(data.openingBalance);
    const openingTx = await tx.transaction.findFirst({ where: { accountId, userId, type: "OPENING_BALANCE" } });
    if (openingTx) {
      if (newOpening.isZero()) {
        await applyEffects(tx, balanceEffects({ ...openingTx, amount: openingTx.amount.toString() }, -1));
        await tx.transaction.delete({ where: { id: openingTx.id } });
      } else {
        await updateLedgerEntry(tx, openingTx, {
          type: "OPENING_BALANCE",
          direction: newOpening.isNegative() ? "OUTFLOW" : "INFLOW",
          amount: toMoneyString(newOpening.abs()),
          date: data.openingDate,
          accountId,
          description: "Opening balance",
        });
      }
    } else if (!newOpening.isZero()) {
      await createLedgerEntry(tx, userId, {
        type: "OPENING_BALANCE",
        direction: newOpening.isNegative() ? "OUTFLOW" : "INFLOW",
        amount: toMoneyString(newOpening.abs()),
        date: data.openingDate,
        accountId,
        description: "Opening balance",
      });
    }

    await audit(tx, {
      userId,
      action: "UPDATE",
      entityType: "Account",
      entityId: accountId,
      summary: `Updated account "${updated.name}"`,
      changes: diff(existing, updated),
    });
    return updated;
  });
}

export async function setAccountArchived(userId: string, accountId: string, archived: boolean) {
  return db.$transaction(async (tx) => {
    const acc = await tx.account.findFirst({ where: { id: accountId, userId } });
    if (!acc) throw new NotFoundError("Account");
    if (archived) {
      const activeLoans = await tx.loan.count({ where: { accountId, status: "ACTIVE" } });
      if (activeLoans > 0) throw new DomainError("This account is linked to active loans. Change or close them first.");
    }
    await tx.account.update({ where: { id: accountId }, data: { isArchived: archived } });
    await tx.recurringTransaction.updateMany({ where: { accountId, userId }, data: archived ? { isActive: false } : {} });
    await audit(tx, {
      userId,
      action: "UPDATE",
      entityType: "Account",
      entityId: accountId,
      summary: `${archived ? "Archived" : "Restored"} account "${acc.name}"`,
    });
  });
}

/** Accounts can only be deleted when nothing but the opening balance references them. */
export async function deleteAccount(userId: string, accountId: string) {
  return db.$transaction(async (tx) => {
    const acc = await tx.account.findFirst({ where: { id: accountId, userId } });
    if (!acc) throw new NotFoundError("Account");
    // Sequential: an interactive transaction holds a single connection.
    const txCount = await tx.transaction.count({
      where: { OR: [{ accountId }, { toAccountId: accountId }], NOT: { type: "OPENING_BALANCE" } },
    });
    const loanCount = await tx.loan.count({ where: { accountId } });
    if (txCount > 0 || loanCount > 0) {
      throw new DomainError("This account has transaction history. Archive it instead to keep your records intact.");
    }
    await tx.transaction.deleteMany({ where: { accountId, type: "OPENING_BALANCE" } });
    await tx.account.delete({ where: { id: accountId } });
    await audit(tx, { userId, action: "DELETE", entityType: "Account", entityId: accountId, summary: `Deleted account "${acc.name}"` });
  });
}

export async function transferBetweenAccounts(userId: string, data: ServiceInput<typeof transferSchema>) {
  return db.$transaction(async (tx) => {
    await assertAccountsOwned(tx, userId, [data.fromAccountId, data.toAccountId]);
    const row = await createLedgerEntry(tx, userId, {
      type: "TRANSFER",
      amount: data.amount,
      date: data.date,
      accountId: data.fromAccountId,
      toAccountId: data.toAccountId,
      description: data.description ?? "Transfer",
      reference: data.reference ?? null,
    });
    await audit(tx, { userId, action: "CREATE", entityType: "Transaction", entityId: row.id, summary: `Transfer of ${data.amount}` });
    return row;
  });
}

/** Reconcile an account to its real balance by recording an ADJUSTMENT for the difference. */
export async function adjustAccountBalance(userId: string, data: ServiceInput<typeof adjustmentSchema>) {
  return db.$transaction(async (tx) => {
    const acc = await tx.account.findFirst({ where: { id: data.accountId, userId } });
    if (!acc) throw new NotFoundError("Account");
    const delta = d(data.actualBalance).minus(acc.currentBalance.toString());
    if (delta.isZero()) throw new DomainError("The balance already matches — no adjustment needed.");
    const row = await createLedgerEntry(tx, userId, {
      type: "ADJUSTMENT",
      direction: delta.isNegative() ? "OUTFLOW" : "INFLOW",
      amount: toMoneyString(delta.abs()),
      date: data.date,
      accountId: acc.id,
      description: data.description ?? "Balance reconciliation",
    });
    await audit(tx, {
      userId,
      action: "CREATE",
      entityType: "Transaction",
      entityId: row.id,
      summary: `Adjusted "${acc.name}" balance by ${toMoneyString(delta)}`,
    });
    return row;
  });
}

/**
 * Integrity check: recompute every account balance from the ledger and fix any drift.
 * Returns the accounts that were corrected.
 */
export async function recalculateBalances(userId: string) {
  return db.$transaction(async (tx) => {
    const accounts = await tx.account.findMany({ where: { userId }, select: { id: true, name: true, currentBalance: true } });
    const entries = await tx.transaction.findMany({
      where: { userId },
      select: { direction: true, amount: true, accountId: true, toAccountId: true },
    });
    const computed = new Map(accounts.map((a) => [a.id, ZERO]));
    for (const e of entries) {
      for (const fx of balanceEffects({ ...e, amount: e.amount.toString() })) {
        computed.set(fx.accountId, (computed.get(fx.accountId) ?? ZERO).plus(fx.delta));
      }
    }
    const corrected: { name: string; from: string; to: string }[] = [];
    for (const a of accounts) {
      const value = computed.get(a.id) ?? ZERO;
      if (!value.equals(a.currentBalance.toString())) {
        await tx.account.update({ where: { id: a.id }, data: { currentBalance: value.toFixed(2) } });
        corrected.push({ name: a.name, from: a.currentBalance.toFixed(2), to: value.toFixed(2) });
      }
    }
    if (corrected.length) {
      await audit(tx, {
        userId,
        action: "UPDATE",
        entityType: "Account",
        entityId: "*",
        summary: `Recalculated balances (${corrected.length} corrected)`,
        changes: { corrected },
      });
    }
    return corrected;
  });
}
