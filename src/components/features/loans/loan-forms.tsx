"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { DateField, MoneyField, SelectField, SwitchField, TextField, TextareaField } from "@/components/forms/fields";
import { useActionSubmit } from "@/components/forms/use-action-form";
import { Money } from "@/components/shared/money";
import { INTEREST_METHOD_LABELS, PAYMENT_FREQUENCIES, PAYMENT_FREQUENCY_LABELS } from "@/lib/constants";
import { addMonths, formatDate, isDateOnlyString, parseDateOnly, toDateOnly } from "@/lib/dates";
import { generateSchedule, summarizeSchedule, type InterestMethod, type PaymentFrequency } from "@/lib/finance/loan-math";
import { d, formatMoney, parseMoneyInput } from "@/lib/money";
import {
  bankLoanSchema,
  emiLoanSchema,
  personalLoanSchema,
  type BankLoanInput,
  type EmiLoanInput,
  type PersonalLoanInput,
} from "@/lib/validations/schemas";
import { createBankLoanAction, createEmiLoanAction, createPersonalLoanAction } from "@/server/actions/loans";

type Opt = { id: string; name: string; balance?: string };

const frequencyOptions = PAYMENT_FREQUENCIES.map((f) => ({ value: f, label: PAYMENT_FREQUENCY_LABELS[f] }));
const methodOptions = (["REDUCING_BALANCE", "FLAT_RATE", "NONE"] as const).map((m) => ({ value: m, label: INTEREST_METHOD_LABELS[m] }));

function accountOpts(accounts: Opt[]) {
  return accounts.map((a) => ({ value: a.id, label: a.name, hint: a.balance ? formatMoney(a.balance, { decimals: 0 }) : undefined }));
}

function Submit({ pending, label }: { pending: boolean; label: string }) {
  return (
    <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
      {pending && <Loader2 className="animate-spin" />}
      {label}
    </Button>
  );
}

// ───────────── Schedule preview (same engine as the server) ─────────────

function SchedulePreview({
  principal,
  rate,
  method,
  frequency,
  count,
  firstDate,
  installmentAmount,
}: {
  principal: string;
  rate: string;
  method: InterestMethod;
  frequency: PaymentFrequency;
  count: string;
  firstDate: string;
  installmentAmount?: string;
}) {
  const result = useMemo(() => {
    const p = parseMoneyInput(principal || "");
    const n = Number(count);
    if (!p || d(p).lessThanOrEqualTo(0) || !Number.isInteger(n) || n < 1 || n > 1200 || !isDateOnlyString(firstDate)) return null;
    const r = rate && /^\d+(\.\d{1,4})?$/.test(rate) ? rate : "0";
    const fixed = installmentAmount ? parseMoneyInput(installmentAmount) : null;
    try {
      const rows = generateSchedule({
        principal: p,
        annualRate: r,
        installments: n,
        firstDueDate: parseDateOnly(firstDate),
        frequency,
        method,
        installmentAmount: fixed && d(fixed).greaterThan(0) ? fixed : undefined,
      });
      return { rows, summary: summarizeSchedule(rows) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [principal, rate, method, frequency, count, firstDate, installmentAmount]);

  return (
    <Card className="card-elevated lg:sticky lg:top-20">
      <CardHeader>
        <CardTitle>Repayment schedule</CardTitle>
        <CardDescription>Live preview — exactly what will be saved.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!result ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Info className="size-4" /> Enter the amount, installments and first date to preview.
          </p>
        ) : "error" in result ? (
          <p className="text-sm text-negative">{result.error}</p>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground">Installment</p>
                <Money value={result.summary.firstPayment.toFixed(2)} className="text-lg font-semibold" />
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Total interest</p>
                <Money value={result.summary.totalInterest.toFixed(2)} className="text-lg font-semibold" />
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Total payable</p>
                <Money value={result.summary.totalPayment.toFixed(2)} className="font-semibold" />
              </div>
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-xs text-muted-foreground">Last payment</p>
                <p className="num font-semibold">{formatDate(result.summary.lastDueDate)}</p>
              </div>
            </div>
            <div className="max-h-[340px] overflow-auto rounded-lg border">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Payment</TableHead>
                    <TableHead className="text-right">Interest</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {result.rows.map((r) => (
                    <TableRow key={r.number}>
                      <TableCell className="num text-muted-foreground">{r.number}</TableCell>
                      <TableCell className="num">{formatDate(r.dueDate)}</TableCell>
                      <TableCell className="num text-right">{formatMoney(r.payment, { symbol: false })}</TableCell>
                      <TableCell className="num text-right text-muted-foreground">{formatMoney(r.interest, { symbol: false })}</TableCell>
                      <TableCell className="num text-right">{formatMoney(r.closingBalance, { symbol: false })}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ───────────── Personal loan ─────────────

export function PersonalLoanForm({ accounts, today }: { accounts: Opt[]; today: string }) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(personalLoanSchema),
    defaultValues: {
      title: "",
      counterparty: "",
      direction: "BORROWED",
      principal: "",
      startDate: today,
      interestRate: "",
      repaymentTerms: "",
      dueDate: "",
      accountId: accounts[0]?.id ?? "",
      description: "",
      recordCashFlow: true,
    } satisfies PersonalLoanInput,
  });
  const direction = useWatch({ control: form.control, name: "direction" });
  const { onSubmit, pending } = useActionSubmit(form, createPersonalLoanAction, { onSuccess: (id) => router.push(`/loans/${id}`) });
  const borrowed = direction === "BORROWED";

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-2xl">
      <Card className="card-elevated">
        <CardContent>
          <FieldGroup>
            <SelectField
              control={form.control}
              name="direction"
              label="Direction"
              options={[
                { value: "BORROWED", label: "I borrowed money (I owe)" },
                { value: "LENT", label: "I lent money (they owe me)" },
              ]}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="title" label="Loan title" placeholder={borrowed ? "e.g. Loan from Rahim bhai" : "e.g. Loan to Karim"} />
              <TextField control={form.control} name="counterparty" label="Person's name" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField control={form.control} name="principal" label="Principal amount" />
              <DateField control={form.control} name="startDate" label={borrowed ? "Borrowing date" : "Lending date"} />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="interestRate" label="Interest rate % p.a. (optional)" placeholder="0" description="Simple interest, accrued daily." />
              <DateField control={form.control} name="dueDate" label="Due date (optional)" />
            </div>
            <SelectField
              control={form.control}
              name="accountId"
              label={borrowed ? "Money received into" : "Money paid from"}
              options={accountOpts(accounts)}
            />
            <TextareaField control={form.control} name="repaymentTerms" label="Repayment terms (optional)" placeholder="e.g. Pay back in 3 parts before Eid" rows={2} />
            <TextareaField control={form.control} name="description" label="Notes (optional)" rows={2} />
            <SwitchField
              control={form.control}
              name="recordCashFlow"
              label={borrowed ? "Add the borrowed money to the account" : "Deduct the lent money from the account"}
              description="Turn off when recording an older loan whose cash movement is already reflected in your balances."
            />
          </FieldGroup>
        </CardContent>
      </Card>
      <div className="mt-6 flex justify-end">
        <Submit pending={pending} label="Save loan" />
      </div>
    </form>
  );
}

// ───────────── EMI ─────────────

export function EmiLoanForm({ accounts, categories, today }: { accounts: Opt[]; categories: Opt[]; today: string }) {
  const router = useRouter();
  const electronics = categories.find((c) => c.name === "Electronics");
  const form = useForm({
    resolver: zodResolver(emiLoanSchema),
    defaultValues: {
      title: "",
      counterparty: "",
      purchasePrice: "",
      downPayment: "",
      installmentAmount: "",
      startDate: today,
      accountId: accounts[0]?.id ?? "",
      purchaseCategoryId: electronics?.id ?? "",
      finalPaymentDate: "",
      description: "",
      recordPurchase: true,
      interestRate: "",
      interestMethod: "REDUCING_BALANCE",
      frequency: "MONTHLY",
      installmentCount: "12",
      firstPaymentDate: toDateOnly(addMonths(parseDateOnly(today), 1)),
    } satisfies EmiLoanInput,
  });
  const v = useWatch({ control: form.control });
  const financed = (() => {
    const price = parseMoneyInput(v.purchasePrice ?? "");
    const down = parseMoneyInput(v.downPayment || "0") ?? "0";
    return price ? d(price).minus(down) : null;
  })();
  const { onSubmit, pending } = useActionSubmit(form, createEmiLoanAction, { onSuccess: (id) => router.push(`/loans/${id}`) });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="flex flex-col gap-6">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Purchase</CardTitle>
            <CardDescription>The item bought on installments.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="title" label="Item / loan title" placeholder="e.g. iPhone 16" />
                <TextField control={form.control} name="counterparty" label="Merchant / lender" placeholder="e.g. Star Tech · City Bank card" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <MoneyField control={form.control} name="purchasePrice" label="Purchase price" />
                <MoneyField control={form.control} name="downPayment" label="Down payment" />
                <div className="flex flex-col justify-end gap-1 rounded-lg bg-muted/50 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Financed principal</span>
                  <Money value={financed && financed.greaterThan(0) ? financed.toFixed(2) : "0"} className="font-semibold" />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <DateField control={form.control} name="startDate" label="Purchase date" />
                <SelectField
                  control={form.control}
                  name="purchaseCategoryId"
                  label="Expense category"
                  options={categories.map((c) => ({ value: c.id, label: c.name }))}
                />
              </div>
              <SelectField control={form.control} name="accountId" label="Payment account" options={accountOpts(accounts)} />
              <SwitchField
                control={form.control}
                name="recordPurchase"
                label="Record the purchase as an expense"
                description="Records the full price as an expense once, funded by your down payment + financing. Financing never counts as income. Turn off when importing an older EMI already reflected in your balances."
              />
            </FieldGroup>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Installments</CardTitle>
            <CardDescription>Use 0% for no-cost EMI.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="interestRate" label="Interest rate % p.a." placeholder="0" />
                <SelectField control={form.control} name="interestMethod" label="Interest method" options={methodOptions} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField control={form.control} name="installmentCount" label="No. of installments" type="number" />
                <SelectField control={form.control} name="frequency" label="Frequency" options={frequencyOptions} />
                <DateField control={form.control} name="firstPaymentDate" label="First installment" />
              </div>
              <FieldSeparator />
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField
                  control={form.control}
                  name="installmentAmount"
                  label="EMI amount (optional)"
                  description="Leave blank to calculate. Enter the merchant's quoted EMI to match it exactly."
                />
                <DateField control={form.control} name="finalPaymentDate" label="Final installment (optional)" />
              </div>
              <TextareaField control={form.control} name="description" label="Notes (optional)" rows={2} />
            </FieldGroup>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Submit pending={pending} label="Create EMI & schedule" />
        </div>
      </div>
      <SchedulePreview
        principal={financed && financed.greaterThan(0) ? financed.toFixed(2) : ""}
        rate={v.interestRate ?? ""}
        method={(v.interestMethod ?? "REDUCING_BALANCE") as InterestMethod}
        frequency={(v.frequency ?? "MONTHLY") as PaymentFrequency}
        count={v.installmentCount ?? ""}
        firstDate={v.firstPaymentDate ?? ""}
        installmentAmount={v.installmentAmount}
      />
    </form>
  );
}

// ───────────── Bank loan ─────────────

export function BankLoanForm({ accounts, today }: { accounts: Opt[]; today: string }) {
  const router = useRouter();
  const form = useForm({
    resolver: zodResolver(bankLoanSchema),
    defaultValues: {
      title: "",
      counterparty: "",
      loanType: "Personal loan",
      referenceNumber: "",
      principal: "",
      startDate: today,
      termMonths: "",
      installmentAmount: "",
      processingFee: "",
      accountId: accounts[0]?.id ?? "",
      description: "",
      recordCashFlow: true,
      interestRate: "",
      interestMethod: "REDUCING_BALANCE",
      frequency: "MONTHLY",
      installmentCount: "36",
      firstPaymentDate: toDateOnly(addMonths(parseDateOnly(today), 1)),
    } satisfies BankLoanInput,
  });
  const v = useWatch({ control: form.control });
  const { onSubmit, pending } = useActionSubmit(form, createBankLoanAction, { onSuccess: (id) => router.push(`/loans/${id}`) });

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_420px]">
      <div className="flex flex-col gap-6">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Loan</CardTitle>
            <CardDescription>Disbursed directly by a bank or financial institution.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="title" label="Loan title" placeholder="e.g. Car loan" />
                <TextField control={form.control} name="counterparty" label="Bank name" placeholder="e.g. BRAC Bank" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="loanType" label="Loan type" placeholder="Personal / Car / Home" />
                <TextField control={form.control} name="referenceNumber" label="Loan reference no. (optional)" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField control={form.control} name="principal" label="Original principal" />
                <DateField control={form.control} name="startDate" label="Disbursement date" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SelectField control={form.control} name="accountId" label="Linked bank account" options={accountOpts(accounts)} />
                <MoneyField control={form.control} name="processingFee" label="Processing fee (optional)" description="Recorded as a bank-fee expense." />
              </div>
              <SwitchField
                control={form.control}
                name="recordCashFlow"
                label="Deposit the principal into the linked account"
                description="Turn off when recording a loan disbursed before you started using Hisab."
              />
            </FieldGroup>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Repayment</CardTitle>
            <CardDescription>Fixed-rate amortizing (reducing balance) is the standard for Bangladeshi bank loans.</CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="interestRate" label="Interest rate % p.a." placeholder="e.g. 11.5" />
                <SelectField control={form.control} name="interestMethod" label="Interest calculation" options={methodOptions} />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <TextField control={form.control} name="installmentCount" label="No. of installments" type="number" />
                <SelectField control={form.control} name="frequency" label="Frequency" options={frequencyOptions} />
                <DateField control={form.control} name="firstPaymentDate" label="First payment" />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField control={form.control} name="installmentAmount" label="Monthly installment (optional)" description="Leave blank to calculate, or enter the bank's EMI." />
                <TextField control={form.control} name="termMonths" label="Loan term in months (optional)" type="number" />
              </div>
              <TextareaField control={form.control} name="description" label="Notes (optional)" rows={2} />
            </FieldGroup>
          </CardContent>
        </Card>
        <div className="flex justify-end">
          <Submit pending={pending} label="Create loan & schedule" />
        </div>
      </div>
      <SchedulePreview
        principal={v.principal ?? ""}
        rate={v.interestRate ?? ""}
        method={(v.interestMethod ?? "REDUCING_BALANCE") as InterestMethod}
        frequency={(v.frequency ?? "MONTHLY") as PaymentFrequency}
        count={v.installmentCount ?? ""}
        firstDate={v.firstPaymentDate ?? ""}
        installmentAmount={v.installmentAmount}
      />
    </form>
  );
}
