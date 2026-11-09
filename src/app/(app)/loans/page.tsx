import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, HandCoins, Landmark, Plus, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { Money } from "@/components/shared/money";
import { LoanCard } from "@/components/features/loans/loan-card";
import { UpcomingList } from "@/components/features/loans/upcoming-list";
import { requireUser } from "@/server/auth";
import { listLoans, loanTotals, upcomingInstallments } from "@/server/services/loans";
import { d } from "@/lib/money";

export const metadata: Metadata = { title: "Loans" };

export default async function LoansOverviewPage() {
  const user = await requireUser();
  const [totals, loans, upcoming] = await Promise.all([
    loanTotals(user.id),
    listLoans(user.id, { status: "ACTIVE" }),
    upcomingInstallments(user.id, 45, 10),
  ]);
  const totalDebt = d(totals.personalBorrowed.outstanding).plus(totals.emi.outstanding).plus(totals.bank.outstanding);

  const kinds = [
    { href: "/loans/personal", label: "Personal (you owe)", value: totals.personalBorrowed.outstanding, count: totals.personalBorrowed.count, icon: Users },
    { href: "/loans/emi", label: "EMI", value: totals.emi.outstanding, count: totals.emi.count, icon: Smartphone },
    { href: "/loans/bank", label: "Bank loans", value: totals.bank.outstanding, count: totals.bank.count, icon: Landmark },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Loans"
        description="Everything you owe and everything owed to you."
        actions={
          <Button asChild>
            <Link href="/loans/new">
              <Plus /> New loan
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total outstanding debt" value={<Money value={totalDebt} />} icon={HandCoins} tone="negative" />
        <StatCard
          label="Owed to you"
          value={<Money value={totals.personalLent.outstanding} />}
          icon={ArrowUpRight}
          tone="positive"
          hint={`${totals.personalLent.count} active receivable${totals.personalLent.count === 1 ? "" : "s"}`}
        />
        {kinds.slice(1).map((k) => (
          <StatCard key={k.href} label={k.label} value={<Money value={k.value} />} icon={k.icon} hint={`${k.count} active`} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Active loans</h2>
            <div className="flex gap-1">
              {kinds.map((k) => (
                <Button key={k.href} variant="ghost" size="sm" asChild>
                  <Link href={k.href}>{k.label.replace(" (you owe)", "")}</Link>
                </Button>
              ))}
            </div>
          </div>
          {loans.length === 0 ? (
            <EmptyState
              icon={HandCoins}
              title="No active loans"
              description="Add a personal loan, an EMI purchase or a bank loan to track repayments."
              action={
                <Button asChild>
                  <Link href="/loans/new">Add a loan</Link>
                </Button>
              }
            />
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {loans.map((l) => (
                <LoanCard key={l.id} loan={l} />
              ))}
            </div>
          )}
        </div>
        <Card className="card-elevated h-fit">
          <CardHeader>
            <CardTitle>Upcoming payments</CardTitle>
            <CardDescription>Overdue and due within 45 days</CardDescription>
          </CardHeader>
          <CardContent>
            <UpcomingList items={upcoming} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
