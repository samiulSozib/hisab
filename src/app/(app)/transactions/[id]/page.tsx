import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, HandCoins, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FlowAmount, Money } from "@/components/shared/money";
import { DeleteTransactionButton, TypeBadge } from "@/components/features/cashflow/transaction-list";
import { CashflowDialog } from "@/components/features/cashflow/cashflow-dialog";
import { AttachmentsPanel } from "@/components/features/cashflow/attachments";
import { requireUser } from "@/server/auth";
import { getTransactionDetail } from "@/server/services/transactions";
import { accountOptions } from "@/server/services/accounts";
import { categoryOptions } from "@/server/services/categories";
import { db } from "@/lib/db";
import { formatDate, formatDateTime, todayString } from "@/lib/dates";
import { RECURRING_FREQUENCY_LABELS } from "@/lib/constants";

export const metadata: Metadata = { title: "Transaction" };

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium sm:text-right">{children}</dd>
    </div>
  );
}

export default async function TransactionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const t = await getTransactionDetail(user.id, id);
  if (!t) notFound();
  const isCashflow = t.type === "INCOME" || t.type === "EXPENSE";
  const [accounts, categories, history] = await Promise.all([
    isCashflow ? accountOptions(user.id) : Promise.resolve([]),
    isCashflow ? categoryOptions(user.id, t.type as "INCOME" | "EXPENSE") : Promise.resolve([]),
    db.auditLog.findMany({ where: { userId: user.id, entityId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/transactions">
          <ArrowLeft /> All transactions
        </Link>
      </Button>

      <Card className="card-elevated">
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex flex-col gap-2">
              <TypeBadge type={t.type} />
              <h1 className="text-xl font-semibold tracking-tight">{t.description || t.counterparty || t.category?.name || "Transaction"}</h1>
              <p className="text-sm text-muted-foreground">{formatDate(t.date)}</p>
            </div>
            <FlowAmount amount={t.amount} direction={t.direction} className="text-3xl font-semibold tracking-tight" />
          </div>
          <div className="flex flex-wrap gap-2">
            {isCashflow && (
              <CashflowDialog
                type={t.type as "INCOME" | "EXPENSE"}
                accounts={accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance }))}
                categories={categories.map((c) => ({ id: c.id, name: c.name }))}
                today={todayString(user.timezone)}
                initial={{
                  id: t.id,
                  type: t.type as "INCOME" | "EXPENSE",
                  amount: t.amount,
                  date: t.date,
                  accountId: t.account.id,
                  categoryId: t.categoryId ?? "",
                  counterparty: t.counterparty ?? "",
                  reference: t.reference ?? "",
                  description: t.description ?? "",
                }}
                trigger={
                  <Button variant="outline" size="sm">
                    <Pencil /> Edit
                  </Button>
                }
              />
            )}
            {t.loan && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/loans/${t.loan.id}`}>
                  <HandCoins /> Open loan
                </Link>
              </Button>
            )}
            {t.editable && <DeleteTransactionButton id={t.id} />}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="flex flex-col gap-3">
              <Row label={t.type === "TRANSFER" ? "From" : "Account"}>{t.account.name}</Row>
              {t.toAccount && <Row label="To">{t.toAccount.name}</Row>}
              {t.category && <Row label="Category">{t.category.name}</Row>}
              {t.counterparty && <Row label="Counterparty">{t.counterparty}</Row>}
              {t.reference && <Row label="Reference">{t.reference}</Row>}
              {t.loan && <Row label="Loan">{t.loan.title}</Row>}
              {t.recurring && (
                <Row label="Recurring">
                  {RECURRING_FREQUENCY_LABELS[t.recurring.frequency]} — {t.recurring.description ?? "rule"}
                </Row>
              )}
              {t.loanPayment && (
                <>
                  <Row label="Principal">
                    <Money value={t.loanPayment.principal} />
                  </Row>
                  <Row label="Interest">
                    <Money value={t.loanPayment.interest} />
                  </Row>
                  <Row label="Fees">
                    <Money value={t.loanPayment.fee} />
                  </Row>
                </>
              )}
              <Row label="Recorded">{formatDateTime(t.createdAt, user.timezone)}</Row>
            </dl>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Receipts & documents</CardTitle>
          </CardHeader>
          <CardContent>
            <AttachmentsPanel items={t.attachments} target={{ transactionId: t.id }} />
          </CardContent>
        </Card>
      </div>

      {history.length > 0 && (
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Change history</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-3 border-l pl-4">
              {history.map((h) => (
                <li key={h.id} className="text-sm">
                  <p className="font-medium">{h.summary}</p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(h.createdAt, user.timezone)}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
