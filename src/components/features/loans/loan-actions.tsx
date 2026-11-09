"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Ban, CalendarCog, Loader2, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FieldGroup } from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { DateField, MoneyField, SelectField, TextField, TextareaField } from "@/components/forms/fields";
import { useActionSubmit } from "@/components/forms/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { Money } from "@/components/shared/money";
import { d, formatMoney, parseMoneyInput } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import {
  installmentUpdateSchema,
  loanPaymentSchema,
  loanUpdateSchema,
  type LoanPaymentInput,
} from "@/lib/validations/schemas";
import {
  deleteLoanAction,
  deleteLoanPaymentAction,
  recordLoanPaymentAction,
  rescheduleLoanAction,
  setLoanStatusAction,
  updateInstallmentAction,
  updateLoanAction,
} from "@/server/actions/loans";

type Opt = { id: string; name: string; balance?: string };
type Inst = { id: string; number: number; dueDate: string; remaining: string; interestDue: string };

// ───────────── Record payment ─────────────

export function PaymentDialog({
  loan,
  accounts,
  today,
  installments,
  defaultInstallmentId,
  suggestedInterest,
  trigger,
}: {
  loan: { id: string; title: string; direction: "BORROWED" | "LENT"; outstandingPrincipal: string; accountId: string; hasSchedule: boolean };
  accounts: Opt[];
  today: string;
  installments: Inst[];
  defaultInstallmentId?: string;
  suggestedInterest: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const lent = loan.direction === "LENT";
  const first = installments.find((i) => i.id === defaultInstallmentId) ?? installments[0];
  const defaults: LoanPaymentInput = {
    amount: first ? first.remaining : "",
    date: today,
    accountId: accounts.some((a) => a.id === loan.accountId) ? loan.accountId : (accounts[0]?.id ?? ""),
    installmentId: first?.id ?? "",
    fee: "",
    splitMode: loan.hasSchedule ? "auto" : d(suggestedInterest).greaterThan(0) ? "manual" : "auto",
    principalAmount: "",
    interestAmount: d(suggestedInterest).greaterThan(0) ? suggestedInterest : "",
    notes: "",
  };
  const form = useForm({ resolver: zodResolver(loanPaymentSchema), defaultValues: defaults });
  const v = useWatch({ control: form.control });
  const { onSubmit, pending } = useActionSubmit(form, (vals) => recordLoanPaymentAction(loan.id, vals), {
    successMessage: false,
    onSuccess: (r) => {
      toast.success(r.closed ? "Payment recorded — loan fully settled 🎉" : "Payment recorded");
      setOpen(false);
    },
  });

  // Live waterfall preview for auto mode.
  const preview = (() => {
    const amount = parseMoneyInput(v.amount ?? "");
    if (!amount) return null;
    const fee = parseMoneyInput(v.fee || "0") ?? "0";
    const inst = installments.find((i) => i.id === v.installmentId);
    const interestDue = inst ? inst.interestDue : suggestedInterest;
    const rest = d(amount).minus(fee);
    if (rest.isNegative()) return null;
    const interest = rest.lessThan(interestDue) ? rest : d(interestDue);
    return { fee: d(fee), interest, principal: rest.minus(interest) };
  })();

  // Keep manual principal in sync: principal = amount − interest − fee.
  const manualPrincipal = (() => {
    const amount = parseMoneyInput(v.amount ?? "");
    const interest = parseMoneyInput(v.interestAmount || "0");
    const fee = parseMoneyInput(v.fee || "0");
    if (!amount || interest === null || fee === null) return null;
    return d(amount).minus(interest).minus(fee);
  })();

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{lent ? "Record collection" : "Record payment"}</DialogTitle>
          <DialogDescription>
            {loan.title} · outstanding principal {formatMoney(loan.outstandingPrincipal)}
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            if (form.getValues("splitMode") === "manual" && manualPrincipal) {
              form.setValue("principalAmount", manualPrincipal.toFixed(2));
            }
            void onSubmit(e);
          }}
          noValidate
        >
          <FieldGroup>
            {loan.hasSchedule && installments.length > 0 && (
              <SelectField
                control={form.control}
                name="installmentId"
                label="Installment"
                options={installments.map((i) => ({
                  value: i.id,
                  label: `#${i.number} · ${formatDate(i.dueDate)}`,
                  hint: formatMoney(i.remaining, { decimals: 0 }),
                }))}
              />
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField control={form.control} name="amount" label="Amount paid" description={loan.hasSchedule ? "Pay more than due to prepay principal." : undefined} />
              <DateField control={form.control} name="date" label="Payment date" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={form.control}
                name="accountId"
                label={lent ? "Received into" : "Paid from"}
                options={accounts.map((a) => ({ value: a.id, label: a.name, hint: a.balance ? formatMoney(a.balance, { decimals: 0 }) : undefined }))}
              />
              <MoneyField control={form.control} name="fee" label="Fees / late charges" placeholder="0.00" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Principal / interest split</Label>
              <RadioGroup value={v.splitMode} onValueChange={(m) => form.setValue("splitMode", m as "auto" | "manual")} className="flex gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="auto" /> Automatic
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <RadioGroupItem value="manual" /> Enter manually
                </label>
              </RadioGroup>
            </div>
            {v.splitMode === "manual" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField control={form.control} name="interestAmount" label="Interest portion" description={d(suggestedInterest).greaterThan(0) ? `Accrued: ${formatMoney(suggestedInterest)}` : undefined} />
                <div className="flex flex-col justify-center rounded-lg bg-muted/50 px-3 py-2">
                  <span className="text-xs text-muted-foreground">Principal portion</span>
                  <Money value={manualPrincipal && !manualPrincipal.isNegative() ? manualPrincipal.toFixed(2) : "0"} className="font-semibold" />
                </div>
              </div>
            ) : (
              preview && (
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-muted/50 p-3 text-center text-xs">
                  <div>
                    <p className="text-muted-foreground">Fees</p>
                    <Money value={preview.fee.toFixed(2)} className="font-medium" />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Interest</p>
                    <Money value={preview.interest.toFixed(2)} className="font-medium" />
                  </div>
                  <div>
                    <p className="text-muted-foreground">Principal</p>
                    <Money value={preview.principal.toFixed(2)} className="font-semibold" />
                  </div>
                </div>
              )
            )}
            <TextField control={form.control} name="notes" label="Note / reference (optional)" />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {lent ? "Record collection" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Installment edit ─────────────

export function InstallmentDialog({
  inst,
  trigger,
}: {
  inst: { id: string; number: number; dueDate: string; status: string; notes: string | null };
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const defaults = {
    status: (inst.status === "MISSED" || inst.status === "WAIVED" ? inst.status : "PENDING") as "PENDING" | "MISSED" | "WAIVED",
    dueDate: inst.dueDate,
    notes: inst.notes ?? "",
  };
  const form = useForm({ resolver: zodResolver(installmentUpdateSchema), defaultValues: defaults });
  const { onSubmit, pending } = useActionSubmit(form, (v) => updateInstallmentAction(inst.id, v), { onSuccess: () => setOpen(false) });
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) form.reset(defaults);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Installment #{inst.number}</DialogTitle>
          <DialogDescription>Mark as missed, waive it, or move the due date.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <SelectField
              control={form.control}
              name="status"
              label="Status"
              options={[
                { value: "PENDING", label: "Pending / partially paid" },
                { value: "MISSED", label: "Missed" },
                { value: "WAIVED", label: "Waived (no longer due)" },
              ]}
            />
            <DateField control={form.control} name="dueDate" label="Due date" />
            <TextareaField control={form.control} name="notes" label="Notes" rows={2} />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Reschedule ─────────────

export function RescheduleDialog({ loanId, trigger, outOfSync }: { loanId: string; trigger: React.ReactNode; outOfSync: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"KEEP_TERM" | "KEEP_INSTALLMENT">("KEEP_INSTALLMENT");
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Regenerate remaining schedule</DialogTitle>
          <DialogDescription>
            Rebuilds every unpaid installment from the current outstanding principal.
            {outOfSync && " Your prepayments have made the current schedule larger than what you owe."}
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={mode} onValueChange={(m) => setMode(m as typeof mode)} className="gap-3">
          <label className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="KEEP_INSTALLMENT" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Keep installment, shorten term</span>
              <span className="text-xs text-muted-foreground">Same EMI, finish sooner, pay less interest.</span>
            </span>
          </label>
          <label className="flex cursor-pointer gap-3 rounded-lg border p-3 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
            <RadioGroupItem value="KEEP_TERM" className="mt-0.5" />
            <span>
              <span className="block text-sm font-medium">Keep term, lower installment</span>
              <span className="text-xs text-muted-foreground">Same number of remaining installments, smaller EMI.</span>
            </span>
          </label>
        </RadioGroup>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await rescheduleLoanAction(loanId, { mode });
                if (r.ok) {
                  toast.success(`Schedule regenerated: ${r.data} installment(s)`);
                  setOpen(false);
                } else toast.error(r.error);
              })
            }
          >
            {pending && <Loader2 className="animate-spin" />}
            Regenerate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────────── Edit details / status / delete ─────────────

export function LoanMenu({
  loan,
}: {
  loan: {
    id: string;
    kind: string;
    status: string;
    title: string;
    counterparty: string;
    repaymentTerms: string | null;
    dueDate: string | null;
    referenceNumber: string | null;
    description: string | null;
  };
}) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const defaults = {
    title: loan.title,
    counterparty: loan.counterparty,
    repaymentTerms: loan.repaymentTerms ?? "",
    dueDate: loan.dueDate ?? "",
    referenceNumber: loan.referenceNumber ?? "",
    description: loan.description ?? "",
  };
  const form = useForm({ resolver: zodResolver(loanUpdateSchema), defaultValues: defaults });
  const { onSubmit, pending } = useActionSubmit(form, (v) => updateLoanAction(loan.id, v), { onSuccess: () => setEditOpen(false) });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="More loan actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onSelect={() => {
              form.reset(defaults);
              setEditOpen(true);
            }}
          >
            <Pencil /> Edit details
          </DropdownMenuItem>
          {loan.status !== "CLOSED" && (
            <ConfirmAction
              title={loan.status === "DEFAULTED" ? "Mark as active again?" : "Mark as defaulted?"}
              description={
                loan.status === "DEFAULTED"
                  ? "The loan returns to active status."
                  : "Use this when repayment has stopped. The outstanding amount stays on your balance sheet until settled or deleted."
              }
              destructive={false}
              confirmLabel="Confirm"
              action={() => setLoanStatusAction(loan.id, loan.status === "DEFAULTED" ? "ACTIVE" : "DEFAULTED")}
              trigger={
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  {loan.status === "DEFAULTED" ? <RotateCcw /> : <Ban />}
                  {loan.status === "DEFAULTED" ? "Mark active" : "Mark defaulted"}
                </DropdownMenuItem>
              }
            />
          )}
          <DropdownMenuSeparator />
          <ConfirmAction
            title="Delete this loan?"
            description="The loan, its schedule and every related transaction (disbursement, purchase, payments) will be deleted and all account balances reversed. This cannot be undone."
            action={() => deleteLoanAction(loan.id)}
            onDone={() => router.push("/loans")}
            trigger={
              <DropdownMenuItem variant="destructive" onSelect={(e) => e.preventDefault()}>
                <Trash2 /> Delete loan
              </DropdownMenuItem>
            }
          />
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit loan details</DialogTitle>
            <DialogDescription>Amounts and schedules change only through payments and rescheduling, to keep balances consistent.</DialogDescription>
          </DialogHeader>
          <form onSubmit={onSubmit} noValidate>
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField control={form.control} name="title" label="Title" />
                <TextField control={form.control} name="counterparty" label={loan.kind === "BANK" ? "Bank" : loan.kind === "EMI" ? "Merchant / lender" : "Person"} />
              </div>
              {loan.kind === "BANK" && <TextField control={form.control} name="referenceNumber" label="Reference number" />}
              {loan.kind === "PERSONAL" && (
                <>
                  <DateField control={form.control} name="dueDate" label="Due date" />
                  <TextareaField control={form.control} name="repaymentTerms" label="Repayment terms" rows={2} />
                </>
              )}
              <TextareaField control={form.control} name="description" label="Notes" rows={2} />
            </FieldGroup>
            <DialogFooter className="mt-6">
              <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending && <Loader2 className="animate-spin" />}
                Save
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DeletePaymentButton({ paymentId }: { paymentId: string }) {
  return (
    <ConfirmAction
      title="Reverse this payment?"
      description="The payment is deleted, the account balance restored and the loan's outstanding amount increased again."
      confirmLabel="Reverse payment"
      action={() => deleteLoanPaymentAction(paymentId)}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label="Reverse payment">
          <Trash2 />
        </Button>
      }
    />
  );
}

export function InstallmentEditButton(props: { inst: { id: string; number: number; dueDate: string; status: string; notes: string | null } }) {
  return (
    <InstallmentDialog
      inst={props.inst}
      trigger={
        <Button variant="ghost" size="icon-sm" aria-label={`Edit installment ${props.inst.number}`}>
          <CalendarCog />
        </Button>
      }
    />
  );
}
