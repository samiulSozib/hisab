import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { d } from "@/lib/money";
import { addMonths, parseDateOnly, toDateOnly, todayString } from "@/lib/dates";
import { createAccount, deleteAccount, recalculateBalances, transferBetweenAccounts, adjustAccountBalance } from "@/server/services/accounts";
import { createCashflow, deleteTransaction, updateCashflow, getTransactionDetail } from "@/server/services/transactions";
import { createBankLoan, createEmiLoan, createPersonalLoan, deleteLoan, deleteLoanPayment, getLoanDetail, recordLoanPayment, rescheduleLoan } from "@/server/services/loans";
import { createRecurring, processDueRecurring } from "@/server/services/recurring";
import { getCashflowSummary, getNetWorth } from "@/server/services/reports";
import { DomainError, NotFoundError } from "@/server/errors";

const run = `${Date.now()}`;
let A = "";
let B = "";
const today = todayString();
const monthAgo = toDateOnly(addMonths(parseDateOnly(today), -1));

async function balance(id: string) {
  const a = await db.account.findUniqueOrThrow({ where: { id } });
  return a.currentBalance.toFixed(2);
}

async function makeUser(tag: string) {
  const u = await db.user.create({
    data: { name: tag, email: `${tag}-${run}@test.local`, passwordHash: "x", emailVerified: new Date() },
  });
  await db.category.createMany({
    data: [
      { userId: u.id, kind: "INCOME", name: "Salary" },
      { userId: u.id, kind: "EXPENSE", name: "Food" },
      { userId: u.id, kind: "EXPENSE", name: "Electronics" },
    ],
  });
  return u.id;
}
const cat = async (userId: string, name: string) => (await db.category.findFirstOrThrow({ where: { userId, name } })).id;

beforeAll(async () => {
  A = await makeUser("alice");
  B = await makeUser("bob");
});

afterAll(async () => {
  await db.user.deleteMany({ where: { id: { in: [A, B] } } });
  await db.$disconnect();
});

describe("accounts & ledger", () => {
  it("opening balance, income, expense, transfer keep balances exact", async () => {
    const bank = await createAccount(A, { name: "Bank", type: "BANK", openingBalance: "1000.10", openingDate: monthAgo, includeInNetWorth: true });
    const cash = await createAccount(A, { name: "Cash", type: "CASH", openingBalance: "0", openingDate: monthAgo, includeInNetWorth: true });
    expect(await balance(bank.id)).toBe("1000.10");

    await createCashflow(A, { type: "INCOME", amount: "0.20", date: today, accountId: bank.id, categoryId: await cat(A, "Salary") });
    const exp = await createCashflow(A, { type: "EXPENSE", amount: "0.10", date: today, accountId: bank.id, categoryId: await cat(A, "Food") });
    expect(await balance(bank.id)).toBe("1000.20"); // 1000.10 + 0.20 − 0.10, no float drift

    await transferBetweenAccounts(A, { fromAccountId: bank.id, toAccountId: cash.id, amount: "200.00", date: today });
    expect(await balance(bank.id)).toBe("800.20");
    expect(await balance(cash.id)).toBe("200.00");

    // Editing an expense moves it between accounts atomically
    await updateCashflow(A, exp.id, { type: "EXPENSE", amount: "50.00", date: today, accountId: cash.id, categoryId: await cat(A, "Food") });
    expect(await balance(bank.id)).toBe("800.30");
    expect(await balance(cash.id)).toBe("150.00");

    await deleteTransaction(A, exp.id);
    expect(await balance(cash.id)).toBe("200.00");

    await adjustAccountBalance(A, { accountId: cash.id, actualBalance: "180.00", date: today });
    expect(await balance(cash.id)).toBe("180.00");

    expect(await recalculateBalances(A)).toEqual([]);
  });

  it("transfers are excluded from income and expenses", async () => {
    const s = await getCashflowSummary(A, parseDateOnly(monthAgo), parseDateOnly(today));
    expect(s.income).toBe("0.20");
    expect(s.expenses).toBe("0.00");
  });

  it("refuses to delete an account with history", async () => {
    const bank = await db.account.findFirstOrThrow({ where: { userId: A, name: "Bank" } });
    await expect(deleteAccount(A, bank.id)).rejects.toBeInstanceOf(DomainError);
  });
});

describe("multi-user isolation", () => {
  it("user B can never read or modify user A's records", async () => {
    const bank = await db.account.findFirstOrThrow({ where: { userId: A, name: "Bank" } });
    const tx = await db.transaction.findFirstOrThrow({ where: { userId: A, type: "INCOME" } });
    const bCat = await cat(B, "Salary");

    expect(await getTransactionDetail(B, tx.id)).toBeNull();
    await expect(deleteTransaction(B, tx.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(updateCashflow(B, tx.id, { type: "INCOME", amount: "1.00", date: today, accountId: bank.id, categoryId: bCat })).rejects.toBeInstanceOf(NotFoundError);
    // B cannot post into A's account, nor use A's category
    await expect(createCashflow(B, { type: "INCOME", amount: "1.00", date: today, accountId: bank.id, categoryId: bCat })).rejects.toBeInstanceOf(NotFoundError);
    const bAcc = await createAccount(B, { name: "B bank", type: "BANK", openingBalance: "10", openingDate: today, includeInNetWorth: true });
    await expect(createCashflow(B, { type: "INCOME", amount: "1.00", date: today, accountId: bAcc.id, categoryId: await cat(A, "Salary") })).rejects.toBeInstanceOf(NotFoundError);
    await expect(transferBetweenAccounts(B, { fromAccountId: bAcc.id, toAccountId: bank.id, amount: "1.00", date: today })).rejects.toBeInstanceOf(NotFoundError);
    await expect(deleteAccount(B, bank.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await balance(bank.id)).toBe("800.30");
  });
});

describe("loans", () => {
  it("EMI purchase: full price is one expense, financing is not income, net cash = −down payment", async () => {
    const acc = await createAccount(A, { name: "Card", type: "BANK", openingBalance: "50000", openingDate: monthAgo, includeInNetWorth: true });
    const before = await getNetWorth(A);
    const emi = await createEmiLoan(A, {
      title: "Laptop",
      counterparty: "Shop",
      purchasePrice: "120000.00",
      downPayment: "20000.00",
      startDate: today,
      accountId: acc.id,
      purchaseCategoryId: await cat(A, "Electronics"),
      recordPurchase: true,
      interestRate: "0",
      interestMethod: "NONE",
      frequency: "MONTHLY",
      installmentCount: 10,
      firstPaymentDate: toDateOnly(addMonths(parseDateOnly(today), 1)),
    });
    expect(await balance(acc.id)).toBe("30000.00");
    const s = await getCashflowSummary(A, parseDateOnly(today), parseDateOnly(today));
    expect(s.income).toBe("0.20"); // financing did NOT create income
    expect(s.spending).toBe("120000.00");
    const after = await getNetWorth(A);
    expect(d(before.netWorth).minus(after.netWorth).toFixed(2)).toBe("120000.00");

    const detail = (await getLoanDetail(A, emi.id))!;
    expect(detail.installments).toHaveLength(10);
    expect(detail.outstandingPrincipal).toBe("100000.00");

    // Paying an installment reduces liability and cash, and only interest would be expense (0 here).
    const p = await recordLoanPayment(A, emi.id, { amount: "10000.00", date: today, accountId: acc.id, splitMode: "auto" });
    expect(await balance(acc.id)).toBe("20000.00");
    const s2 = await getCashflowSummary(A, parseDateOnly(today), parseDateOnly(today));
    expect(s2.spending).toBe("120000.00"); // EMI principal is NOT a new expense
    expect((await getLoanDetail(A, emi.id))!.outstandingPrincipal).toBe("90000.00");

    await deleteLoanPayment(A, p.payment.id);
    expect(await balance(acc.id)).toBe("30000.00");
    expect((await getLoanDetail(A, emi.id))!.outstandingPrincipal).toBe("100000.00");

    await deleteLoan(A, emi.id);
    expect(await balance(acc.id)).toBe("50000.00");
    expect(await recalculateBalances(A)).toEqual([]);
  });

  it("bank loan: disbursement, interest split, prepayment, reschedule, early closure", async () => {
    const acc = await createAccount(A, { name: "Loan acc", type: "BANK", openingBalance: "0", openingDate: monthAgo, includeInNetWorth: true });
    const loan = await createBankLoan(A, {
      title: "PL",
      counterparty: "Bank",
      principal: "100000.00",
      startDate: monthAgo,
      processingFee: "1000.00",
      accountId: acc.id,
      recordCashFlow: true,
      interestRate: "12",
      interestMethod: "REDUCING_BALANCE",
      frequency: "MONTHLY",
      installmentCount: 12,
      firstPaymentDate: today,
    });
    expect(await balance(acc.id)).toBe("99000.00"); // principal in, fee out
    let det = (await getLoanDetail(A, loan.id))!;
    expect(det.installmentAmount).toBe("8884.88");

    // Installment 1: 1000.00 interest + 7884.88 principal
    await recordLoanPayment(A, loan.id, { amount: "8884.88", date: today, accountId: acc.id, splitMode: "auto" });
    det = (await getLoanDetail(A, loan.id))!;
    expect(det.interestPaid).toBe("1000.00");
    expect(det.outstandingPrincipal).toBe("92115.12");
    expect(det.metrics.paidInstallments).toBe(1);

    // Prepay 20,000 on installment 2 (interest due 921.15 first)
    await recordLoanPayment(A, loan.id, { amount: "28884.88", date: today, accountId: acc.id, splitMode: "auto" });
    det = (await getLoanDetail(A, loan.id))!;
    expect(det.outstandingPrincipal).toBe("64151.39");
    expect(det.metrics.scheduleOutOfSync).toBe(true);

    await rescheduleLoan(A, loan.id, "KEEP_INSTALLMENT");
    det = (await getLoanDetail(A, loan.id))!;
    expect(det.metrics.scheduleOutOfSync).toBe(false);
    expect(det.metrics.remainingInstallments).toBeLessThan(10);

    // Overpaying beyond what is owed is rejected
    await expect(recordLoanPayment(A, loan.id, { amount: "999999.00", date: today, accountId: acc.id, splitMode: "auto" })).rejects.toBeInstanceOf(DomainError);

    // Early full repayment (manual split) closes the loan and waives the remaining schedule
    const payoff = await recordLoanPayment(A, loan.id, {
      amount: det.outstandingPrincipal,
      date: today,
      accountId: acc.id,
      splitMode: "manual",
      principalAmount: det.outstandingPrincipal,
      interestAmount: "0",
    });
    expect(payoff.closed).toBe(true);
    det = (await getLoanDetail(A, loan.id))!;
    expect(det.status).toBe("CLOSED");
    expect(det.outstandingPrincipal).toBe("0.00");
    expect(det.metrics.remainingInstallments).toBe(0);

    // Reversing the payoff re-opens it
    await deleteLoanPayment(A, payoff.payment.id);
    det = (await getLoanDetail(A, loan.id))!;
    expect(det.status).toBe("ACTIVE");
    expect(det.outstandingPrincipal).toBe("64151.39");

    // Interest + fee are expenses; principal never is
    const s = await getCashflowSummary(A, parseDateOnly(monthAgo), parseDateOnly(today));
    expect(d(s.financingCost).toFixed(2)).toBe(d("1000.00").plus("921.15").toFixed(2));
    expect(await recalculateBalances(A)).toEqual([]);

    // B cannot touch A's loan
    await expect(recordLoanPayment(B, loan.id, { amount: "1.00", date: today, accountId: acc.id, splitMode: "auto" })).rejects.toBeInstanceOf(NotFoundError);
    expect(await getLoanDetail(B, loan.id)).toBeNull();
  });

  it("personal lent loan creates a receivable and collections restore cash", async () => {
    const acc = await createAccount(A, { name: "Wallet", type: "BKASH", openingBalance: "5000", openingDate: monthAgo, includeInNetWorth: true });
    const before = await getNetWorth(A);
    const loan = await createPersonalLoan(A, { title: "To friend", counterparty: "Friend", direction: "LENT", principal: "3000.00", startDate: today, interestRate: "0", accountId: acc.id, recordCashFlow: true });
    expect(await balance(acc.id)).toBe("2000.00");
    const mid = await getNetWorth(A);
    expect(mid.netWorth).toBe(before.netWorth); // cash became a receivable
    expect(d(mid.receivables).minus(before.receivables).toFixed(2)).toBe("3000.00");
    await recordLoanPayment(A, loan.id, { amount: "1000.00", date: today, accountId: acc.id, splitMode: "auto" });
    expect(await balance(acc.id)).toBe("3000.00");
    expect((await getLoanDetail(A, loan.id))!.outstandingPrincipal).toBe("2000.00");
  });
});

describe("recurring", () => {
  it("posts back-dated occurrences once and is idempotent", async () => {
    const acc = await createAccount(A, { name: "Salary acc", type: "BANK", openingBalance: "0", openingDate: monthAgo, includeInNetWorth: true });
    const start = toDateOnly(addMonths(parseDateOnly(today), -2));
    await createRecurring(A, { type: "INCOME", amount: "1000.00", accountId: acc.id, categoryId: await cat(A, "Salary"), frequency: "MONTHLY", interval: 1, startDate: start, isActive: true });
    const first = await processDueRecurring(A);
    const second = await processDueRecurring(A);
    expect(first).toBe(3); // 2 months ago, 1 month ago, today
    expect(second).toBe(0);
    expect(await balance(acc.id)).toBe("3000.00");
  });
});
