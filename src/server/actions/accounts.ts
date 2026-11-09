"use server";

import { z } from "zod";
import { accountSchema, adjustmentSchema, categorySchema, transferSchema } from "@/lib/validations/schemas";
import * as accounts from "@/server/services/accounts";
import * as categories from "@/server/services/categories";
import { idSchema, runAction } from "./run";

export async function createAccountAction(input: unknown) {
  return runAction(accountSchema, input, async (u, data) => (await accounts.createAccount(u.id, data)).id, { success: "Account created" });
}

export async function updateAccountAction(id: string, input: unknown) {
  return runAction(z.object({ id: idSchema, data: accountSchema }), { id, data: input }, async (u, v) => {
    await accounts.updateAccount(u.id, v.id, v.data);
  }, { success: "Account updated" });
}

export async function setAccountArchivedAction(id: string, archived: boolean) {
  return runAction(z.object({ id: idSchema, archived: z.boolean() }), { id, archived }, (u, v) => accounts.setAccountArchived(u.id, v.id, v.archived), {
    success: archived ? "Account archived" : "Account restored",
  });
}

export async function deleteAccountAction(id: string) {
  return runAction(idSchema, id, (u, accId) => accounts.deleteAccount(u.id, accId), { success: "Account deleted" });
}

export async function transferAction(input: unknown) {
  return runAction(transferSchema, input, async (u, data) => {
    await accounts.transferBetweenAccounts(u.id, data);
  }, { success: "Transfer recorded" });
}

export async function adjustBalanceAction(input: unknown) {
  return runAction(adjustmentSchema, input, async (u, data) => {
    await accounts.adjustAccountBalance(u.id, data);
  }, { success: "Balance reconciled" });
}

export async function recalculateBalancesAction() {
  return runAction(z.undefined(), undefined, (u) => accounts.recalculateBalances(u.id));
}

// ───────────── Categories ─────────────

export async function createCategoryAction(input: unknown) {
  return runAction(categorySchema, input, async (u, data) => {
    const c = await categories.createCategory(u.id, data);
    return { id: c.id, name: c.name };
  }, { success: "Category created" });
}

export async function updateCategoryAction(id: string, input: unknown) {
  return runAction(z.object({ id: idSchema, data: categorySchema }), { id, data: input }, async (u, v) => {
    await categories.updateCategory(u.id, v.id, v.data);
  }, { success: "Category updated" });
}

export async function removeCategoryAction(id: string) {
  return runAction(idSchema, id, (u, catId) => categories.removeCategory(u.id, catId));
}

export async function restoreCategoryAction(id: string) {
  return runAction(idSchema, id, (u, catId) => categories.restoreCategory(u.id, catId), { success: "Category restored" });
}
