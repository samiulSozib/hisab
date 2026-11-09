import { Plus, ReceiptText, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { Money } from "@/components/shared/money";
import { Pager } from "@/components/shared/pager";
import { CashflowChart, CategoryBars } from "@/components/charts/finance-charts";
import { requireUser } from "@/server/auth";
import { accountOptions } from "@/server/services/accounts";
import { categoryOptions } from "@/server/services/categories";
import { listTransactions } from "@/server/services/transactions";
import { listRecurring } from "@/server/services/recurring";
import { getCashflowSummary, getCategoryBreakdown, getMonthlySeries } from "@/server/services/reports";
import { addMonths, formatMonth, resolvePeriod, startOfMonth, today as todayDate, todayString } from "@/lib/dates";
import { transactionFilterSchema } from "@/lib/validations/schemas";
import { CashflowDialog } from "./cashflow-dialog";
import { TransactionList } from "./transaction-list";
import { TransactionFilters } from "./filters";
import { RecurringList } from "./recurring";

type SP = Record<string, string | string[] | undefined>;

export async function CashflowPage({ type, searchParams }: { type: "INCOME" | "EXPENSE"; searchParams: Promise<SP> }) {
  const user = await requireUser();
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const filters = transactionFilterSchema.parse(sp);
  const isIncome = type === "INCOME";
  const t = todayDate(user.timezone);
  const today = todayString(user.timezone);
  const month = resolvePeriod({ period: "month" }, t);
  const prevMonth = resolvePeriod({ period: "month" }, addMonths(t, -1, 1));
  const seriesFrom = startOfMonth(addMonths(t, -5, 1));

  const [accounts, categories, list, rules, thisMonth, lastMonth, breakdown, series] = await Promise.all([
    accountOptions(user.id),
    categoryOptions(user.id, type),
    listTransactions(user.id, filters, [type]),
    listRecurring(user.id, type),
    getCashflowSummary(user.id, month.from, month.to),
    getCashflowSummary(user.id, prevMonth.from, prevMonth.to),
    getCategoryBreakdown(user.id, month.from, month.to, type),
    getMonthlySeries(user.id, seriesFrom, month.to),
  ]);
  const accountOpts = accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance }));
  const catOpts = categories.map((c) => ({ id: c.id, name: c.name }));
  const filtered = Object.keys(sp).some((k) => k !== "page" && k !== "sort" && sp[k]);
  const monthTotal = isIncome ? thisMonth.income : thisMonth.spending;
  const lastTotal = isIncome ? lastMonth.income : lastMonth.spending;

  const addButton =
    accounts.length === 0 ? (
      <Button asChild>
        <a href="/accounts">Add an account first</a>
      </Button>
    ) : (
      <CashflowDialog
        type={type}
        accounts={accountOpts}
        categories={catOpts}
        today={today}
        trigger={
          <Button>
            <Plus /> Add {isIncome ? "income" : "expense"}
          </Button>
        }
      />
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={isIncome ? "Income" : "Expenses"}
        description={isIncome ? "Salary, bonuses, freelancing and other money received." : "Everyday spending, bills and purchases."}
        actions={addButton}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label={`${isIncome ? "Income" : "Spending"} · ${formatMonth(month.from)}`}
          value={<Money value={monthTotal} />}
          icon={isIncome ? TrendingUp : TrendingDown}
          tone={isIncome ? "positive" : "negative"}
        />
        <StatCard label={`Last month`} value={<Money value={lastTotal} />} icon={Wallet} />
        <StatCard
          label={filtered ? "Filtered total" : "All-time total"}
          value={<Money value={isIncome ? list.inflow : list.outflow} />}
          hint={`${list.total} entr${list.total === 1 ? "y" : "ies"}`}
        />
        <StatCard
          label={isIncome ? "Recurring rules" : "Loan interest & fees"}
          value={isIncome ? String(rules.filter((r) => r.isActive).length) : <Money value={thisMonth.financingCost} />}
          hint={isIncome ? "Active automations" : "This month, from loan payments"}
        />
      </div>

      <Tabs defaultValue={sp.tab === "recurring" ? "recurring" : sp.tab === "report" ? "report" : "history"}>
        <TabsList>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="recurring">Recurring</TabsTrigger>
          <TabsTrigger value="report">Monthly report</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-4 flex flex-col gap-4">
          <TransactionFilters accounts={accountOpts} categories={catOpts} forcedType={type} />
          <Card className="card-elevated py-2">
            <CardContent className="px-3 md:px-4">
              {list.rows.length === 0 ? (
                <EmptyState
                  className="my-4 border-0"
                  icon={ReceiptText}
                  title={filtered ? "No matching entries" : `No ${isIncome ? "income" : "expenses"} yet`}
                  description={filtered ? "Try widening the filters." : undefined}
                />
              ) : (
                <TransactionList rows={list.rows} showType={false} edit={{ accounts: accountOpts, incomeCategories: isIncome ? catOpts : [], expenseCategories: isIncome ? [] : catOpts, today }} />
              )}
            </CardContent>
          </Card>
          <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath={isIncome ? "/income" : "/expenses"} searchParams={sp} />
        </TabsContent>

        <TabsContent value="recurring" className="mt-4">
          <RecurringList type={type} rules={rules} accounts={accountOpts} categories={catOpts} today={today} />
        </TabsContent>

        <TabsContent value="report" className="mt-4 grid gap-4 lg:grid-cols-5">
          <Card className="card-elevated lg:col-span-3">
            <CardHeader>
              <CardTitle>Last 6 months</CardTitle>
              <CardDescription>Income vs. expenses (expenses include loan interest & fees)</CardDescription>
            </CardHeader>
            <CardContent>
              <CashflowChart data={series} />
            </CardContent>
          </Card>
          <Card className="card-elevated lg:col-span-2">
            <CardHeader>
              <CardTitle>By {isIncome ? "source" : "category"}</CardTitle>
              <CardDescription>{formatMonth(month.from)}</CardDescription>
            </CardHeader>
            <CardContent>
              {breakdown.length ? (
                <CategoryBars data={breakdown} limit={8} />
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">Nothing recorded this month.</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
