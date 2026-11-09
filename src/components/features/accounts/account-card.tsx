"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, List, MoreHorizontal, Pencil, Scale, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Money } from "@/components/shared/money";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { ACCOUNT_TYPE_LABELS, type AccountTypeValue } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { setAccountArchivedAction, deleteAccountAction } from "@/server/actions/accounts";
import type { AccountDTO } from "@/server/services/accounts";
import { AccountFormDialog, AdjustBalanceDialog } from "./account-dialogs";

export function AccountCard({ account, today }: { account: AccountDTO; today: string }) {
  const color = account.color ?? "#64748b";
  return (
    <Card className="card-elevated group relative gap-0 overflow-hidden py-0 transition-shadow hover:shadow-md">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} aria-hidden />
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              className="grid size-10 shrink-0 place-items-center rounded-xl text-sm font-semibold text-white"
              style={{ background: color }}
              aria-hidden
            >
              {account.name.slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium">{account.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                {ACCOUNT_TYPE_LABELS[account.type as AccountTypeValue] ?? account.type}
                {account.institution ? ` · ${account.institution}` : ""}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="-mr-2 -mt-1" aria-label={`Actions for ${account.name}`}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild>
                <Link href={`/transactions?accountId=${account.id}`}>
                  <List /> View transactions
                </Link>
              </DropdownMenuItem>
              {!account.isArchived && (
                <>
                  <AccountFormDialog
                    today={today}
                    account={{
                      id: account.id,
                      name: account.name,
                      type: account.type as AccountTypeValue,
                      institution: account.institution ?? "",
                      description: account.description ?? "",
                      color: account.color ?? undefined,
                      openingBalance: account.openingBalance,
                      openingDate: account.openingDate,
                      includeInNetWorth: account.includeInNetWorth,
                    }}
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Pencil /> Edit
                      </DropdownMenuItem>
                    }
                  />
                  <AdjustBalanceDialog
                    today={today}
                    account={account}
                    trigger={
                      <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                        <Scale /> Reconcile balance
                      </DropdownMenuItem>
                    }
                  />
                </>
              )}
              <DropdownMenuSeparator />
              <ConfirmAction
                title={account.isArchived ? "Restore account?" : "Archive account?"}
                description={
                  account.isArchived
                    ? "The account will appear in forms and totals again."
                    : "Archived accounts are hidden from forms and excluded from totals. History is kept and you can restore it any time."
                }
                confirmLabel={account.isArchived ? "Restore" : "Archive"}
                destructive={false}
                action={() => setAccountArchivedAction(account.id, !account.isArchived)}
                trigger={
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                    {account.isArchived ? <ArchiveRestore /> : <Archive />}
                    {account.isArchived ? "Restore" : "Archive"}
                  </DropdownMenuItem>
                }
              />
              <ConfirmAction
                title="Delete account?"
                description="Only accounts without transaction history can be deleted. This cannot be undone."
                action={() => deleteAccountAction(account.id)}
                trigger={
                  <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                    <Trash2 /> Delete
                  </DropdownMenuItem>
                }
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Current balance</p>
          <Money value={account.currentBalance} tone={Number(account.currentBalance) < 0 ? "negative" : "none"} className="text-2xl font-semibold tracking-tight" />
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>
            Opening <Money value={account.openingBalance} className="text-foreground/80" /> · {formatDate(account.openingDate)}
          </span>
          {!account.includeInNetWorth && <Badge variant="outline">Excluded from net worth</Badge>}
          {account.isArchived && <Badge variant="secondary">Archived</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}
