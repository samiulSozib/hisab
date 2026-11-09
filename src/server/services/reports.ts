import "server-only";
import { db } from "@/lib/db";
import { endOfMonth, formatShortMonth, monthKey, monthsBetween, parseDateOnly, startOfMonth, toDateOnly } from "@/lib/dates";
import { computeNetWorth } from "@/lib/finance/ledger";
import { d, ZERO, type MoneyDecimal } from "@/lib/money";

/**
 * Reporting rules
 *  - Income   = INCOME entries + interest received on money lent.
 *  - Expenses = EXPENSE entries + interest and fees paid on borrowed loans ("financing cost").
 *  - Transfers, loan principal received/given/repaid and opening balances are NEVER income or expenses.
 *  - An EMI purchase is an expense once (its full price, on the purchase date); later EMI payments
 *    only add their interest/fee portion to expenses.
 */

type MonthAgg = { month: string; total: string };

const fix = (v: MoneyDecimal) => v.toFixed(2);

async function monthlyByType(userId: string, from: string, to: string) {
  return db.$queryRaw<{ month: string; type: string; total: string }[]>`
    SELECT to_char("date", 'YYYY-MM') AS month, "type"::text AS type, SUM("amount")::text AS total
    FROM "Transaction"
    WHERE "userId" = ${userId} AND "date" >= ${from}::date AND "date" <= ${to}::date AND "type" IN ('INCOME', 'EXPENSE')
    GROUP BY 1, 2`;
}

async function monthlyLoanCosts(userId: string, from: string, to: string) {
  return db.$queryRaw<{ month: string; direction: string; interest: string; fees: string; amount: string; kind: string }[]>`
    SELECT to_char(p."date", 'YYYY-MM') AS month, l."direction"::text AS direction, l."kind"::text AS kind,
           SUM(p."interestAmount")::text AS interest, SUM(p."feeAmount")::text AS fees, SUM(p."amount")::text AS amount
    FROM "LoanPayment" p JOIN "Loan" l ON l."id" = p."loanId"
    WHERE p."userId" = ${userId} AND p."date" >= ${from}::date AND p."date" <= ${to}::date
    GROUP BY 1, 2, 3`;
}

export type CashflowSummary = {
  income: string;
  interestEarned: string;
  spending: string;
  financingCost: string;
  expenses: string;
  net: string;
  savingsRate: number | null;
  installmentsPaid: string;
};

export async function getCashflowSummary(userId: string, fromDate: Date, toDate: Date): Promise<CashflowSummary> {
  const from = toDateOnly(fromDate);
  const to = toDateOnly(toDate);
  const [byType, costs] = await Promise.all([monthlyByType(userId, from, to), monthlyLoanCosts(userId, from, to)]);
  let income = ZERO;
  let spending = ZERO;
  for (const r of byType) {
    if (r.type === "INCOME") income = income.plus(d(r.total));
    else spending = spending.plus(d(r.total));
  }
  let financingCost = ZERO;
  let interestEarned = ZERO;
  let installmentsPaid = ZERO;
  for (const c of costs) {
    if (c.direction === "BORROWED") {
      financingCost = financingCost.plus(d(c.interest)).plus(d(c.fees));
      if (c.kind !== "PERSONAL") installmentsPaid = installmentsPaid.plus(d(c.amount));
    } else {
      interestEarned = interestEarned.plus(d(c.interest));
    }
  }
  const totalIncome = income.plus(interestEarned);
  const expenses = spending.plus(financingCost);
  const net = totalIncome.minus(expenses);
  return {
    income: fix(totalIncome),
    interestEarned: fix(interestEarned),
    spending: fix(spending),
    financingCost: fix(financingCost),
    expenses: fix(expenses),
    net: fix(net),
    savingsRate: totalIncome.greaterThan(0) ? net.dividedBy(totalIncome).times(100).toDecimalPlaces(1).toNumber() : null,
    installmentsPaid: fix(installmentsPaid),
  };
}

export type MonthlyPoint = {
  month: string;
  label: string;
  income: string;
  expenses: string;
  spending: string;
  financingCost: string;
  net: string;
};

export async function getMonthlySeries(userId: string, fromDate: Date, toDate: Date): Promise<MonthlyPoint[]> {
  const from = toDateOnly(startOfMonth(fromDate));
  const to = toDateOnly(endOfMonth(toDate));
  const [byType, costs] = await Promise.all([monthlyByType(userId, from, to), monthlyLoanCosts(userId, from, to)]);
  return monthsBetween(fromDate, toDate).map((m) => {
    const key = monthKey(m);
    const inc = byType.filter((r) => r.month === key && r.type === "INCOME").reduce((s, r) => s.plus(d(r.total)), ZERO);
    const sp = byType.filter((r) => r.month === key && r.type === "EXPENSE").reduce((s, r) => s.plus(d(r.total)), ZERO);
    let fin = ZERO;
    let earned = ZERO;
    for (const c of costs.filter((x) => x.month === key)) {
      if (c.direction === "BORROWED") fin = fin.plus(d(c.interest)).plus(d(c.fees));
      else earned = earned.plus(d(c.interest));
    }
    const income = inc.plus(earned);
    const expenses = sp.plus(fin);
    return {
      month: key,
      label: formatShortMonth(m) + (m.getUTCMonth() === 0 ? ` ${String(m.getUTCFullYear()).slice(2)}` : ""),
      income: fix(income),
      expenses: fix(expenses),
      spending: fix(sp),
      financingCost: fix(fin),
      net: fix(income.minus(expenses)),
    };
  });
}

export type CategorySlice = { id: string; name: string; color: string; total: string; share: number };

export async function getCategoryBreakdown(
  userId: string,
  fromDate: Date,
  toDate: Date,
  kind: "INCOME" | "EXPENSE",
): Promise<CategorySlice[]> {
  const where = { userId, type: kind, date: { gte: fromDate, lte: toDate } } as const;
  const [groups, categories, costs] = await Promise.all([
    db.transaction.groupBy({ by: ["categoryId"], where, _sum: { amount: true } }),
    db.category.findMany({ where: { userId, kind }, select: { id: true, name: true, color: true } }),
    kind === "EXPENSE"
      ? db.loanPayment.aggregate({
          where: { userId, date: { gte: fromDate, lte: toDate }, loan: { direction: "BORROWED" } },
          _sum: { interestAmount: true, feeAmount: true },
        })
      : db.loanPayment.aggregate({
          where: { userId, date: { gte: fromDate, lte: toDate }, loan: { direction: "LENT" } },
          _sum: { interestAmount: true, feeAmount: true },
        }),
  ]);
  const byId = new Map(categories.map((c) => [c.id, c]));
  const slices = groups.map((g) => {
    const c = g.categoryId ? byId.get(g.categoryId) : undefined;
    return { id: g.categoryId ?? "uncategorized", name: c?.name ?? "Uncategorised", color: c?.color ?? "#94a3b8", total: d(g._sum.amount ?? 0) };
  });
  const extra =
    kind === "EXPENSE"
      ? d(costs._sum.interestAmount ?? 0).plus(d(costs._sum.feeAmount ?? 0))
      : d(costs._sum.interestAmount ?? 0);
  if (extra.greaterThan(0)) {
    slices.push({
      id: kind === "EXPENSE" ? "financing-cost" : "interest-earned",
      name: kind === "EXPENSE" ? "Loan interest & fees" : "Interest on money lent",
      color: kind === "EXPENSE" ? "#b91c1c" : "#14b8a6",
      total: extra,
    });
  }
  const grand = slices.reduce((s, x) => s.plus(x.total), ZERO);
  return slices
    .filter((s) => s.total.greaterThan(0))
    .sort((a, b) => b.total.comparedTo(a.total))
    .map((s) => ({
      ...s,
      total: fix(s.total),
      share: grand.isZero() ? 0 : s.total.dividedBy(grand).times(100).toDecimalPlaces(1).toNumber(),
    }));
}

export async function getNetWorth(userId: string) {
  const [accounts, loans] = await Promise.all([
    db.account.findMany({ where: { userId }, select: { currentBalance: true, includeInNetWorth: true, isArchived: true } }),
    db.loan.findMany({ where: { userId, status: { not: "CLOSED" } }, select: { direction: true, status: true, outstandingPrincipal: true } }),
  ]);
  const nw = computeNetWorth({
    accounts: accounts.map((a) => ({ ...a, currentBalance: a.currentBalance.toString() })),
    loans: loans.map((l) => ({ ...l, outstandingPrincipal: l.outstandingPrincipal.toString() })),
  });
  return {
    availableBalance: fix(nw.availableBalance),
    receivables: fix(nw.receivables),
    loanLiabilities: fix(nw.loanLiabilities),
    overdrafts: fix(nw.overdrafts),
    totalAssets: fix(nw.totalAssets),
    totalLiabilities: fix(nw.totalLiabilities),
    netWorth: fix(nw.netWorth),
  };
}

export type TrendPoint = { month: string; label: string; cash: string; netWorth: string };

/**
 * End-of-month cash balance and net worth, reconstructed backwards from today's balances using the ledger.
 */
export async function getBalanceTrend(userId: string, fromDate: Date, toDate: Date): Promise<TrendPoint[]> {
  const months = monthsBetween(fromDate, toDate);
  if (months.length === 0) return [];
  const from = toDateOnly(months[0]);

  const [accounts, flows, loans, principalFlows] = await Promise.all([
    db.account.findMany({ where: { userId, includeInNetWorth: true, isArchived: false }, select: { currentBalance: true } }),
    db.$queryRaw<MonthAgg[]>`
      SELECT to_char(t."date", 'YYYY-MM') AS month,
        SUM(
          CASE
            WHEN t."direction" = 'INFLOW' AND a."includeInNetWorth" AND NOT a."isArchived" THEN t."amount"
            WHEN t."direction" = 'OUTFLOW' AND a."includeInNetWorth" AND NOT a."isArchived" THEN -t."amount"
            WHEN t."direction" = 'TRANSFER' THEN
              (CASE WHEN ta."includeInNetWorth" AND NOT ta."isArchived" THEN t."amount" ELSE 0 END)
              - (CASE WHEN a."includeInNetWorth" AND NOT a."isArchived" THEN t."amount" ELSE 0 END)
            ELSE 0
          END
        )::text AS total
      FROM "Transaction" t
      JOIN "Account" a ON a."id" = t."accountId"
      LEFT JOIN "Account" ta ON ta."id" = t."toAccountId"
      WHERE t."userId" = ${userId} AND t."date" >= ${from}::date
      GROUP BY 1`,
    db.loan.findMany({ where: { userId }, select: { id: true, direction: true, principal: true, startDate: true } }),
    db.loanPayment.findMany({ where: { userId }, select: { loanId: true, date: true, principalAmount: true } }),
  ]);

  const currentCash = accounts.reduce((s, a) => s.plus(d(a.currentBalance)), ZERO);
  const flowByMonth = new Map(flows.map((f) => [f.month, d(f.total)]));
  const loanDir = new Map(loans.map((l) => [l.id, l.direction]));

  // Cash at end of month m = current cash − all flows dated after m.
  const sortedKeys = [...flowByMonth.keys()].sort();
  return months.map((m) => {
    const key = monthKey(m);
    const end = endOfMonth(m);
    const later = sortedKeys.filter((k) => k > key).reduce((s, k) => s.plus(flowByMonth.get(k)!), ZERO);
    const cash = currentCash.minus(later);

    let liabilities = ZERO;
    let receivables = ZERO;
    for (const l of loans) {
      if (l.startDate > end) continue;
      if (l.direction === "BORROWED") liabilities = liabilities.plus(d(l.principal));
      else receivables = receivables.plus(d(l.principal));
    }
    for (const p of principalFlows) {
      if (p.date > end) continue;
      if (loanDir.get(p.loanId) === "BORROWED") liabilities = liabilities.minus(d(p.principalAmount));
      else receivables = receivables.minus(d(p.principalAmount));
    }
    return {
      month: key,
      label: formatShortMonth(m) + (m.getUTCMonth() === 0 ? ` ${String(m.getUTCFullYear()).slice(2)}` : ""),
      cash: fix(cash),
      netWorth: fix(cash.plus(receivables).minus(liabilities)),
    };
  });
}

export async function getYearlySummary(userId: string) {
  const [rows, costs] = await Promise.all([
    db.$queryRaw<{ year: string; type: string; total: string }[]>`
      SELECT to_char("date", 'YYYY') AS year, "type"::text AS type, SUM("amount")::text AS total
      FROM "Transaction" WHERE "userId" = ${userId} AND "type" IN ('INCOME', 'EXPENSE')
      GROUP BY 1, 2 ORDER BY 1 DESC`,
    db.$queryRaw<{ year: string; direction: string; interest: string; fees: string }[]>`
      SELECT to_char(p."date", 'YYYY') AS year, l."direction"::text AS direction,
             SUM(p."interestAmount")::text AS interest, SUM(p."feeAmount")::text AS fees
      FROM "LoanPayment" p JOIN "Loan" l ON l."id" = p."loanId"
      WHERE p."userId" = ${userId} GROUP BY 1, 2`,
  ]);
  const years = [...new Set([...rows.map((r) => r.year), ...costs.map((c) => c.year)])].sort().reverse();
  return years.map((year) => {
    const income = rows.filter((r) => r.year === year && r.type === "INCOME").reduce((s, r) => s.plus(d(r.total)), ZERO);
    const spending = rows.filter((r) => r.year === year && r.type === "EXPENSE").reduce((s, r) => s.plus(d(r.total)), ZERO);
    let fin = ZERO;
    let earned = ZERO;
    for (const c of costs.filter((x) => x.year === year)) {
      if (c.direction === "BORROWED") fin = fin.plus(d(c.interest)).plus(d(c.fees));
      else earned = earned.plus(d(c.interest));
    }
    const totalIncome = income.plus(earned);
    const expenses = spending.plus(fin);
    const net = totalIncome.minus(expenses);
    return {
      year,
      income: fix(totalIncome),
      expenses: fix(expenses),
      financingCost: fix(fin),
      net: fix(net),
      savingsRate: totalIncome.greaterThan(0) ? net.dividedBy(totalIncome).times(100).toDecimalPlaces(1).toNumber() : null,
    };
  });
}

export async function getActiveYears(userId: string): Promise<number[]> {
  const first = await db.transaction.findFirst({ where: { userId }, orderBy: { date: "asc" }, select: { date: true } });
  const now = new Date().getUTCFullYear();
  const start = first ? first.date.getUTCFullYear() : now;
  const out: number[] = [];
  for (let y = now; y >= start; y--) out.push(y);
  return out;
}

export function yearRange(year: number) {
  return { from: parseDateOnly(`${year}-01-01`), to: parseDateOnly(`${year}-12-31`) };
}
