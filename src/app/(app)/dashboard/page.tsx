import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarClock, HandCoins, Landmark, Plus, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/shared/money";
import { StatCard } from "@/components/shared/page";
import { PeriodFilter } from "@/components/shared/period-filter";
import { BalanceTrendChart, CashflowChart, CategoryBars } from "@/components/charts/finance-charts";
import { UpcomingList } from "@/components/features/loans/upcoming-list";
import { TransactionList } from "@/components/features/cashflow/transaction-list";
import { CashflowDialog } from "@/components/features/cashflow/cashflow-dialog";
import { requireUser } from "@/server/auth";
import { accountOptions } from "@/server/services/accounts";
import { categoryOptions } from "@/server/services/categories";
import { upcomingInstallments } from "@/server/services/loans";
import { processDueRecurring } from "@/server/services/recurring";
import { getBalanceTrend, getCashflowSummary, getCategoryBreakdown, getMonthlySeries, getNetWorth } from "@/server/services/reports";
import { recentTransactions } from "@/server/services/transactions";
import { addMonths, formatMonth, monthsBetween, resolvePeriod, startOfMonth, today as todayDate, todayString } from "@/lib/dates";
import { d } from "@/lib/money";

export const metadata: Metadata = { title: "Dashboard" };

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  // Post any recurring salary / bills that have fallen due (idempotent).
  await processDueRecurring(user.id);

  const t = todayDate(user.timezone);
  const today = todayString(user.timezone);
  const period = resolvePeriod({ period: str("period"), from: str("from"), to: str("to") }, t);
  const thisMonth = resolvePeriod({ period: "month" }, t);
  // Charts: at least 6 months of context, or the selected range if longer.
  const chartFrom = monthsBetween(period.from, period.to).length >= 6 ? period.from : startOfMonth(addMonths(period.to, -5, 1));
  const chartTo = period.to < t ? period.to : thisMonth.to;

  const [nw, summary, monthSummary, series, categories, trend, upcoming, recent, accounts, incomeCats, expenseCats] = await Promise.all([
    getNetWorth(user.id),
    getCashflowSummary(user.id, period.from, period.to),
    getCashflowSummary(user.id, thisMonth.from, thisMonth.to),
    getMonthlySeries(user.id, chartFrom, chartTo),
    getCategoryBreakdown(user.id, period.from, period.to, "EXPENSE"),
    getBalanceTrend(user.id, chartFrom, chartTo),
    upcomingInstallments(user.id, 45, 6),
    recentTransactions(user.id, 8),
    accountOptions(user.id),
    categoryOptions(user.id, "INCOME"),
    categoryOptions(user.id, "EXPENSE"),
  ]);
  const accountOpts = accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance }));
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: user.timezone }).format(new Date()));
  const overdue = upcoming.filter((u) => u.overdue).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{greeting(hour)},</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.7rem]">{user.name.split(" ")[0]}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PeriodFilter label={period.label} />
          {accounts.length > 0 && (
            <>
              <CashflowDialog
                type="INCOME"
                accounts={accountOpts}
                categories={incomeCats}
                today={today}
                trigger={
                  <Button size="sm" variant="outline">
                    <Plus /> Income
                  </Button>
                }
              />
              <CashflowDialog
                type="EXPENSE"
                accounts={accountOpts}
                categories={expenseCats}
                today={today}
                trigger={
                  <Button size="sm">
                    <Plus /> Expense
                  </Button>
                }
              />
            </>
          )}
        </div>
      </div>

      {/* Net worth hero */}
      <section className="surface-hero relative overflow-hidden rounded-2xl p-5 text-white shadow-lg shadow-teal-950/10 sm:p-7">
        <div className="pointer-events-none absolute -right-16 -top-20 size-64 rounded-full border border-white/10" aria-hidden />
        <div className="pointer-events-none absolute -right-4 -top-8 size-40 rounded-full border border-white/10" aria-hidden />
        <div className="relative grid gap-6 md:grid-cols-[1.3fr_2fr] md:items-end">
          <div>
            <p className="text-sm text-white/70">Net worth</p>
            <Money value={nw.netWorth} className="mt-1 block text-4xl font-semibold tracking-tight sm:text-5xl" />
            <p className="mt-2 text-sm text-white/70">Assets minus everything you owe</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            {[
              { label: "Total assets", value: nw.totalAssets },
              { label: "Available balance", value: nw.availableBalance },
              { label: "Outstanding loans", value: nw.totalLiabilities },
            ].map((x) => (
              <div key={x.label} className="rounded-xl bg-white/10 p-3 backdrop-blur-sm">
                <dt className="text-xs text-white/70">{x.label}</dt>
                <dd>
                  <Money value={x.value} className="text-lg font-semibold" />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* Period cards */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Income · ${period.label}`} value={<Money value={summary.income} />} icon={TrendingUp} tone="positive" />
        <StatCard
          label={`Expenses · ${period.label}`}
          value={<Money value={summary.expenses} />}
          icon={TrendingDown}
          tone="negative"
          hint={d(summary.financingCost).greaterThan(0) ? <>incl. <Money value={summary.financingCost} /> loan interest & fees</> : undefined}
        />
        <StatCard
          label={`EMI & loan installments · ${formatMonth(thisMonth.from)}`}
          value={<Money value={monthSummary.installmentsPaid} />}
          icon={Landmark}
          tone="primary"
          hint={overdue ? `${overdue} overdue installment${overdue === 1 ? "" : "s"}` : "Paid this month"}
        />
        <StatCard
          label="Net savings"
          value={<Money value={summary.net} tone="auto" signed />}
          icon={Wallet}
          hint={summary.savingsRate !== null ? `${summary.savingsRate}% savings rate` : "No income in period"}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="card-elevated lg:col-span-2">
          <CardHeader>
            <CardTitle>Income vs. expenses</CardTitle>
            <CardDescription>Monthly · expenses include loan interest & fees, never loan principal or transfers</CardDescription>
          </CardHeader>
          <CardContent>
            <CashflowChart data={series} />
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Where money went</CardTitle>
            <CardDescription>{period.label}</CardDescription>
          </CardHeader>
          <CardContent>
            {categories.length ? (
              <CategoryBars data={categories} />
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">No expenses in this period.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="card-elevated lg:col-span-2">
          <CardHeader>
            <CardTitle>Balance trend</CardTitle>
            <CardDescription>End-of-month cash & bank balance and net worth</CardDescription>
          </CardHeader>
          <CardContent>
            <BalanceTrendChart data={trend} />
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader className="flex flex-row items-start justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarClock className="size-4 text-muted-foreground" /> Upcoming EMIs
              </CardTitle>
              <CardDescription>Next 45 days</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/loans">
                All <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            <UpcomingList items={upcoming} />
          </CardContent>
        </Card>
      </div>

      <Card className="card-elevated">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <div>
            <CardTitle>Recent transactions</CardTitle>
            <CardDescription>Latest activity across all accounts</CardDescription>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/transactions">
              View all <ArrowRight />
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="px-3 md:px-6">
          {recent.length ? (
            <TransactionList rows={recent} />
          ) : (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <HandCoins className="size-7 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">No transactions yet. Start by adding your accounts and this month&apos;s salary.</p>
              <Button asChild size="sm">
                <Link href="/accounts">Set up accounts</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
