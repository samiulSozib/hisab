"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, MoreHorizontal, Paperclip, Pencil, Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FlowAmount } from "@/components/shared/money";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { TRANSACTION_TYPE_LABELS, type TransactionTypeValue } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { deleteTransactionAction } from "@/server/actions/transactions";
import type { TransactionRow } from "@/server/services/transactions";
import { CashflowDialog, type Opt } from "./cashflow-dialog";

const TYPE_TONE: Partial<Record<string, string>> = {
  INCOME: "bg-positive/10 text-positive border-transparent",
  EXPENSE: "bg-chart-2/10 text-[color:var(--chart-2)] border-transparent",
  TRANSFER: "bg-muted text-muted-foreground border-transparent",
};

export function TypeBadge({ type }: { type: string }) {
  return (
    <Badge variant="outline" className={TYPE_TONE[type] ?? "border-transparent bg-primary/10 text-primary"}>
      {TRANSACTION_TYPE_LABELS[type as TransactionTypeValue] ?? type}
    </Badge>
  );
}

function titleOf(t: TransactionRow) {
  if (t.type === "TRANSFER") return t.description && t.description !== "Transfer" ? t.description : "Transfer";
  return t.description || t.counterparty || t.category?.name || TRANSACTION_TYPE_LABELS[t.type as TransactionTypeValue];
}

type EditCtx = { accounts: Opt[]; incomeCategories: Opt[]; expenseCategories: Opt[]; today: string };

function RowActions({ t, edit }: { t: TransactionRow; edit?: EditCtx }) {
  const canEdit = edit && (t.type === "INCOME" || t.type === "EXPENSE");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label="Transaction actions" onClick={(e) => e.stopPropagation()}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem asChild>
          <Link href={`/transactions/${t.id}`}>
            <Eye /> View details
          </Link>
        </DropdownMenuItem>
        {t.loan && (
          <DropdownMenuItem asChild>
            <Link href={`/loans/${t.loan.id}`}>
              <ArrowRight /> Open loan
            </Link>
          </DropdownMenuItem>
        )}
        {canEdit && (
          <CashflowDialog
            type={t.type as "INCOME" | "EXPENSE"}
            accounts={edit.accounts}
            categories={t.type === "INCOME" ? edit.incomeCategories : edit.expenseCategories}
            today={edit.today}
            initial={{
              id: t.id,
              type: t.type as "INCOME" | "EXPENSE",
              amount: t.amount,
              date: t.date,
              accountId: t.account.id,
              categoryId: t.category?.id ?? "",
              counterparty: t.counterparty ?? "",
              reference: t.reference ?? "",
              description: t.description ?? "",
            }}
            trigger={
              <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                <Pencil /> Edit
              </DropdownMenuItem>
            }
          />
        )}
        {t.editable && (
          <>
            <DropdownMenuSeparator />
            <ConfirmAction
              title="Delete this transaction?"
              description="The account balance will be adjusted back. This is recorded in the audit log."
              action={() => deleteTransactionAction(t.id)}
              trigger={
                <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                  <Trash2 /> Delete
                </DropdownMenuItem>
              }
            />
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Meta({ t }: { t: TransactionRow }) {
  return (
    <>
      {t.type === "TRANSFER" ? (
        <span>
          {t.account.name} → {t.toAccount?.name}
        </span>
      ) : (
        <span>{t.account.name}</span>
      )}
      {t.isRecurring && <Repeat className="size-3" aria-label="Recurring" />}
      {t.attachmentCount > 0 && <Paperclip className="size-3" aria-label="Has attachment" />}
    </>
  );
}

/** Desktop: table. Mobile: stacked cards. */
export function TransactionList({ rows, edit, showType = true }: { rows: TransactionRow[]; edit?: EditCtx; showType?: boolean }) {
  const router = useRouter();
  return (
    <>
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-[110px]">Date</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Category</TableHead>
              {showType && <TableHead>Type</TableHead>}
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((t) => (
              <TableRow key={t.id} className="cursor-pointer" onClick={() => router.push(`/transactions/${t.id}`)}>
                <TableCell className="num text-muted-foreground">{formatDate(t.date)}</TableCell>
                <TableCell className="max-w-[320px]">
                  <div className="truncate font-medium">{titleOf(t)}</div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Meta t={t} />
                  </div>
                </TableCell>
                <TableCell>
                  {t.category ? (
                    <span className="inline-flex items-center gap-2 text-sm">
                      <span className="size-2 rounded-full" style={{ background: t.category.color ?? "#94a3b8" }} />
                      {t.category.name}
                    </span>
                  ) : t.loan ? (
                    <span className="text-sm text-muted-foreground">{t.loan.title}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {showType && (
                  <TableCell>
                    <TypeBadge type={t.type} />
                  </TableCell>
                )}
                <TableCell className="text-right">
                  <FlowAmount amount={t.amount} direction={t.direction} />
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  <RowActions t={t} edit={edit} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ul className="divide-y md:hidden">
        {rows.map((t) => (
          <li key={t.id} className="flex items-center gap-3 py-3">
            <Link href={`/transactions/${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                style={{ background: t.category?.color ?? t.account.color ?? "#64748b" }}
                aria-hidden
              >
                {(t.category?.name ?? titleOf(t) ?? "?").slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{titleOf(t)}</span>
                <span className="flex min-w-0 items-center gap-1.5 truncate whitespace-nowrap text-xs text-muted-foreground">
                  {formatDate(t.date)} · <Meta t={t} />
                </span>
              </span>
              <FlowAmount amount={t.amount} direction={t.direction} className="text-sm" />
            </Link>
            <RowActions t={t} edit={edit} />
          </li>
        ))}
      </ul>
    </>
  );
}

/** Delete button for the detail page — navigates back to the list afterwards. */
export function DeleteTransactionButton({ id }: { id: string }) {
  const router = useRouter();
  return (
    <ConfirmAction
      title="Delete this transaction?"
      description="The account balance will be adjusted back. This is recorded in the audit log."
      action={() => deleteTransactionAction(id)}
      onDone={() => router.push("/transactions")}
      trigger={
        <Button variant="destructive" size="sm">
          <Trash2 /> Delete
        </Button>
      }
    />
  );
}
