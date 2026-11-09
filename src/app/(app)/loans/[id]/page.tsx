import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, CalendarClock, CircleDollarSign, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Money } from "@/components/shared/money";
import { StatCard } from "@/components/shared/page";
import { LoanStatusBadge } from "@/components/features/loans/loan-card";
import { DeletePaymentButton, InstallmentEditButton, LoanMenu, PaymentDialog, RescheduleDialog } from "@/components/features/loans/loan-actions";
import { AttachmentsPanel } from "@/components/features/cashflow/attachments";
import { TypeBadge } from "@/components/features/cashflow/transaction-list";
import { requireUser } from "@/server/auth";
import { getLoanDetail } from "@/server/services/loans";
import { accountOptions } from "@/server/services/accounts";
import { listLoanAttachments } from "@/server/services/attachments";
import { formatDate, todayString } from "@/lib/dates";
import { INSTALLMENT_STATUS_LABELS, INTEREST_METHOD_LABELS, LOAN_KIND_LABELS, PAYMENT_FREQUENCY_LABELS } from "@/lib/constants";
import { d, formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Loan details" };

const STATUS_STYLE: Record<string, string> = {
  PAID: "bg-positive/10 text-positive",
  PARTIAL: "bg-warning/15 text-warning",
  MISSED: "bg-negative/10 text-negative",
  WAIVED: "bg-muted text-muted-foreground",
  PENDING: "bg-secondary text-secondary-foreground",
};

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium">{value}</dd>
    </div>
  );
}

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const [loan, accounts, files] = await Promise.all([getLoanDetail(user.id, id), accountOptions(user.id), listLoanAttachments(user.id, id)]);
  if (!loan) notFound();

  const lent = loan.direction === "LENT";
  const hasSchedule = loan.installments.length > 0;
  const progress = d(loan.principal).isZero() ? 0 : d(loan.principalRepaid).dividedBy(loan.principal).times(100).toDecimalPlaces(1).toNumber();
  const today = todayString(user.timezone);
  const unpaid = loan.installments.filter((i) => ["PENDING", "PARTIAL", "MISSED"].includes(i.status));
  const payInstallments = unpaid.map((i) => ({
    id: i.id,
    number: i.number,
    dueDate: i.dueDate,
    remaining: d(i.scheduledAmount).minus(i.paidAmount).toFixed(2),
    interestDue: d(i.scheduledInterest).minus(i.interestPaid).toFixed(2),
  }));
  const accountOpts = accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance }));
  const backHref = loan.kind === "PERSONAL" ? "/loans/personal" : loan.kind === "EMI" ? "/loans/emi" : "/loans/bank";

  const payButton = (label: string, installmentId?: string, size: "default" | "sm" = "default") => (
    <PaymentDialog
      loan={{ id: loan.id, title: loan.title, direction: loan.direction, outstandingPrincipal: loan.outstandingPrincipal, accountId: loan.account.id, hasSchedule }}
      accounts={accountOpts}
      today={today}
      installments={payInstallments}
      defaultInstallmentId={installmentId}
      suggestedInterest={loan.metrics.accruedInterest}
      trigger={
        <Button size={size} variant={size === "sm" ? "outline" : "default"}>
          {size === "default" && <CircleDollarSign />}
          {label}
        </Button>
      }
    />
  );

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href={backHref}>
          <ArrowLeft /> {LOAN_KIND_LABELS[loan.kind]}
        </Link>
      </Button>

      {/* Header */}
      <Card className="card-elevated overflow-hidden py-0">
        <CardContent className="flex flex-col gap-6 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <LoanStatusBadge status={loan.status} direction={loan.direction} />
                <Badge variant="outline">{LOAN_KIND_LABELS[loan.kind]}</Badge>
                {lent && <Badge variant="outline">Lent</Badge>}
              </div>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">{loan.title}</h1>
              <p className="text-sm text-muted-foreground">
                {loan.counterparty}
                {loan.referenceNumber ? ` · Ref ${loan.referenceNumber}` : ""} · since {formatDate(loan.startDate)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {loan.status !== "CLOSED" && payButton(lent ? "Record collection" : "Record payment")}
              <LoanMenu loan={loan} />
            </div>
          </div>
          <div className="grid gap-6 md:grid-cols-[1.2fr_1fr]">
            <div>
              <p className="text-sm text-muted-foreground">{lent ? "Outstanding receivable" : "Outstanding principal"}</p>
              <Money value={loan.outstandingPrincipal} className="text-4xl font-semibold tracking-tight" />
              <div className="mt-4 flex flex-col gap-1.5">
                <Progress value={progress} className="h-2" aria-label={`${progress}% repaid`} />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    <Money value={loan.principalRepaid} /> {lent ? "collected" : "repaid"} ({progress}%)
                  </span>
                  <span>
                    of <Money value={loan.principal} />
                  </span>
                </div>
              </div>
            </div>
            <dl className="grid grid-cols-2 gap-4 rounded-xl bg-muted/40 p-4">
              <Detail label="Interest rate" value={`${loan.interestRate}% p.a.`} />
              <Detail label="Method" value={INTEREST_METHOD_LABELS[loan.interestMethod]} />
              {loan.installmentAmount && <Detail label="Installment" value={<Money value={loan.installmentAmount} />} />}
              {loan.frequency && <Detail label="Frequency" value={PAYMENT_FREQUENCY_LABELS[loan.frequency]} />}
              {loan.purchasePrice && <Detail label="Purchase price" value={<Money value={loan.purchasePrice} />} />}
              {loan.downPayment && <Detail label="Down payment" value={<Money value={loan.downPayment} />} />}
              {loan.processingFee && <Detail label="Processing fee" value={<Money value={loan.processingFee} />} />}
              {loan.termMonths && <Detail label="Term" value={`${loan.termMonths} months`} />}
              {loan.dueDate && <Detail label="Due date" value={formatDate(loan.dueDate)} />}
              {loan.finalPaymentDate && <Detail label="Final installment" value={formatDate(loan.finalPaymentDate)} />}
              <Detail label="Linked account" value={loan.account.name} />
            </dl>
          </div>
        </CardContent>
      </Card>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {hasSchedule ? (
          <>
            <StatCard label="Installments paid" value={`${loan.metrics.paidInstallments} / ${loan.metrics.totalInstallments}`} hint={`${loan.metrics.remainingInstallments} remaining`} />
            <StatCard
              label="Next payment"
              icon={CalendarClock}
              tone={loan.metrics.overdueInstallments ? "negative" : "primary"}
              value={loan.metrics.nextPayment ? <Money value={loan.metrics.nextPayment.amount} /> : "—"}
              hint={
                loan.metrics.nextPayment
                  ? `#${loan.metrics.nextPayment.number} due ${formatDate(loan.metrics.nextPayment.date)}${loan.metrics.overdueInstallments ? ` · ${loan.metrics.overdueInstallments} overdue` : ""}`
                  : "All settled"
              }
            />
            <StatCard label="Total interest (schedule)" value={<Money value={loan.metrics.totalScheduledInterest} />} hint={<>Paid so far <Money value={loan.interestPaid} /></>} />
            <StatCard label="Remaining scheduled" value={<Money value={loan.metrics.remainingScheduled} />} hint={<>Fees paid <Money value={loan.feesPaid} /></>} />
          </>
        ) : (
          <>
            <StatCard label={lent ? "Collected" : "Principal repaid"} value={<Money value={loan.principalRepaid} />} />
            <StatCard label={lent ? "Interest earned" : "Interest paid"} value={<Money value={loan.interestPaid} />} />
            <StatCard label="Accrued interest (unpaid)" value={<Money value={loan.metrics.accruedInterest} />} hint={Number(loan.interestRate) > 0 ? "Simple interest since last payment" : "Interest-free"} />
            <StatCard label="Payments" value={String(loan.payments.length)} hint={loan.repaymentTerms ?? undefined} />
          </>
        )}
      </div>

      {loan.metrics.scheduleOutOfSync && loan.status !== "CLOSED" && (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Schedule differs from what you owe</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center gap-3">
            Prepayments or partial payments mean the remaining installments no longer match the outstanding principal.
            <RescheduleDialog
              loanId={loan.id}
              outOfSync
              trigger={
                <Button size="sm" variant="outline">
                  <RefreshCw /> Regenerate schedule
                </Button>
              }
            />
          </AlertDescription>
        </Alert>
      )}

      {/* Schedule */}
      {hasSchedule && (
        <Card className="card-elevated">
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Installment schedule</CardTitle>
              <CardDescription>Principal and interest breakdown for each installment.</CardDescription>
            </div>
            {loan.status !== "CLOSED" && !loan.metrics.scheduleOutOfSync && (
              <RescheduleDialog
                loanId={loan.id}
                outOfSync={false}
                trigger={
                  <Button size="sm" variant="outline">
                    <RefreshCw /> Reschedule
                  </Button>
                }
              />
            )}
          </CardHeader>
          <CardContent className="px-0 sm:px-6">
            <div className="overflow-x-auto">
              <Table className="min-w-[760px]">
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-4 sm:pl-2">#</TableHead>
                    <TableHead>Due date</TableHead>
                    <TableHead className="text-right">Scheduled</TableHead>
                    <TableHead className="text-right">Principal</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Paid on</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loan.installments.map((i) => (
                    <TableRow key={i.id} className={cn(i.overdue && "bg-negative/[0.03]")}>
                      <TableCell className="num pl-4 text-muted-foreground sm:pl-2">{i.number}</TableCell>
                      <TableCell className={cn("num", i.overdue && "font-medium text-negative")}>{formatDate(i.dueDate)}</TableCell>
                      <TableCell className="num text-right">{formatMoney(i.scheduledAmount, { symbol: false })}</TableCell>
                      <TableCell className="num text-right text-muted-foreground">{formatMoney(i.scheduledPrincipal, { symbol: false })}</TableCell>
                      <TableCell className="num text-right text-muted-foreground">{formatMoney(i.scheduledInterest, { symbol: false })}</TableCell>
                      <TableCell className="num text-right">{d(i.paidAmount).isZero() ? "—" : formatMoney(i.paidAmount, { symbol: false })}</TableCell>
                      <TableCell className="num text-muted-foreground">{i.lastPaymentDate ? formatDate(i.lastPaymentDate) : "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={cn("border-transparent", STATUS_STYLE[i.status])} title={i.notes ?? undefined}>
                          {i.overdue && i.status !== "MISSED" ? "Overdue" : INSTALLMENT_STATUS_LABELS[i.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="num text-right text-muted-foreground">{formatMoney(i.closingBalance, { symbol: false })}</TableCell>
                      <TableCell className="pr-4 text-right sm:pr-2">
                        {i.status !== "PAID" && i.status !== "WAIVED" && loan.status !== "CLOSED" && (
                          <div className="flex justify-end gap-1">
                            {payButton("Pay", i.id, "sm")}
                            <InstallmentEditButton inst={i} />
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Payments */}
        <Card className="card-elevated lg:col-span-2">
          <CardHeader>
            <CardTitle>{lent ? "Collection history" : "Repayment history"}</CardTitle>
            <CardDescription>Every payment with its principal, interest and fee split.</CardDescription>
          </CardHeader>
          <CardContent>
            {loan.payments.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y">
                {loan.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                    <div className="min-w-0 flex-1">
                      <Link href={`/transactions/${p.transactionId}`} className="font-medium hover:underline">
                        <Money value={p.amount} />
                      </Link>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(p.date)} · {p.accountName}
                        {p.installmentNumber ? ` · installment #${p.installmentNumber}` : ""}
                        {p.notes ? ` · ${p.notes}` : ""}
                      </p>
                    </div>
                    <div className="num flex gap-4 text-xs text-muted-foreground">
                      <span>
                        Principal <span className="text-foreground">{formatMoney(p.principal, { symbol: false })}</span>
                      </span>
                      <span>
                        Interest <span className="text-foreground">{formatMoney(p.interest, { symbol: false })}</span>
                      </span>
                      {d(p.fee).greaterThan(0) && (
                        <span>
                          Fee <span className="text-foreground">{formatMoney(p.fee, { symbol: false })}</span>
                        </span>
                      )}
                    </div>
                    <DeletePaymentButton paymentId={p.id} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          {loan.relatedTransactions.length > 0 && (
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Opening entries</CardTitle>
                <CardDescription>Ledger entries created with this loan.</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-3">
                  {loan.relatedTransactions.map((t) => (
                    <li key={t.id}>
                      <Link href={`/transactions/${t.id}`} className="flex items-center justify-between gap-3 text-sm hover:underline">
                        <span className="flex min-w-0 flex-col">
                          <TypeBadge type={t.type} />
                          <span className="mt-1 truncate text-xs text-muted-foreground">
                            {formatDate(t.date)} · {t.description}
                          </span>
                        </span>
                        <Money value={t.amount} className="font-medium" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          <Card className="card-elevated">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
              <CardDescription>Agreements, sanction letters, invoices.</CardDescription>
            </CardHeader>
            <CardContent>
              <AttachmentsPanel items={files} target={{ loanId: loan.id }} />
            </CardContent>
          </Card>
          {loan.description && (
            <Card className="card-elevated">
              <CardHeader>
                <CardTitle>Notes</CardTitle>
              </CardHeader>
              <CardContent className="whitespace-pre-wrap text-sm text-muted-foreground">{loan.description}</CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
