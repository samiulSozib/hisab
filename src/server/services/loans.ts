import "server-only";
import { db, type DbTx } from "@/lib/db";
import { addPeriods, parseDateOnly, toDateOnly, today } from "@/lib/dates";
import {
  accruedSimpleInterest,
  allocatePayment,
  generateSchedule,
  installmentStatus,
  LoanMathError,
  rescheduleRemaining,
  type InterestMethod,
  type PaymentFrequency,
  type ScheduleRow,
} from "@/lib/finance/loan-math";
import { balanceEffects } from "@/lib/finance/ledger";
import { d, toMoneyString, ZERO } from "@/lib/money";
import { FEES_CATEGORY } from "@/lib/constants";
import type {
  bankLoanSchema,
  emiLoanSchema,
  installmentUpdateSchema,
  loanPaymentSchema,
  loanUpdateSchema,
  personalLoanSchema, ServiceInput } from "@/lib/validations/schemas";
import { DomainError, NotFoundError } from "@/server/errors";
import { audit, diff } from "./audit";
import { ensureCategory } from "./categories";
import { applyEffects, assertAccountsOwned, assertCategoryOwned, createLedgerEntry } from "./ledger";

const AUTO_WAIVE_NOTE = "Closed — loan fully repaid early";
const UNPAID = ["PENDING", "PARTIAL", "MISSED"] as const;

function mathGuard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    if (e instanceof LoanMathError) throw new DomainError(e.message);
    throw e;
  }
}

async function insertSchedule(tx: DbTx, userId: string, loanId: string, rows: ScheduleRow[]) {
  await tx.loanInstallment.createMany({
    data: rows.map((r) => ({
      loanId,
      userId,
      number: r.number,
      dueDate: r.dueDate,
      scheduledAmount: r.payment.toFixed(2),
      scheduledPrincipal: r.principal.toFixed(2),
      scheduledInterest: r.interest.toFixed(2),
      openingBalance: r.openingBalance.toFixed(2),
      closingBalance: r.closingBalance.toFixed(2),
    })),
  });
}

// ───────────── Create ─────────────

export async function createPersonalLoan(userId: string, data: ServiceInput<typeof personalLoanSchema>) {
  return db.$transaction(async (tx) => {
    await assertAccountsOwned(tx, userId, [data.accountId]);
    const hasInterest = d(data.interestRate).greaterThan(0);
    const loan = await tx.loan.create({
      data: {
        userId,
        kind: "PERSONAL",
        direction: data.direction,
        title: data.title,
        counterparty: data.counterparty,
        principal: data.principal,
        outstandingPrincipal: data.principal,
        interestRate: data.interestRate,
        interestMethod: hasInterest ? "SIMPLE" : "NONE",
        startDate: parseDateOnly(data.startDate),
        dueDate: data.dueDate ? parseDateOnly(data.dueDate) : null,
        repaymentTerms: data.repaymentTerms ?? null,
        description: data.description ?? null,
        accountId: data.accountId,
      },
    });
    if (data.recordCashFlow) {
      await createLedgerEntry(tx, userId, {
        type: data.direction === "BORROWED" ? "LOAN_RECEIVED" : "LOAN_GIVEN",
        amount: data.principal,
        date: data.startDate,
        accountId: data.accountId,
        loanId: loan.id,
        counterparty: data.counterparty,
        description: data.direction === "BORROWED" ? `Borrowed from ${data.counterparty}` : `Lent to ${data.counterparty}`,
      });
    }
    await audit(tx, {
      userId,
      action: "CREATE",
      entityType: "Loan",
      entityId: loan.id,
      summary: `${data.direction === "BORROWED" ? "Borrowed" : "Lent"} ${data.principal} (${data.counterparty})`,
    });
    return loan;
  });
}

export async function createEmiLoan(userId: string, data: ServiceInput<typeof emiLoanSchema>) {
  const financed = d(data.purchasePrice).minus(d(data.downPayment ?? "0"));
  const rows = mathGuard(() =>
    generateSchedule({
      principal: financed,
      annualRate: data.interestRate,
      installments: data.installmentCount,
      firstDueDate: parseDateOnly(data.firstPaymentDate),
      frequency: data.frequency,
      method: data.interestMethod,
      installmentAmount: data.installmentAmount,
    }),
  );

  return db.$transaction(async (tx) => {
    await assertAccountsOwned(tx, userId, [data.accountId]);
    await assertCategoryOwned(tx, userId, data.purchaseCategoryId, "EXPENSE");
    const loan = await tx.loan.create({
      data: {
        userId,
        kind: "EMI",
        direction: "BORROWED",
        title: data.title,
        counterparty: data.counterparty,
        principal: toMoneyString(financed),
        outstandingPrincipal: toMoneyString(financed),
        interestRate: data.interestRate,
        interestMethod: d(data.interestRate).isZero() ? "NONE" : data.interestMethod,
        frequency: data.frequency,
        installmentCount: rows.length,
        installmentAmount: (data.installmentAmount ? d(data.installmentAmount) : rows[0].payment).toFixed(2),
        startDate: parseDateOnly(data.startDate),
        firstPaymentDate: parseDateOnly(data.firstPaymentDate),
        finalPaymentDate: data.finalPaymentDate ? parseDateOnly(data.finalPaymentDate) : rows.at(-1)!.dueDate,
        accountId: data.accountId,
        purchasePrice: data.purchasePrice,
        downPayment: data.downPayment ?? "0",
        purchaseCategoryId: data.purchaseCategoryId ?? null,
        description: data.description ?? null,
      },
    });
    await insertSchedule(tx, userId, loan.id, rows);

    if (data.recordPurchase) {
      // The purchase is an expense of its FULL price, funded by the down payment plus financing.
      // Financing is a liability inflow (LOAN_RECEIVED), never income. Net cash effect = −down payment.
      const categoryId = data.purchaseCategoryId ?? (await ensureCategory(tx, userId, "EXPENSE", "Shopping"));
      await createLedgerEntry(tx, userId, {
        type: "EXPENSE",
        amount: data.purchasePrice,
        date: data.startDate,
        accountId: data.accountId,
        categoryId,
        loanId: loan.id,
        counterparty: data.counterparty,
        description: `Purchase: ${data.title}`,
      });
      await createLedgerEntry(tx, userId, {
        type: "LOAN_RECEIVED",
        amount: toMoneyString(financed),
        date: data.startDate,
        accountId: data.accountId,
        loanId: loan.id,
        counterparty: data.counterparty,
        description: `EMI financing: ${data.title}`,
      });
    }
    await audit(tx, {
      userId,
      action: "CREATE",
      entityType: "Loan",
      entityId: loan.id,
      summary: `EMI "${data.title}" — financed ${toMoneyString(financed)} over ${rows.length} installments`,
    });
    return loan;
  });
}

export async function createBankLoan(userId: string, data: ServiceInput<typeof bankLoanSchema>) {
  const rows = mathGuard(() =>
    generateSchedule({
      principal: data.principal,
      annualRate: data.interestRate,
      installments: data.installmentCount,
      firstDueDate: parseDateOnly(data.firstPaymentDate),
      frequency: data.frequency,
      method: data.interestMethod,
      installmentAmount: data.installmentAmount,
    }),
  );
  const monthsPerPeriod = { WEEKLY: 0, BIWEEKLY: 0, MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 }[data.frequency];

  return db.$transaction(async (tx) => {
    await assertAccountsOwned(tx, userId, [data.accountId]);
    const loan = await tx.loan.create({
      data: {
        userId,
        kind: "BANK",
        direction: "BORROWED",
        title: data.title,
        counterparty: data.counterparty,
        loanType: data.loanType ?? null,
        referenceNumber: data.referenceNumber ?? null,
        principal: data.principal,
        outstandingPrincipal: data.principal,
        interestRate: data.interestRate,
        interestMethod: d(data.interestRate).isZero() ? "NONE" : data.interestMethod,
        frequency: data.frequency,
        installmentCount: rows.length,
        installmentAmount: (data.installmentAmount ? d(data.installmentAmount) : rows[0].payment).toFixed(2),
        termMonths: data.termMonths ?? (monthsPerPeriod ? data.installmentCount * monthsPerPeriod : null),
        startDate: parseDateOnly(data.startDate),
        firstPaymentDate: parseDateOnly(data.firstPaymentDate),
        finalPaymentDate: rows.at(-1)!.dueDate,
        processingFee: data.processingFee ?? null,
        accountId: data.accountId,
        description: data.description ?? null,
      },
    });
    await insertSchedule(tx, userId, loan.id, rows);

    if (data.recordCashFlow) {
      await createLedgerEntry(tx, userId, {
        type: "LOAN_RECEIVED",
        amount: data.principal,
        date: data.startDate,
        accountId: data.accountId,
        loanId: loan.id,
        counterparty: data.counterparty,
        reference: data.referenceNumber ?? null,
        description: `Loan disbursement: ${data.title}`,
      });
      if (data.processingFee && d(data.processingFee).greaterThan(0)) {
        const feeCategory = await ensureCategory(tx, userId, "EXPENSE", FEES_CATEGORY);
        await createLedgerEntry(tx, userId, {
          type: "EXPENSE",
          amount: data.processingFee,
          date: data.startDate,
          accountId: data.accountId,
          categoryId: feeCategory,
          loanId: loan.id,
          counterparty: data.counterparty,
          description: `Processing fee: ${data.title}`,
        });
      }
    }
    await audit(tx, {
      userId,
      action: "CREATE",
      entityType: "Loan",
      entityId: loan.id,
      summary: `Bank loan "${data.title}" — ${data.principal} from ${data.counterparty}`,
    });
    return loan;
  });
}

export async function updateLoanDetails(userId: string, loanId: string, data: ServiceInput<typeof loanUpdateSchema>) {
  return db.$transaction(async (tx) => {
    const loan = await tx.loan.findFirst({ where: { id: loanId, userId } });
    if (!loan) throw new NotFoundError("Loan");
    const updated = await tx.loan.update({
      where: { id: loanId },
      data: {
        title: data.title,
        counterparty: data.counterparty,
        repaymentTerms: data.repaymentTerms ?? null,
        dueDate: data.dueDate ? parseDateOnly(data.dueDate) : null,
        referenceNumber: data.referenceNumber ?? null,
        description: data.description ?? null,
      },
    });
    await audit(tx, { userId, action: "UPDATE", entityType: "Loan", entityId: loanId, summary: `Updated loan "${updated.title}"`, changes: diff(loan, updated) });
  });
}

/** Delete a loan and reverse every balance effect it produced (disbursement, purchase, payments). */
export async function deleteLoan(userId: string, loanId: string) {
  return db.$transaction(async (tx) => {
    const loan = await tx.loan.findFirst({ where: { id: loanId, userId } });
    if (!loan) throw new NotFoundError("Loan");
    const entries = await tx.transaction.findMany({ where: { loanId, userId } });
    await applyEffects(
      tx,
      entries.flatMap((e) => balanceEffects({ ...e, amount: e.amount.toString() }, -1)),
    );
    await tx.loan.delete({ where: { id: loanId } }); // cascades installments, payments, ledger rows
    await audit(tx, {
      userId,
      action: "DELETE",
      entityType: "Loan",
      entityId: loanId,
      summary: `Deleted loan "${loan.title}" and reversed ${entries.length} related transaction(s)`,
      changes: { principal: loan.principal, outstanding: loan.outstandingPrincipal },
    });
  });
}

// ───────────── Payments ─────────────

/** Interest suggested for the next payment (scheduled interest still unpaid, or accrued simple interest). */
async function interestDueFor(
  tx: DbTx,
  loan: { id: string; interestRate: { toString(): string }; outstandingPrincipal: { toString(): string }; startDate: Date; interestMethod: string },
  installment: { scheduledInterest: { toString(): string }; interestPaid: { toString(): string } } | null,
  paymentDate: Date,
) {
  if (installment) return d(installment.scheduledInterest).minus(d(installment.interestPaid));
  if (loan.interestMethod !== "SIMPLE" || d(loan.interestRate).isZero()) return ZERO;
  const last = await tx.loanPayment.findFirst({ where: { loanId: loan.id }, orderBy: { date: "desc" }, select: { date: true } });
  return accruedSimpleInterest(loan.outstandingPrincipal, loan.interestRate, last?.date ?? loan.startDate, paymentDate);
}

export async function recordLoanPayment(userId: string, loanId: string, data: ServiceInput<typeof loanPaymentSchema>) {
  return db.$transaction(async (tx) => {
    const loan = await tx.loan.findFirst({ where: { id: loanId, userId } });
    if (!loan) throw new NotFoundError("Loan");
    if (loan.status === "CLOSED") throw new DomainError("This loan is already closed.");
    await assertAccountsOwned(tx, userId, [data.accountId]);

    const hasSchedule = loan.kind !== "PERSONAL";
    let installment = null;
    if (hasSchedule) {
      installment = data.installmentId
        ? await tx.loanInstallment.findFirst({ where: { id: data.installmentId, loanId } })
        : await tx.loanInstallment.findFirst({ where: { loanId, status: { in: [...UNPAID] } }, orderBy: { number: "asc" } });
      if (data.installmentId && !installment) throw new NotFoundError("Installment");
      if (installment && (installment.status === "PAID" || installment.status === "WAIVED")) {
        throw new DomainError(`Installment #${installment.number} is already ${installment.status.toLowerCase()}.`);
      }
    }

    const paymentDate = parseDateOnly(data.date);
    const interestDue = await interestDueFor(tx, loan, installment, paymentDate);
    const alloc = mathGuard(() =>
      allocatePayment({
        amount: data.amount,
        fee: data.fee,
        interestDue,
        outstandingPrincipal: loan.outstandingPrincipal.toString(),
        override:
          data.splitMode === "manual"
            ? { principal: data.principalAmount ?? "0", interest: data.interestAmount ?? "0" }
            : null,
      }),
    );

    const txType = loan.direction === "LENT" ? "LOAN_COLLECTION" : loan.kind === "EMI" ? "EMI_PAYMENT" : "LOAN_REPAYMENT";
    const entry = await createLedgerEntry(tx, userId, {
      type: txType,
      amount: alloc.amount.toFixed(2),
      date: data.date,
      accountId: data.accountId,
      loanId,
      counterparty: loan.counterparty,
      description:
        (installment ? `Installment #${installment.number} — ` : "") +
        (loan.direction === "LENT" ? `Collection from ${loan.counterparty}` : `Payment: ${loan.title}`),
      reference: data.notes ?? null,
    });

    const payment = await tx.loanPayment.create({
      data: {
        userId,
        loanId,
        installmentId: installment?.id ?? null,
        transactionId: entry.id,
        date: paymentDate,
        amount: alloc.amount.toFixed(2),
        principalAmount: alloc.principal.toFixed(2),
        interestAmount: alloc.interest.toFixed(2),
        feeAmount: alloc.fee.toFixed(2),
        notes: data.notes ?? null,
      },
    });

    if (installment) {
      const paid = d(installment.paidAmount).plus(alloc.principal).plus(alloc.interest);
      await tx.loanInstallment.update({
        where: { id: installment.id },
        data: {
          paidAmount: paid.toFixed(2),
          principalPaid: d(installment.principalPaid).plus(alloc.principal).toFixed(2),
          interestPaid: d(installment.interestPaid).plus(alloc.interest).toFixed(2),
          feesPaid: d(installment.feesPaid).plus(alloc.fee).toFixed(2),
          lastPaymentDate: paymentDate,
          status: installmentStatus(paid, installment.scheduledAmount.toString(), installment.status),
        },
      });
    }

    const outstanding = d(loan.outstandingPrincipal).minus(alloc.principal);
    const closed = outstanding.isZero();
    await tx.loan.update({
      where: { id: loanId },
      data: {
        principalRepaid: d(loan.principalRepaid).plus(alloc.principal).toFixed(2),
        interestPaid: d(loan.interestPaid).plus(alloc.interest).toFixed(2),
        feesPaid: d(loan.feesPaid).plus(alloc.fee).toFixed(2),
        outstandingPrincipal: outstanding.toFixed(2),
        ...(closed ? { status: "CLOSED", closedAt: new Date() } : {}),
      },
    });
    if (closed && hasSchedule) {
      await tx.loanInstallment.updateMany({
        where: { loanId, status: { in: [...UNPAID] } },
        data: { status: "WAIVED", notes: AUTO_WAIVE_NOTE },
      });
    }

    await audit(tx, {
      userId,
      action: "CREATE",
      entityType: "LoanPayment",
      entityId: payment.id,
      summary: `${loan.direction === "LENT" ? "Collected" : "Paid"} ${alloc.amount.toFixed(2)} on "${loan.title}" (principal ${alloc.principal.toFixed(2)}, interest ${alloc.interest.toFixed(2)}, fees ${alloc.fee.toFixed(2)})${closed ? " — loan closed" : ""}`,
    });
    return { payment, closed };
  });
}

export async function deleteLoanPayment(userId: string, paymentId: string) {
  return db.$transaction(async (tx) => {
    const payment = await tx.loanPayment.findFirst({
      where: { id: paymentId, userId },
      include: { transaction: true, loan: true, installment: true },
    });
    if (!payment) throw new NotFoundError("Payment");
    const { loan, installment, transaction } = payment;

    await applyEffects(tx, balanceEffects({ ...transaction, amount: transaction.amount.toString() }, -1));

    if (installment) {
      const paid = d(installment.paidAmount).minus(payment.principalAmount.toString()).minus(payment.interestAmount.toString());
      await tx.loanInstallment.update({
        where: { id: installment.id },
        data: {
          paidAmount: paid.toFixed(2),
          principalPaid: d(installment.principalPaid).minus(payment.principalAmount.toString()).toFixed(2),
          interestPaid: d(installment.interestPaid).minus(payment.interestAmount.toString()).toFixed(2),
          feesPaid: d(installment.feesPaid).minus(payment.feeAmount.toString()).toFixed(2),
          status: installmentStatus(paid, installment.scheduledAmount.toString(), installment.status === "PAID" || installment.status === "PARTIAL" ? "PENDING" : installment.status),
        },
      });
    }

    const outstanding = d(loan.outstandingPrincipal).plus(payment.principalAmount.toString());
    await tx.loan.update({
      where: { id: loan.id },
      data: {
        principalRepaid: d(loan.principalRepaid).minus(payment.principalAmount.toString()).toFixed(2),
        interestPaid: d(loan.interestPaid).minus(payment.interestAmount.toString()).toFixed(2),
        feesPaid: d(loan.feesPaid).minus(payment.feeAmount.toString()).toFixed(2),
        outstandingPrincipal: outstanding.toFixed(2),
        ...(loan.status === "CLOSED" && outstanding.greaterThan(0) ? { status: "ACTIVE", closedAt: null } : {}),
      },
    });
    if (loan.status === "CLOSED" && outstanding.greaterThan(0)) {
      await tx.loanInstallment.updateMany({
        where: { loanId: loan.id, status: "WAIVED", notes: AUTO_WAIVE_NOTE },
        data: { status: "PENDING", notes: null },
      });
    }

    // Deleting the ledger row cascades to the LoanPayment.
    await tx.transaction.delete({ where: { id: transaction.id } });
    await audit(tx, {
      userId,
      action: "DELETE",
      entityType: "LoanPayment",
      entityId: paymentId,
      summary: `Reversed payment of ${payment.amount.toFixed(2)} on "${loan.title}"`,
    });
  });
}

// ───────────── Schedule adjustments ─────────────

export async function updateInstallment(userId: string, installmentId: string, data: ServiceInput<typeof installmentUpdateSchema>) {
  return db.$transaction(async (tx) => {
    const inst = await tx.loanInstallment.findFirst({ where: { id: installmentId, userId }, include: { loan: true } });
    if (!inst) throw new NotFoundError("Installment");
    if (inst.status === "PAID") throw new DomainError("A paid installment cannot be changed. Delete its payment first.");
    const status = data.status === "PENDING" ? installmentStatus(inst.paidAmount.toString(), inst.scheduledAmount.toString()) : data.status;
    await tx.loanInstallment.update({
      where: { id: installmentId },
      data: { status, dueDate: parseDateOnly(data.dueDate), notes: data.notes ?? null },
    });
    await audit(tx, {
      userId,
      action: "UPDATE",
      entityType: "LoanInstallment",
      entityId: installmentId,
      summary: `Installment #${inst.number} of "${inst.loan.title}" → ${status.toLowerCase()}, due ${data.dueDate}`,
    });
  });
}

/** Regenerate all not-yet-paid installments from the current outstanding principal. */
export async function rescheduleLoan(userId: string, loanId: string, mode: "KEEP_TERM" | "KEEP_INSTALLMENT") {
  return db.$transaction(async (tx) => {
    const loan = await tx.loan.findFirst({ where: { id: loanId, userId }, include: { installments: { orderBy: { number: "asc" } } } });
    if (!loan) throw new NotFoundError("Loan");
    if (loan.kind === "PERSONAL" || !loan.frequency) throw new DomainError("Only scheduled (EMI / bank) loans can be rescheduled.");
    if (loan.status === "CLOSED") throw new DomainError("This loan is closed.");

    const replaceable = loan.installments.filter((i) => (i.status === "PENDING" || i.status === "MISSED") && d(i.paidAmount).isZero());
    const partial = loan.installments.filter((i) => i.status === "PARTIAL");
    const kept = loan.installments.filter((i) => !replaceable.includes(i));
    const lastKept = kept.at(-1);
    const frequency = loan.frequency as PaymentFrequency;
    const nextDueDate = replaceable[0]?.dueDate ?? (lastKept ? addPeriods(lastKept.dueDate, frequency, 1) : today());
    const nextNumber = (lastKept?.number ?? 0) + 1;

    const rows = mathGuard(() =>
      rescheduleRemaining({
        outstandingPrincipal: loan.outstandingPrincipal.toString(),
        annualRate: loan.interestRate.toString(),
        method: loan.interestMethod as InterestMethod,
        frequency,
        nextDueDate,
        nextNumber,
        remainingInstallments: Math.max(1, replaceable.length),
        currentInstallmentAmount: loan.installmentAmount?.toString() ?? "0",
        mode,
      }),
    );

    // Partially-paid installments are closed out; their unpaid remainder is folded into the new schedule.
    if (partial.length) {
      await tx.loanInstallment.updateMany({
        where: { id: { in: partial.map((p) => p.id) } },
        data: { status: "WAIVED", notes: "Remainder moved into rescheduled installments" },
      });
    }
    await tx.loanInstallment.deleteMany({ where: { id: { in: replaceable.map((r) => r.id) } } });
    await insertSchedule(tx, userId, loanId, rows);
    await tx.loan.update({
      where: { id: loanId },
      data: {
        installmentCount: kept.length + rows.length,
        installmentAmount: rows[0]?.payment.toFixed(2) ?? loan.installmentAmount,
        finalPaymentDate: rows.at(-1)?.dueDate ?? loan.finalPaymentDate,
      },
    });
    await audit(tx, {
      userId,
      action: "UPDATE",
      entityType: "Loan",
      entityId: loanId,
      summary: `Rescheduled "${loan.title}" (${mode === "KEEP_TERM" ? "kept term" : "kept installment"}): ${rows.length} installments of ${rows[0]?.payment.toFixed(2) ?? "0"}`,
    });
    return rows.length;
  });
}

export async function setLoanStatus(userId: string, loanId: string, status: "ACTIVE" | "DEFAULTED") {
  return db.$transaction(async (tx) => {
    const loan = await tx.loan.findFirst({ where: { id: loanId, userId } });
    if (!loan) throw new NotFoundError("Loan");
    if (loan.status === "CLOSED") throw new DomainError("Closed loans cannot change status.");
    await tx.loan.update({ where: { id: loanId }, data: { status } });
    await audit(tx, { userId, action: "UPDATE", entityType: "Loan", entityId: loanId, summary: `Marked "${loan.title}" as ${status.toLowerCase()}` });
  });
}

// ───────────── Queries ─────────────

export type LoanSummaryDTO = {
  id: string;
  kind: "PERSONAL" | "EMI" | "BANK";
  direction: "BORROWED" | "LENT";
  status: string;
  title: string;
  counterparty: string;
  principal: string;
  outstandingPrincipal: string;
  principalRepaid: string;
  interestPaid: string;
  interestRate: string;
  installmentAmount: string | null;
  installmentCount: number | null;
  paidInstallments: number;
  startDate: string;
  dueDate: string | null;
  nextDue: { date: string; amount: string; overdue: boolean } | null;
  progress: number;
  accountName: string;
};

export async function listLoans(userId: string, opts: { kind?: "PERSONAL" | "EMI" | "BANK"; status?: "ACTIVE" | "CLOSED" | "ALL" } = {}) {
  const t = today();
  const rows = await db.loan.findMany({
    where: {
      userId,
      ...(opts.kind ? { kind: opts.kind } : {}),
      ...(opts.status && opts.status !== "ALL" ? (opts.status === "ACTIVE" ? { status: { not: "CLOSED" } } : { status: "CLOSED" }) : {}),
    },
    orderBy: [{ status: "asc" }, { startDate: "desc" }],
    include: {
      account: { select: { name: true } },
      installments: {
        where: { status: { in: [...UNPAID] } },
        orderBy: { number: "asc" },
        take: 1,
        select: { dueDate: true, scheduledAmount: true, paidAmount: true },
      },
      _count: { select: { installments: { where: { status: "PAID" } } } },
    },
  });
  return rows.map<LoanSummaryDTO>((l) => {
    const next = l.installments[0];
    const principal = d(l.principal);
    return {
      id: l.id,
      kind: l.kind,
      direction: l.direction,
      status: l.status,
      title: l.title,
      counterparty: l.counterparty,
      principal: l.principal.toFixed(2),
      outstandingPrincipal: l.outstandingPrincipal.toFixed(2),
      principalRepaid: l.principalRepaid.toFixed(2),
      interestPaid: l.interestPaid.toFixed(2),
      interestRate: l.interestRate.toFixed(2),
      installmentAmount: l.installmentAmount?.toFixed(2) ?? null,
      installmentCount: l.installmentCount,
      paidInstallments: l._count.installments,
      startDate: toDateOnly(l.startDate),
      dueDate: l.dueDate ? toDateOnly(l.dueDate) : null,
      nextDue: next
        ? {
            date: toDateOnly(next.dueDate),
            amount: d(next.scheduledAmount).minus(d(next.paidAmount)).toFixed(2),
            overdue: next.dueDate < t,
          }
        : null,
      progress: principal.isZero() ? 100 : d(l.principalRepaid).dividedBy(principal).times(100).toDecimalPlaces(1).toNumber(),
      accountName: l.account.name,
    };
  });
}

export async function getLoanDetail(userId: string, loanId: string) {
  const loan = await db.loan.findFirst({
    where: { id: loanId, userId },
    include: {
      account: { select: { id: true, name: true } },
      purchaseCategory: { select: { name: true } },
      installments: { orderBy: { number: "asc" } },
      payments: {
        orderBy: [{ date: "desc" }, { createdAt: "desc" }],
        include: { transaction: { select: { account: { select: { name: true } } } }, installment: { select: { number: true } } },
      },
      transactions: {
        where: { loanPayment: null },
        orderBy: { date: "asc" },
        select: { id: true, type: true, amount: true, date: true, description: true },
      },
    },
  });
  if (!loan) return null;

  const t = today();
  const unpaid = loan.installments.filter((i) => (UNPAID as readonly string[]).includes(i.status));
  const scheduledInterest = loan.installments.reduce((s, i) => s.plus(d(i.scheduledInterest)), ZERO);
  const remainingScheduled = unpaid.reduce((s, i) => s.plus(d(i.scheduledAmount)).minus(d(i.paidAmount)), ZERO);
  const remainingScheduledPrincipal = unpaid.reduce((s, i) => s.plus(d(i.scheduledPrincipal)).minus(d(i.principalPaid)), ZERO);
  const nextInst = unpaid[0] ?? null;
  const accrued =
    loan.kind === "PERSONAL" && loan.interestMethod === "SIMPLE" && loan.status !== "CLOSED"
      ? accruedSimpleInterest(loan.outstandingPrincipal.toString(), loan.interestRate.toString(), loan.payments[0]?.date ?? loan.startDate, t)
      : ZERO;

  return {
    id: loan.id,
    kind: loan.kind,
    direction: loan.direction,
    status: loan.status,
    title: loan.title,
    counterparty: loan.counterparty,
    principal: loan.principal.toFixed(2),
    interestRate: loan.interestRate.toFixed(2),
    interestMethod: loan.interestMethod,
    frequency: loan.frequency,
    installmentCount: loan.installmentCount,
    installmentAmount: loan.installmentAmount?.toFixed(2) ?? null,
    startDate: toDateOnly(loan.startDate),
    firstPaymentDate: loan.firstPaymentDate ? toDateOnly(loan.firstPaymentDate) : null,
    finalPaymentDate: loan.finalPaymentDate ? toDateOnly(loan.finalPaymentDate) : null,
    dueDate: loan.dueDate ? toDateOnly(loan.dueDate) : null,
    repaymentTerms: loan.repaymentTerms,
    description: loan.description,
    purchasePrice: loan.purchasePrice?.toFixed(2) ?? null,
    downPayment: loan.downPayment?.toFixed(2) ?? null,
    purchaseCategory: loan.purchaseCategory?.name ?? null,
    loanType: loan.loanType,
    referenceNumber: loan.referenceNumber,
    termMonths: loan.termMonths,
    processingFee: loan.processingFee?.toFixed(2) ?? null,
    account: loan.account,
    principalRepaid: loan.principalRepaid.toFixed(2),
    interestPaid: loan.interestPaid.toFixed(2),
    feesPaid: loan.feesPaid.toFixed(2),
    outstandingPrincipal: loan.outstandingPrincipal.toFixed(2),
    closedAt: loan.closedAt?.toISOString() ?? null,
    metrics: {
      totalInstallments: loan.installments.length,
      paidInstallments: loan.installments.filter((i) => i.status === "PAID").length,
      remainingInstallments: unpaid.length,
      overdueInstallments: unpaid.filter((i) => i.dueDate < t).length,
      totalScheduledInterest: scheduledInterest.toFixed(2),
      remainingScheduled: remainingScheduled.toFixed(2),
      /** True when prepayments have made the schedule larger than what is actually owed. */
      scheduleOutOfSync: loan.installments.length > 0 && !remainingScheduledPrincipal.equals(d(loan.outstandingPrincipal)),
      nextPayment: nextInst
        ? { id: nextInst.id, number: nextInst.number, date: toDateOnly(nextInst.dueDate), amount: d(nextInst.scheduledAmount).minus(d(nextInst.paidAmount)).toFixed(2) }
        : null,
      accruedInterest: accrued.toFixed(2),
    },
    installments: loan.installments.map((i) => ({
      id: i.id,
      number: i.number,
      dueDate: toDateOnly(i.dueDate),
      scheduledAmount: i.scheduledAmount.toFixed(2),
      scheduledPrincipal: i.scheduledPrincipal.toFixed(2),
      scheduledInterest: i.scheduledInterest.toFixed(2),
      closingBalance: i.closingBalance.toFixed(2),
      paidAmount: i.paidAmount.toFixed(2),
      principalPaid: i.principalPaid.toFixed(2),
      interestPaid: i.interestPaid.toFixed(2),
      feesPaid: i.feesPaid.toFixed(2),
      lastPaymentDate: i.lastPaymentDate ? toDateOnly(i.lastPaymentDate) : null,
      status: i.status,
      overdue: (UNPAID as readonly string[]).includes(i.status) && i.dueDate < t,
      notes: i.notes,
    })),
    payments: loan.payments.map((p) => ({
      id: p.id,
      transactionId: p.transactionId,
      date: toDateOnly(p.date),
      amount: p.amount.toFixed(2),
      principal: p.principalAmount.toFixed(2),
      interest: p.interestAmount.toFixed(2),
      fee: p.feeAmount.toFixed(2),
      notes: p.notes,
      accountName: p.transaction.account.name,
      installmentNumber: p.installment?.number ?? null,
    })),
    relatedTransactions: loan.transactions.map((x) => ({
      id: x.id,
      type: x.type,
      amount: x.amount.toFixed(2),
      date: toDateOnly(x.date),
      description: x.description,
    })),
  };
}

export type LoanDetail = NonNullable<Awaited<ReturnType<typeof getLoanDetail>>>;

/** Upcoming / overdue installments across all active borrowed loans. */
export async function upcomingInstallments(userId: string, withinDays = 45, take = 8) {
  const t = today();
  const horizon = new Date(t.getTime() + withinDays * 86_400_000);
  const rows = await db.loanInstallment.findMany({
    where: {
      userId,
      status: { in: [...UNPAID] },
      dueDate: { lte: horizon },
      loan: { status: { not: "CLOSED" }, direction: "BORROWED" },
    },
    orderBy: { dueDate: "asc" },
    take,
    include: { loan: { select: { id: true, title: true, kind: true, counterparty: true } } },
  });
  return rows.map((i) => ({
    id: i.id,
    loanId: i.loan.id,
    loanTitle: i.loan.title,
    loanKind: i.loan.kind,
    counterparty: i.loan.counterparty,
    number: i.number,
    dueDate: toDateOnly(i.dueDate),
    amount: d(i.scheduledAmount).minus(d(i.paidAmount)).toFixed(2),
    status: i.status,
    overdue: i.dueDate < t,
    daysLeft: Math.round((i.dueDate.getTime() - t.getTime()) / 86_400_000),
  }));
}

export async function loanTotals(userId: string) {
  const groups = await db.loan.groupBy({
    by: ["kind", "direction"],
    where: { userId, status: { not: "CLOSED" } },
    _sum: { outstandingPrincipal: true, principal: true },
    _count: true,
  });
  const pick = (kind: string, direction: string) => {
    const g = groups.find((x) => x.kind === kind && x.direction === direction);
    return { outstanding: g?._sum.outstandingPrincipal?.toFixed(2) ?? "0.00", count: g?._count ?? 0 };
  };
  return {
    personalBorrowed: pick("PERSONAL", "BORROWED"),
    personalLent: pick("PERSONAL", "LENT"),
    emi: pick("EMI", "BORROWED"),
    bank: pick("BANK", "BORROWED"),
  };
}
