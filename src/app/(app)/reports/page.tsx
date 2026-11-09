import type { Metadata } from "next";
import Link from "next/link";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader, StatCard } from "@/components/shared/page";
import { Money } from "@/components/shared/money";
import { CashflowChart, CategoryBars } from "@/components/charts/finance-charts";
import { requireUser } from "@/server/auth";
import { getActiveYears, getCashflowSummary, getCategoryBreakdown, getMonthlySeries, getYearlySummary, yearRange } from "@/server/services/reports";
import { endOfMonth, formatMonth, parseDateOnly, toDateOnly, today } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Reports" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const years = await getActiveYears(user.id);
  const requested = Number(typeof sp.year === "string" ? sp.year : NaN);
  const year = years.includes(requested) ? requested : years[0];
  const { from, to } = yearRange(year);
  const t = today(user.timezone);
  const seriesTo = to > t ? t : to;

  const [summary, months, expenseCats, incomeCats, yearly] = await Promise.all([
    getCashflowSummary(user.id, from, to),
    getMonthlySeries(user.id, from, seriesTo),
    getCategoryBreakdown(user.id, from, to, "EXPENSE"),
    getCategoryBreakdown(user.id, from, to, "INCOME"),
    getYearlySummary(user.id),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="Monthly and yearly financial summaries."
        actions={
          <>
            <div className="flex flex-wrap gap-1 rounded-lg border p-1">
              {years.slice(0, 6).map((y) => (
                <Button key={y} size="sm" variant={y === year ? "secondary" : "ghost"} asChild>
                  <Link href={`/reports?year=${y}`}>{y}</Link>
                </Button>
              ))}
            </div>
            <Button variant="outline" asChild>
              <a href={`/api/export/transactions?from=${year}-01-01&to=${year}-12-31&sort=date_asc`} download>
                <Download /> Export {year}
              </a>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={`Income ${year}`} value={<Money value={summary.income} />} tone="positive" />
        <StatCard label={`Expenses ${year}`} value={<Money value={summary.expenses} />} tone="negative" hint={<>Loan interest & fees <Money value={summary.financingCost} /></>} />
        <StatCard label="Net savings" value={<Money value={summary.net} tone="auto" signed />} />
        <StatCard label="Savings rate" value={summary.savingsRate !== null ? `${summary.savingsRate}%` : "—"} hint={<>Installments paid <Money value={summary.installmentsPaid} /></>} />
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Monthly summary · {year}</CardTitle>
          <CardDescription>Spending excludes transfers and loan principal; financing cost is interest + fees on borrowed money.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <CashflowChart data={months} />
          <div className="overflow-x-auto">
            <Table className="min-w-[640px]">
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Income</TableHead>
                  <TableHead className="text-right">Spending</TableHead>
                  <TableHead className="text-right">Financing cost</TableHead>
                  <TableHead className="text-right">Total expenses</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Savings rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {months.map((m) => {
                  const inc = Number(m.income);
                  const rate = inc > 0 ? Math.round((Number(m.net) / inc) * 1000) / 10 : null;
                  return (
                    <TableRow key={m.month}>
                      <TableCell>
                        <Link className="hover:underline" href={`/transactions?from=${m.month}-01&to=${toDateOnly(endOfMonth(parseDateOnly(`${m.month}-01`)))}`}>
                          {formatMonth(`${m.month}-01`)}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right"><Money value={m.income} /></TableCell>
                      <TableCell className="text-right"><Money value={m.spending} /></TableCell>
                      <TableCell className="text-right"><Money value={m.financingCost} tone="muted" /></TableCell>
                      <TableCell className="text-right"><Money value={m.expenses} /></TableCell>
                      <TableCell className="text-right"><Money value={m.net} tone="auto" signed /></TableCell>
                      <TableCell className={cn("num text-right", rate !== null && rate < 0 && "text-negative")}>{rate !== null ? `${rate}%` : "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold">Total</TableCell>
                  <TableCell className="text-right font-semibold"><Money value={summary.income} /></TableCell>
                  <TableCell className="text-right font-semibold"><Money value={summary.spending} /></TableCell>
                  <TableCell className="text-right font-semibold"><Money value={summary.financingCost} /></TableCell>
                  <TableCell className="text-right font-semibold"><Money value={summary.expenses} /></TableCell>
                  <TableCell className="text-right font-semibold"><Money value={summary.net} tone="auto" signed /></TableCell>
                  <TableCell className="num text-right font-semibold">{summary.savingsRate !== null ? `${summary.savingsRate}%` : "—"}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Expenses by category</CardTitle>
            <CardDescription>{year}</CardDescription>
          </CardHeader>
          <CardContent>{expenseCats.length ? <CategoryBars data={expenseCats} limit={10} /> : <p className="text-sm text-muted-foreground">No expenses.</p>}</CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Income by source</CardTitle>
            <CardDescription>{year}</CardDescription>
          </CardHeader>
          <CardContent>{incomeCats.length ? <CategoryBars data={incomeCats} limit={10} /> : <p className="text-sm text-muted-foreground">No income.</p>}</CardContent>
        </Card>
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Yearly summary</CardTitle>
          <CardDescription>All years on record</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table className="min-w-[520px]">
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Income</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">of which financing</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Savings rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {yearly.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No data yet.
                  </TableCell>
                </TableRow>
              )}
              {yearly.map((y) => (
                <TableRow key={y.year}>
                  <TableCell>
                    <Link href={`/reports?year=${y.year}`} className="font-medium hover:underline">
                      {y.year}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right"><Money value={y.income} /></TableCell>
                  <TableCell className="text-right"><Money value={y.expenses} /></TableCell>
                  <TableCell className="text-right"><Money value={y.financingCost} tone="muted" /></TableCell>
                  <TableCell className="text-right"><Money value={y.net} tone="auto" signed /></TableCell>
                  <TableCell className="num text-right">{y.savingsRate !== null ? `${y.savingsRate}%` : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
