import "server-only";
import { db } from "@/lib/db";
import { addPeriods, parseDateOnly, toDateOnly, today } from "@/lib/dates";
import type { recurringSchema, ServiceInput } from "@/lib/validations/schemas";
import { NotFoundError } from "@/server/errors";
import { audit } from "./audit";
import { assertAccountsOwned, assertCategoryOwned, createLedgerEntry } from "./ledger";

type RecurringData = ServiceInput<typeof recurringSchema>;
const MAX_CATCH_UP = 60; // occurrences per rule per run

export async function listRecurring(userId: string, type?: "INCOME" | "EXPENSE") {
  const rows = await db.recurringTransaction.findMany({
    where: { userId, ...(type ? { type } : {}) },
    orderBy: [{ isActive: "desc" }, { nextRunDate: "asc" }],
    include: { account: { select: { name: true } }, category: { select: { name: true, color: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    type: r.type as "INCOME" | "EXPENSE",
    amount: r.amount.toFixed(2),
    accountId: r.accountId,
    accountName: r.account.name,
    categoryId: r.categoryId,
    categoryName: r.category?.name ?? null,
    categoryColor: r.category?.color ?? null,
    counterparty: r.counterparty,
    description: r.description,
    frequency: r.frequency,
    interval: r.interval,
    startDate: toDateOnly(r.startDate),
    nextRunDate: toDateOnly(r.nextRunDate),
    endDate: r.endDate ? toDateOnly(r.endDate) : null,
    isActive: r.isActive,
  }));
}

export type RecurringDTO = Awaited<ReturnType<typeof listRecurring>>[number];

export async function createRecurring(userId: string, data: RecurringData) {
  return db.$transaction(async (tx) => {
    await assertAccountsOwned(tx, userId, [data.accountId]);
    await assertCategoryOwned(tx, userId, data.categoryId, data.type);
    const rec = await tx.recurringTransaction.create({
      data: {
        userId,
        type: data.type,
        amount: data.amount,
        accountId: data.accountId,
        categoryId: data.categoryId,
        counterparty: data.counterparty ?? null,
        description: data.description ?? null,
        frequency: data.frequency,
        interval: data.interval,
        startDate: parseDateOnly(data.startDate),
        nextRunDate: parseDateOnly(data.startDate),
        endDate: data.endDate ? parseDateOnly(data.endDate) : null,
        isActive: data.isActive,
      },
    });
    await audit(tx, { userId, action: "CREATE", entityType: "RecurringTransaction", entityId: rec.id, summary: `Recurring ${data.type.toLowerCase()} of ${data.amount} (${data.frequency.toLowerCase()})` });
    return rec;
  });
}

export async function updateRecurring(userId: string, id: string, data: RecurringData) {
  return db.$transaction(async (tx) => {
    const existing = await tx.recurringTransaction.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Recurring rule");
    await assertAccountsOwned(tx, userId, [data.accountId]);
    await assertCategoryOwned(tx, userId, data.categoryId, data.type);
    const startChanged = toDateOnly(existing.startDate) !== data.startDate;
    await tx.recurringTransaction.update({
      where: { id },
      data: {
        type: data.type,
        amount: data.amount,
        accountId: data.accountId,
        categoryId: data.categoryId,
        counterparty: data.counterparty ?? null,
        description: data.description ?? null,
        frequency: data.frequency,
        interval: data.interval,
        startDate: parseDateOnly(data.startDate),
        ...(startChanged ? { nextRunDate: parseDateOnly(data.startDate) } : {}),
        endDate: data.endDate ? parseDateOnly(data.endDate) : null,
        isActive: data.isActive,
      },
    });
    await audit(tx, { userId, action: "UPDATE", entityType: "RecurringTransaction", entityId: id, summary: `Updated recurring ${data.type.toLowerCase()}` });
  });
}

export async function deleteRecurring(userId: string, id: string) {
  return db.$transaction(async (tx) => {
    const existing = await tx.recurringTransaction.findFirst({ where: { id, userId } });
    if (!existing) throw new NotFoundError("Recurring rule");
    await tx.recurringTransaction.delete({ where: { id } }); // past transactions are kept (recurringId → NULL)
    await audit(tx, { userId, action: "DELETE", entityType: "RecurringTransaction", entityId: id, summary: `Deleted recurring ${existing.type.toLowerCase()} rule` });
  });
}

/**
 * Post every due occurrence of active recurring rules (optionally for one user).
 * Idempotent and concurrency-safe: each occurrence is claimed by a conditional update on
 * `nextRunDate` inside the same DB transaction that creates the ledger entry.
 */
export async function processDueRecurring(userId?: string, asOf: Date = today()): Promise<number> {
  const rules = await db.recurringTransaction.findMany({
    where: { isActive: true, nextRunDate: { lte: asOf }, ...(userId ? { userId } : {}), account: { isArchived: false } },
    take: 500,
  });
  let posted = 0;
  for (const rule of rules) {
    let occurrence = 0;
    let runDate = rule.nextRunDate;
    // Find how many periods after the start the current nextRunDate is, so dates stay anchored.
    let step = 0;
    while (addPeriods(rule.startDate, rule.frequency, step, rule.interval) < runDate && step < 100_000) step++;

    while (runDate <= asOf && occurrence < MAX_CATCH_UP) {
      if (rule.endDate && runDate > rule.endDate) {
        await db.recurringTransaction.update({ where: { id: rule.id }, data: { isActive: false } });
        break;
      }
      const next = addPeriods(rule.startDate, rule.frequency, step + 1, rule.interval);
      const claimed = await db.$transaction(async (tx) => {
        const { count } = await tx.recurringTransaction.updateMany({
          where: { id: rule.id, nextRunDate: runDate, isActive: true },
          data: { nextRunDate: next, lastRunAt: new Date(), ...(rule.endDate && next > rule.endDate ? { isActive: false } : {}) },
        });
        if (count !== 1) return false; // another worker already posted this occurrence
        await createLedgerEntry(tx, rule.userId, {
          type: rule.type,
          amount: rule.amount.toFixed(2),
          date: toDateOnly(runDate),
          accountId: rule.accountId,
          categoryId: rule.categoryId,
          recurringId: rule.id,
          counterparty: rule.counterparty,
          description: rule.description ?? `Recurring ${rule.type.toLowerCase()}`,
        });
        return true;
      });
      if (!claimed) break;
      posted++;
      occurrence++;
      step++;
      runDate = next;
    }
  }
  return posted;
}
