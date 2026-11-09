import "server-only";
import { db, type DbTx } from "@/lib/db";
import type { categorySchema, ServiceInput } from "@/lib/validations/schemas";
import { DomainError, NotFoundError } from "@/server/errors";
import { audit } from "./audit";

export type CategoryDTO = {
  id: string;
  name: string;
  kind: "INCOME" | "EXPENSE";
  color: string | null;
  isArchived: boolean;
  usage: number;
};

export async function listCategories(userId: string, kind?: "INCOME" | "EXPENSE", includeArchived = false): Promise<CategoryDTO[]> {
  const rows = await db.category.findMany({
    where: { userId, ...(kind ? { kind } : {}), ...(includeArchived ? {} : { isArchived: false }) },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
    include: { _count: { select: { transactions: true } } },
  });
  return rows.map((c) => ({ id: c.id, name: c.name, kind: c.kind, color: c.color, isArchived: c.isArchived, usage: c._count.transactions }));
}

export async function categoryOptions(userId: string, kind: "INCOME" | "EXPENSE") {
  return db.category.findMany({
    where: { userId, kind, isArchived: false },
    orderBy: { name: "asc" },
    select: { id: true, name: true, color: true },
  });
}

export async function createCategory(userId: string, data: ServiceInput<typeof categorySchema>) {
  return db.$transaction(async (tx) => {
    const cat = await tx.category.create({ data: { userId, name: data.name, kind: data.kind, color: data.color ?? null } });
    await audit(tx, { userId, action: "CREATE", entityType: "Category", entityId: cat.id, summary: `Created ${data.kind.toLowerCase()} category "${data.name}"` });
    return cat;
  });
}

export async function updateCategory(userId: string, id: string, data: ServiceInput<typeof categorySchema>) {
  return db.$transaction(async (tx) => {
    const cat = await tx.category.findFirst({ where: { id, userId } });
    if (!cat) throw new NotFoundError("Category");
    if (cat.kind !== data.kind) {
      const used = await tx.transaction.count({ where: { categoryId: id } });
      if (used > 0) throw new DomainError("A category in use cannot change between income and expense.");
    }
    const updated = await tx.category.update({ where: { id }, data: { name: data.name, kind: data.kind, color: data.color ?? null } });
    await audit(tx, { userId, action: "UPDATE", entityType: "Category", entityId: id, summary: `Updated category "${updated.name}"` });
    return updated;
  });
}

/** Unused categories are deleted; used ones are archived so history keeps its labels. */
export async function removeCategory(userId: string, id: string): Promise<"deleted" | "archived"> {
  return db.$transaction(async (tx) => {
    const cat = await tx.category.findFirst({ where: { id, userId } });
    if (!cat) throw new NotFoundError("Category");
    const txs = await tx.transaction.count({ where: { categoryId: id } });
    const rec = await tx.recurringTransaction.count({ where: { categoryId: id } });
    const loans = await tx.loan.count({ where: { purchaseCategoryId: id } });
    if (txs + rec + loans > 0) {
      await tx.category.update({ where: { id }, data: { isArchived: true } });
      await audit(tx, { userId, action: "UPDATE", entityType: "Category", entityId: id, summary: `Archived category "${cat.name}"` });
      return "archived";
    }
    await tx.category.delete({ where: { id } });
    await audit(tx, { userId, action: "DELETE", entityType: "Category", entityId: id, summary: `Deleted category "${cat.name}"` });
    return "deleted";
  });
}

export async function restoreCategory(userId: string, id: string) {
  const { count } = await db.category.updateMany({ where: { id, userId }, data: { isArchived: false } });
  if (count === 0) throw new NotFoundError("Category");
}

/** Find (or lazily create) a named category — used for loan interest / fee bookkeeping. */
export async function ensureCategory(
  tx: DbTx,
  userId: string,
  kind: "INCOME" | "EXPENSE",
  name: string,
) {
  const existing = await tx.category.findFirst({ where: { userId, kind, name }, select: { id: true } });
  if (existing) return existing.id;
  const created = await tx.category.create({ data: { userId, kind, name }, select: { id: true } });
  return created.id;
}
