"use server";

import { z } from "zod";
import {
  bankLoanSchema,
  emiLoanSchema,
  installmentUpdateSchema,
  loanPaymentSchema,
  loanUpdateSchema,
  personalLoanSchema,
  rescheduleSchema,
} from "@/lib/validations/schemas";
import * as loans from "@/server/services/loans";
import { idSchema, runAction } from "./run";

export async function createPersonalLoanAction(input: unknown) {
  return runAction(personalLoanSchema, input, async (u, data) => (await loans.createPersonalLoan(u.id, data)).id, { success: "Loan recorded" });
}

export async function createEmiLoanAction(input: unknown) {
  return runAction(emiLoanSchema, input, async (u, data) => (await loans.createEmiLoan(u.id, data)).id, { success: "EMI created with schedule" });
}

export async function createBankLoanAction(input: unknown) {
  return runAction(bankLoanSchema, input, async (u, data) => (await loans.createBankLoan(u.id, data)).id, { success: "Bank loan created with schedule" });
}

export async function updateLoanAction(id: string, input: unknown) {
  return runAction(z.object({ id: idSchema, data: loanUpdateSchema }), { id, data: input }, (u, v) => loans.updateLoanDetails(u.id, v.id, v.data), {
    success: "Loan updated",
  });
}

export async function deleteLoanAction(id: string) {
  return runAction(idSchema, id, (u, loanId) => loans.deleteLoan(u.id, loanId), { success: "Loan deleted and balances reversed" });
}

export async function recordLoanPaymentAction(loanId: string, input: unknown) {
  return runAction(z.object({ id: idSchema, data: loanPaymentSchema }), { id: loanId, data: input }, async (u, v) => {
    const r = await loans.recordLoanPayment(u.id, v.id, v.data);
    return { closed: r.closed };
  }, { success: "Payment recorded" });
}

export async function deleteLoanPaymentAction(paymentId: string) {
  return runAction(idSchema, paymentId, (u, id) => loans.deleteLoanPayment(u.id, id), { success: "Payment reversed" });
}

export async function updateInstallmentAction(installmentId: string, input: unknown) {
  return runAction(z.object({ id: idSchema, data: installmentUpdateSchema }), { id: installmentId, data: input }, (u, v) => loans.updateInstallment(u.id, v.id, v.data), {
    success: "Installment updated",
  });
}

export async function rescheduleLoanAction(loanId: string, input: unknown) {
  return runAction(z.object({ id: idSchema, data: rescheduleSchema }), { id: loanId, data: input }, (u, v) => loans.rescheduleLoan(u.id, v.id, v.data.mode), {
    success: "Schedule regenerated",
  });
}

export async function setLoanStatusAction(loanId: string, status: "ACTIVE" | "DEFAULTED") {
  return runAction(z.object({ id: idSchema, status: z.enum(["ACTIVE", "DEFAULTED"]) }), { id: loanId, status }, (u, v) => loans.setLoanStatus(u.id, v.id, v.status), {
    success: "Loan status updated",
  });
}
