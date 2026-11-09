import type { Metadata } from "next";
import { ArrowLeftRight, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader, StatCard } from "@/components/shared/page";
import { Money } from "@/components/shared/money";
import { AccountCard } from "@/components/features/accounts/account-card";
import { AccountFormDialog, TransferDialog } from "@/components/features/accounts/account-dialogs";
import { requireUser } from "@/server/auth";
import { accountOptions, listAccounts } from "@/server/services/accounts";
import { getNetWorth } from "@/server/services/reports";
import { todayString } from "@/lib/dates";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const { archived } = await searchParams;
  const showArchived = archived === "1";
  const [accounts, options, nw] = await Promise.all([
    listAccounts(user.id, { includeArchived: showArchived }),
    accountOptions(user.id),
    getNetWorth(user.id),
  ]);
  const today = todayString(user.timezone);
  const active = accounts.filter((a) => !a.isArchived);
  const archivedList = accounts.filter((a) => a.isArchived);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Accounts"
        description="Cash, bank accounts and mobile wallets with their live balances."
        actions={
          <>
            {options.length >= 2 && (
              <TransferDialog
                accounts={options}
                today={today}
                trigger={
                  <Button variant="outline">
                    <ArrowLeftRight /> Transfer
                  </Button>
                }
              />
            )}
            <AccountFormDialog
              today={today}
              trigger={
                <Button>
                  <Plus /> New account
                </Button>
              }
            />
          </>
        }
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Available balance" value={<Money value={nw.availableBalance} />} hint={`${active.length} active account${active.length === 1 ? "" : "s"}`} />
        <StatCard label="Money owed to you" value={<Money value={nw.receivables} />} hint="Outstanding personal loans given" />
        <StatCard label="Overdrafts / card dues" value={<Money value={nw.overdrafts} />} hint="Negative account balances" />
      </div>

      {active.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No accounts yet"
          description="Add your cash, bank and bKash/Nagad accounts to start tracking balances."
          action={<AccountFormDialog today={today} trigger={<Button>Add your first account</Button>} />}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((a) => (
            <AccountCard key={a.id} account={a} today={today} />
          ))}
        </div>
      )}

      {showArchived && archivedList.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-muted-foreground">Archived</h2>
          <div className="grid grid-cols-1 gap-4 opacity-80 sm:grid-cols-2 xl:grid-cols-3">
            {archivedList.map((a) => (
              <AccountCard key={a.id} account={a} today={today} />
            ))}
          </div>
        </section>
      )}
      <div>
        <Button variant="link" asChild className="px-0">
          <a href={showArchived ? "/accounts" : "/accounts?archived=1"}>{showArchived ? "Hide archived accounts" : "Show archived accounts"}</a>
        </Button>
      </div>
    </div>
  );
}
