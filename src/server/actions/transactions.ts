"use server";

import { z } from "zod";
import { cashflowSchema, recurringSchema } from "@/lib/validations/schemas";
import * as transactions from "@/server/services/transactions";
import * as recurring from "@/server/services/recurring";
import * as attachments from "@/server/services/attachments";
import { idSchema, runAction } from "./run";

export async function createCashflowAction(input: unknown) {
  return runAction(cashflowSchema, input, async (u, data) => (await transactions.createCashflow(u.id, data)).id, {
    success: "Saved",
  });
}

export async function updateCashflowAction(id: string, input: unknown) {
  return runAction(z.object({ id: idSchema, data: cashflowSchema }), { id, data: input }, async (u, v) => {
    await transactions.updateCashflow(u.id, v.id, v.data);
    return v.id;
  }, { success: "Changes saved" });
}

export async function deleteTransactionAction(id: string) {
  return runAction(idSchema, id, (u, txId) => transactions.deleteTransaction(u.id, txId), { success: "Transaction deleted" });
}

export async function deleteAttachmentAction(id: string) {
  return runAction(idSchema, id, (u, attId) => attachments.deleteAttachment(u.id, attId), { success: "Attachment removed" });
}

// ───────────── Recurring ─────────────

export async function createRecurringAction(input: unknown) {
  return runAction(recurringSchema, input, async (u, data) => {
    await recurring.createRecurring(u.id, data);
    // Post any occurrences that are already due (e.g. a start date in the past).
    return recurring.processDueRecurring(u.id);
  }, { success: "Recurring rule saved" });
}

export async function updateRecurringAction(id: string, input: unknown) {
  return runAction(z.object({ id: idSchema, data: recurringSchema }), { id, data: input }, async (u, v) => {
    await recurring.updateRecurring(u.id, v.id, v.data);
    return recurring.processDueRecurring(u.id);
  }, { success: "Recurring rule updated" });
}

export async function deleteRecurringAction(id: string) {
  return runAction(idSchema, id, (u, rid) => recurring.deleteRecurring(u.id, rid), { success: "Recurring rule deleted" });
}

export async function runRecurringNowAction() {
  return runAction(z.undefined(), undefined, (u) => recurring.processDueRecurring(u.id));
}
