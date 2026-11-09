import type { Metadata } from "next";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { Money } from "@/components/shared/money";
import { Pager } from "@/components/shared/pager";
import { TransactionFilters } from "@/components/features/cashflow/filters";
import { TransactionList } from "@/components/features/cashflow/transaction-list";
import { TransferDialog } from "@/components/features/accounts/account-dialogs";
import { requireUser } from "@/server/auth";
import { accountOptions } from "@/server/services/accounts";
import { listCategories } from "@/server/services/categories";
import { listTransactions } from "@/server/services/transactions";
import { transactionFilterSchema } from "@/lib/validations/schemas";
import { todayString } from "@/lib/dates";
import { d } from "@/lib/money";

export const metadata: Metadata = { title: "Transactions" };

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const raw = await searchParams;
  const sp = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])) as Record<string, string | undefined>;
  const filters = transactionFilterSchema.parse(sp);
  const [accounts, categories, list] = await Promise.all([
    accountOptions(user.id),
    listCategories(user.id),
    listTransactions(user.id, filters),
  ]);
  const accountOpts = accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance }));
  const income = categories.filter((c) => c.kind === "INCOME").map((c) => ({ id: c.id, name: c.name }));
  const expense = categories.filter((c) => c.kind === "EXPENSE").map((c) => ({ id: c.id, name: c.name }));
  const filtered = Object.keys(sp).some((k) => k !== "page" && k !== "sort" && sp[k]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Transactions"
        description="Your complete financial history — income, spending, loans, EMIs, transfers and adjustments."
        actions={
          accounts.length >= 2 && (
            <TransferDialog
              accounts={accountOpts}
              today={todayString(user.timezone)}
              trigger={
                <Button variant="outline">
                  <Plus /> Transfer
                </Button>
              }
            />
          )
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Money in" value={<Money value={list.inflow} />} icon={ArrowDownLeft} tone="positive" hint={filtered ? "Filtered" : "All time"} />
        <StatCard label="Money out" value={<Money value={list.outflow} />} icon={ArrowUpRight} tone="negative" hint={filtered ? "Filtered" : "All time"} />
        <StatCard label="Net flow" value={<Money value={d(list.inflow).minus(list.outflow)} tone="auto" signed />} icon={Scale} />
        <StatCard label="Records" value={String(list.total)} icon={ArrowLeftRight} hint="Transfers are excluded from in/out" />
      </div>
      <TransactionFilters accounts={accountOpts} categories={[...income, ...expense]} showType />
      <Card className="card-elevated py-2">
        <CardContent className="px-3 md:px-4">
          {list.rows.length === 0 ? (
            <EmptyState
              className="my-4 border-0"
              icon={ArrowLeftRight}
              title={filtered ? "No matching transactions" : "No transactions yet"}
              description={filtered ? "Try different filters or clear them." : "Add income or expenses, or create an account with an opening balance."}
            />
          ) : (
            <TransactionList rows={list.rows} edit={{ accounts: accountOpts, incomeCategories: income, expenseCategories: expense, today: todayString(user.timezone) }} />
          )}
        </CardContent>
      </Card>
      <Pager page={list.page} pageCount={list.pageCount} total={list.total} basePath="/transactions" searchParams={sp} />
    </div>
  );
}
