import Link from "next/link";
import { HandCoins, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { Money } from "@/components/shared/money";
import { requireUser } from "@/server/auth";
import { listLoans } from "@/server/services/loans";
import { d, ZERO } from "@/lib/money";
import { LoanCard } from "./loan-card";

const COPY = {
  PERSONAL: {
    title: "Personal loans",
    description: "Money borrowed from or lent to friends, family and colleagues.",
    newHref: "/loans/new?kind=personal",
    empty: "Record money you've borrowed from or lent to someone, with flexible partial repayments.",
  },
  EMI: {
    title: "EMI",
    description: "Installment purchases — phones, laptops, furniture and more.",
    newHref: "/loans/new?kind=emi",
    empty: "Add an EMI purchase to generate its installment schedule automatically.",
  },
  BANK: {
    title: "Bank loans",
    description: "Loans from banks and financial institutions with amortized schedules.",
    newHref: "/loans/new?kind=bank",
    empty: "Add a bank loan to track its amortization, principal and interest.",
  },
} as const;

export async function LoanListPage({ kind, showClosed }: { kind: "PERSONAL" | "EMI" | "BANK"; showClosed: boolean }) {
  const user = await requireUser();
  const loans = await listLoans(user.id, { kind, status: showClosed ? "ALL" : "ACTIVE" });
  const copy = COPY[kind];
  const active = loans.filter((l) => l.status !== "CLOSED");
  const borrowed = active.filter((l) => l.direction === "BORROWED").reduce((s, l) => s.plus(d(l.outstandingPrincipal)), ZERO);
  const lent = active.filter((l) => l.direction === "LENT").reduce((s, l) => s.plus(d(l.outstandingPrincipal)), ZERO);
  const interest = loans.reduce((s, l) => s.plus(d(l.interestPaid)), ZERO);
  const monthly = active.reduce((s, l) => s.plus(d(l.installmentAmount ?? 0)), ZERO);
  const basePath = kind === "PERSONAL" ? "/loans/personal" : kind === "EMI" ? "/loans/emi" : "/loans/bank";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={copy.title}
        description={copy.description}
        actions={
          <Button asChild>
            <Link href={copy.newHref}>
              <Plus /> New {kind === "PERSONAL" ? "loan" : kind === "EMI" ? "EMI" : "bank loan"}
            </Link>
          </Button>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={kind === "PERSONAL" ? "You owe" : "Outstanding"} value={<Money value={borrowed} />} tone="negative" />
        {kind === "PERSONAL" ? (
          <StatCard label="Owed to you" value={<Money value={lent} />} tone="positive" />
        ) : (
          <StatCard label="Scheduled per period" value={<Money value={monthly} />} hint="Sum of active installments" />
        )}
        <StatCard label="Interest paid to date" value={<Money value={interest} />} />
        <StatCard label="Active" value={String(active.length)} hint={`${loans.length - active.length} closed shown`} />
      </div>
      {loans.length === 0 ? (
        <EmptyState
          icon={HandCoins}
          title={`No ${copy.title.toLowerCase()} yet`}
          description={copy.empty}
          action={
            <Button asChild>
              <Link href={copy.newHref}>Get started</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {loans.map((l) => (
            <LoanCard key={l.id} loan={l} />
          ))}
        </div>
      )}
      <Button variant="link" asChild className="self-start px-0">
        <Link href={showClosed ? basePath : `${basePath}?closed=1`}>{showClosed ? "Hide closed loans" : "Show closed loans"}</Link>
      </Button>
    </div>
  );
}
