import "server-only";
import { db } from "@/lib/db";
import { parseDateOnly, toDateOnly } from "@/lib/dates";
import type { cashflowSchema, TransactionFilters, ServiceInput } from "@/lib/validations/schemas";
import type { Prisma } from "@/generated/prisma/client";
import { DomainError, NotFoundError } from "@/server/errors";
import { audit, diff } from "./audit";
import { assertAccountsOwned, assertCategoryOwned, createLedgerEntry, deleteLedgerEntry, updateLedgerEntry } from "./ledger";

type CashflowData = ServiceInput<typeof cashflowSchema>;

/** Transaction types that are edited directly. Loan-related entries are managed from the loan. */
const DIRECTLY_EDITABLE = new Set(["INCOME", "EXPENSE", "TRANSFER", "ADJUSTMENT"]);

export const PAGE_SIZE = 25;

export type TransactionRow = {
  id: string;
  type: string;
  direction: "INFLOW" | "OUTFLOW" | "TRANSFER";
  amount: string;
  date: string;
  description: string | null;
  counterparty: string | null;
  reference: string | null;
  account: { id: string; name: string; color: string | null };
  toAccount: { id: string; name: string } | null;
  category: { id: string; name: string; color: string | null } | null;
  loan: { id: string; title: string; kind: string } | null;
  attachmentCount: number;
  isRecurring: boolean;
  editable: boolean;
};

const rowInclude = {
  account: { select: { id: true, name: true, color: true } },
  toAccount: { select: { id: true, name: true } },
  category: { select: { id: true, name: true, color: true } },
  loan: { select: { id: true, title: true, kind: true } },
  _count: { select: { attachments: true } },
} satisfies Prisma.TransactionInclude;

type RowSource = Prisma.TransactionGetPayload<{ include: typeof rowInclude }>;

function toRow(t: RowSource): TransactionRow {
  return {
    id: t.id,
    type: t.type,
    direction: t.direction,
    amount: t.amount.toFixed(2),
    date: toDateOnly(t.date),
    description: t.description,
    counterparty: t.counterparty,
    reference: t.reference,
    account: t.account,
    toAccount: t.toAccount,
    category: t.category,
    loan: t.loan,
    attachmentCount: t._count.attachments,
    isRecurring: Boolean(t.recurringId),
    editable: DIRECTLY_EDITABLE.has(t.type),
  };
}

export function buildWhere(userId: string, f: Partial<TransactionFilters>, forceTypes?: string[]): Prisma.TransactionWhereInput {
  const and: Prisma.TransactionWhereInput[] = [{ userId }];
  if (forceTypes) and.push({ type: { in: forceTypes as Prisma.EnumTransactionTypeFilter["in"] } });
  else if (f.type) and.push({ type: f.type });
  if (f.accountId) and.push({ OR: [{ accountId: f.accountId }, { toAccountId: f.accountId }] });
  if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.from) and.push({ date: { gte: parseDateOnly(f.from) } });
  if (f.to) and.push({ date: { lte: parseDateOnly(f.to) } });
  if (f.min) and.push({ amount: { gte: f.min } });
  if (f.max) and.push({ amount: { lte: f.max } });
  if (f.q) {
    const q = f.q;
    and.push({
      OR: [
        { description: { contains: q, mode: "insensitive" } },
        { counterparty: { contains: q, mode: "insensitive" } },
        { reference: { contains: q, mode: "insensitive" } },
        { category: { name: { contains: q, mode: "insensitive" } } },
        { account: { name: { contains: q, mode: "insensitive" } } },
      ],
    });
  }
  return { AND: and };
}

function orderFor(sort: TransactionFilters["sort"] | undefined): Prisma.TransactionOrderByWithRelationInput[] {
  switch (sort) {
    case "date_asc":
      return [{ date: "asc" }, { createdAt: "asc" }];
    case "amount_desc":
      return [{ amount: "desc" }, { date: "desc" }];
    case "amount_asc":
      return [{ amount: "asc" }, { date: "desc" }];
    default:
      return [{ date: "desc" }, { createdAt: "desc" }];
  }
}

export async function listTransactions(userId: string, filters: TransactionFilters, forceTypes?: string[]) {
  const where = buildWhere(userId, filters, forceTypes);
  const [rows, total, totals] = await Promise.all([
    db.transaction.findMany({
      where,
      include: rowInclude,
      orderBy: orderFor(filters.sort),
      skip: (filters.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.transaction.count({ where }),
    db.transaction.groupBy({ by: ["direction"], where, _sum: { amount: true } }),
  ]);
  const sumFor = (dir: string) => totals.find((t) => t.direction === dir)?._sum.amount?.toFixed(2) ?? "0.00";
  return {
    rows: rows.map(toRow),
    total,
    page: filters.page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    inflow: sumFor("INFLOW"),
    outflow: sumFor("OUTFLOW"),
  };
}

export async function recentTransactions(userId: string, take = 8) {
  const rows = await db.transaction.findMany({
    where: { userId },
    include: rowInclude,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
  });
  return rows.map(toRow);
}

export async function getTransactionDetail(userId: string, id: string) {
  const t = await db.transaction.findFirst({
    where: { id, userId },
    include: {
      ...rowInclude,
      attachments: { select: { id: true, fileName: true, mimeType: true, size: true, createdAt: true } },
      loanPayment: true,
      recurring: { select: { id: true, frequency: true, description: true } },
    },
  });
  if (!t) return null;
  return {
    ...toRow(t),
    categoryId: t.categoryId,
    createdAt: t.createdAt.toISOString(),
    updatedAt: t.updatedAt.toISOString(),
    attachments: t.attachments.map((a) => ({ ...a, createdAt: a.createdAt.toISOString() })),
    loanPayment: t.loanPayment
      ? {
          principal: t.loanPayment.principalAmount.toFixed(2),
          interest: t.loanPayment.interestAmount.toFixed(2),
          fee: t.loanPayment.feeAmount.toFixed(2),
        }
      : null,
    recurring: t.recurring,
  };
}

export async function createCashflow(userId: string, data: CashflowData) {
  return db.$transaction(async (tx) => {
    await assertAccountsOwned(tx, userId, [data.accountId]);
    await assertCategoryOwned(tx, userId, data.categoryId, data.type);
    const row = await createLedgerEntry(tx, userId, {
      type: data.type,
      amount: data.amount,
      date: data.date,
      accountId: data.accountId,
      categoryId: data.categoryId,
      counterparty: data.counterparty,
      reference: data.reference,
      description: data.description,
    });
    await audit(tx, {
      userId,
      action: "CREATE",
      entityType: "Transaction",
      entityId: row.id,
      summary: `Recorded ${data.type.toLowerCase()} of ${data.amount}`,
    });
    return row;
  });
}

export async function updateCashflow(userId: string, id: string, data: CashflowData) {
  return db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Transaction");
    if (existing.type !== "INCOME" && existing.type !== "EXPENSE") {
      throw new DomainError("Only income and expense entries can be edited here.");
    }
    await assertAccountsOwned(tx, userId, [data.accountId], true);
    await assertCategoryOwned(tx, userId, data.categoryId, data.type);
    const updated = await updateLedgerEntry(tx, existing, {
      type: data.type,
      amount: data.amount,
      date: data.date,
      accountId: data.accountId,
      categoryId: data.categoryId,
      counterparty: data.counterparty,
      reference: data.reference,
      description: data.description,
    });
    await audit(tx, {
      userId,
      action: "UPDATE",
      entityType: "Transaction",
      entityId: id,
      summary: `Updated ${data.type.toLowerCase()} entry`,
      changes: diff(existing, updated),
    });
    return updated;
  });
}

export async function deleteTransaction(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.transaction.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Transaction");
    if (!DIRECTLY_EDITABLE.has(existing.type)) {
      throw new DomainError(
        existing.type === "OPENING_BALANCE"
          ? "Change the opening balance from the account settings."
          : "This entry belongs to a loan. Manage it from the loan's page.",
      );
    }
    await deleteLedgerEntry(tx, existing);
    await audit(tx, {
      userId,
      action: "DELETE",
      entityType: "Transaction",
      entityId: id,
      summary: `Deleted ${existing.type.toLowerCase()} of ${existing.amount.toFixed(2)} dated ${toDateOnly(existing.date)}`,
      changes: { before: existing },
    });
  });
}

/** Rows for CSV export (bounded to 20k rows per request). */
export async function exportTransactions(userId: string, filters: Partial<TransactionFilters>, forceTypes?: string[]) {
  const rows = await db.transaction.findMany({
    where: buildWhere(userId, filters, forceTypes),
    include: rowInclude,
    orderBy: orderFor(filters.sort),
    take: 20_000,
  });
  return rows.map(toRow);
}
