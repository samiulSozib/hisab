import Link from "next/link";
import { AlertCircle, CalendarClock, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Money } from "@/components/shared/money";
import { LOAN_KIND_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import type { LoanSummaryDTO } from "@/server/services/loans";
import { cn } from "@/lib/utils";

export function LoanStatusBadge({ status, direction }: { status: string; direction?: string }) {
  if (status === "CLOSED") return <Badge variant="secondary">Closed</Badge>;
  if (status === "DEFAULTED") return <Badge className="border-transparent bg-negative/10 text-negative">Defaulted</Badge>;
  return (
    <Badge variant="outline" className={cn("border-transparent", direction === "LENT" ? "bg-positive/10 text-positive" : "bg-primary/10 text-primary")}>
      {direction === "LENT" ? "Receivable" : "Active"}
    </Badge>
  );
}

export function LoanCard({ loan }: { loan: LoanSummaryDTO }) {
  const lent = loan.direction === "LENT";
  return (
    <Link href={`/loans/${loan.id}`} prefetch className="group block focus-visible:outline-none">
      <Card className="card-elevated h-full gap-0 py-0 transition-all group-hover:shadow-md group-focus-visible:ring-2 group-focus-visible:ring-ring">
        <CardContent className="flex h-full flex-col gap-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium">{loan.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {LOAN_KIND_LABELS[loan.kind]} · {loan.counterparty}
              </p>
            </div>
            <LoanStatusBadge status={loan.status} direction={loan.direction} />
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{lent ? "Outstanding receivable" : "Outstanding principal"}</p>
              <Money value={loan.outstandingPrincipal} className="text-xl font-semibold tracking-tight" />
            </div>
            <p className="text-right text-xs text-muted-foreground">
              of <Money value={loan.principal} decimals={0} />
              {Number(loan.interestRate) > 0 && <span className="block">{loan.interestRate}% p.a.</span>}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Progress value={loan.progress} className="h-1.5" aria-label={`${loan.progress}% repaid`} />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{loan.progress}% {lent ? "collected" : "repaid"}</span>
              {loan.installmentCount ? (
                <span>
                  {loan.paidInstallments}/{loan.installmentCount} installments
                </span>
              ) : loan.dueDate ? (
                <span>Due {formatDate(loan.dueDate)}</span>
              ) : null}
            </div>
          </div>
          <div className="mt-auto flex items-center justify-between border-t pt-3 text-sm">
            {loan.nextDue && loan.status !== "CLOSED" ? (
              <span className={cn("flex items-center gap-1.5", loan.nextDue.overdue ? "text-negative" : "text-muted-foreground")}>
                {loan.nextDue.overdue ? <AlertCircle className="size-3.5" /> : <CalendarClock className="size-3.5" />}
                {loan.nextDue.overdue ? "Overdue" : "Next"} {formatDate(loan.nextDue.date)} ·{" "}
                <Money value={loan.nextDue.amount} className="font-medium text-foreground" />
              </span>
            ) : (
              <span className="text-muted-foreground">{loan.status === "CLOSED" ? "Fully settled" : `Since ${formatDate(loan.startDate)}`}</span>
            )}
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
