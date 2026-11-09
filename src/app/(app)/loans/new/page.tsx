import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Landmark, Smartphone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/page";
import { BankLoanForm, EmiLoanForm, PersonalLoanForm } from "@/components/features/loans/loan-forms";
import { requireUser } from "@/server/auth";
import { accountOptions } from "@/server/services/accounts";
import { categoryOptions } from "@/server/services/categories";
import { todayString } from "@/lib/dates";

export const metadata: Metadata = { title: "New loan" };

const KINDS = [
  { kind: "personal", title: "Personal loan", text: "Borrowed from or lent to a person", icon: Users },
  { kind: "emi", title: "EMI purchase", text: "Phone, laptop, furniture on installments", icon: Smartphone },
  { kind: "bank", title: "Bank loan", text: "Amortizing loan from a bank or NBFI", icon: Landmark },
] as const;

export default async function NewLoanPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requireUser();
  const { kind } = await searchParams;
  const [accounts, categories] = await Promise.all([accountOptions(user.id), categoryOptions(user.id, "EXPENSE")]);
  const today = todayString(user.timezone);
  const opts = accounts.map((a) => ({ id: a.id, name: a.name, balance: a.balance }));
  const current = KINDS.find((k) => k.kind === kind);

  if (accounts.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="New loan" description="You need at least one account to link the loan to." />
        <Button asChild className="self-start">
          <Link href="/accounts">Create an account</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/loans">
          <ArrowLeft /> Loans
        </Link>
      </Button>
      <PageHeader title={current ? `New ${current.title.toLowerCase()}` : "What kind of loan?"} description={current?.text} />
      {!current && (
        <div className="grid gap-4 sm:grid-cols-3">
          {KINDS.map((k) => (
            <Link key={k.kind} href={`/loans/new?kind=${k.kind}`} className="group">
              <Card className="card-elevated h-full transition-shadow group-hover:shadow-md">
                <CardContent className="flex flex-col gap-3">
                  <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                    <k.icon className="size-5" />
                  </span>
                  <p className="font-medium">{k.title}</p>
                  <p className="text-sm text-muted-foreground">{k.text}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
      {kind === "personal" && <PersonalLoanForm accounts={opts} today={today} />}
      {kind === "emi" && <EmiLoanForm accounts={opts} categories={categories.map((c) => ({ id: c.id, name: c.name }))} today={today} />}
      {kind === "bank" && <BankLoanForm accounts={opts} today={today} />}
    </div>
  );
}
