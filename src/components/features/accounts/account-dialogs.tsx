"use client";

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { DateField, MoneyField, SelectField, SwitchField, TextField, TextareaField } from "@/components/forms/fields";
import { useActionSubmit } from "@/components/forms/use-action-form";
import { ACCOUNT_COLORS, ACCOUNT_TYPE_LABELS, ACCOUNT_TYPES, DEFAULT_ACCOUNT_COLOR, type AccountTypeValue } from "@/lib/constants";
import { accountSchema, adjustmentSchema, transferSchema, type AccountInput } from "@/lib/validations/schemas";
import { adjustBalanceAction, createAccountAction, transferAction, updateAccountAction } from "@/server/actions/accounts";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { ActionResult } from "@/lib/action-result";

export type AccountOption = { id: string; name: string; type?: string; balance: string };

const typeOptions = ACCOUNT_TYPES.map((t) => ({ value: t, label: ACCOUNT_TYPE_LABELS[t] }));

function SaveButton({ pending, label = "Save" }: { pending: boolean; label?: string }) {
  return (
    <Button type="submit" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {label}
    </Button>
  );
}

export function AccountFormDialog({
  trigger,
  today,
  account,
}: {
  trigger: React.ReactNode;
  today: string;
  account?: AccountInput & { id: string };
}) {
  const [open, setOpen] = useState(false);
  const defaults: AccountInput = account ?? {
    name: "",
    type: "BANK",
    institution: "",
    description: "",
    color: DEFAULT_ACCOUNT_COLOR.BANK,
    openingBalance: "0",
    openingDate: today,
    includeInNetWorth: true,
  };
  const form = useForm({ resolver: zodResolver(accountSchema), defaultValues: defaults });
  const { onSubmit, pending } = useActionSubmit(
    form,
    (v): Promise<ActionResult<unknown>> => (account ? updateAccountAction(account.id, v) : createAccountAction(v)),
    {
      onSuccess: () => {
        setOpen(false);
        if (!account) form.reset(defaults);
      },
    },
  );
  const color = useWatch({ control: form.control, name: "color" });

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
          <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>Cash, bank, mobile wallet or savings — each keeps its own running balance.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField control={form.control} name="name" label="Account name" placeholder="e.g. DBBL Salary" />
              <SelectField
                control={form.control}
                name="type"
                label="Type"
                options={typeOptions}
              />
            </div>
            <TextField control={form.control} name="institution" label="Bank / provider (optional)" placeholder="e.g. Dutch-Bangla Bank" />
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField
                control={form.control}
                name="openingBalance"
                label="Opening balance"
                allowNegative
                description="Negative for credit cards / overdrafts."
              />
              <DateField control={form.control} name="openingDate" label="As of date" />
            </div>
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">Colour</span>
              <div className="flex flex-wrap gap-2">
                {ACCOUNT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colour ${c}`}
                    onClick={() => form.setValue("color", c)}
                    className={cn("size-7 rounded-full ring-offset-2 ring-offset-background transition", color === c && "ring-2 ring-foreground")}
                    style={{ background: c }}
                  />
                ))}
              </div>
            </div>
            <TextareaField control={form.control} name="description" label="Description (optional)" rows={2} />
            <SwitchField
              control={form.control}
              name="includeInNetWorth"
              label="Include in net worth"
              description="Turn off for accounts you only track (e.g. a joint account)."
            />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SaveButton pending={pending} label={account ? "Save changes" : "Create account"} />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Pick a sensible default colour when the type changes on a new account. */
export function defaultColorFor(type: string) {
  return DEFAULT_ACCOUNT_COLOR[type as AccountTypeValue] ?? "#64748b";
}

export function TransferDialog({ trigger, accounts, today }: { trigger: React.ReactNode; accounts: AccountOption[]; today: string }) {
  const [open, setOpen] = useState(false);
  const defaults = {
    fromAccountId: accounts[0]?.id ?? "",
    toAccountId: accounts[1]?.id ?? "",
    amount: "",
    date: today,
    description: "",
    reference: "",
  };
  const form = useForm({ resolver: zodResolver(transferSchema), defaultValues: defaults });
  const { onSubmit, pending } = useActionSubmit(form, transferAction, {
    onSuccess: () => {
      setOpen(false);
      form.reset(defaults);
    },
  });
  const options = accounts.map((a) => ({ value: a.id, label: a.name, hint: formatMoney(a.balance, { decimals: 0 }) }));
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transfer between accounts</DialogTitle>
          <DialogDescription>Moves money between your own accounts. Not counted as income or expense.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <SelectField control={form.control} name="fromAccountId" label="From" options={options} />
            <SelectField control={form.control} name="toAccountId" label="To" options={options} />
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField control={form.control} name="amount" label="Amount" />
              <DateField control={form.control} name="date" label="Date" />
            </div>
            <TextField control={form.control} name="description" label="Note (optional)" placeholder="e.g. Cash withdrawal" />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SaveButton pending={pending} label="Transfer" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function AdjustBalanceDialog({
  trigger,
  account,
  today,
}: {
  trigger: React.ReactNode;
  account: { id: string; name: string; currentBalance: string };
  today: string;
}) {
  const [open, setOpen] = useState(false);
  const defaults = { accountId: account.id, actualBalance: account.currentBalance, date: today, description: "" };
  const form = useForm({ resolver: zodResolver(adjustmentSchema), defaultValues: defaults });
  const { onSubmit, pending } = useActionSubmit(form, adjustBalanceAction, { onSuccess: () => setOpen(false) });
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
          <DialogTitle>Reconcile {account.name}</DialogTitle>
          <DialogDescription>
            Enter the real balance. The difference from {formatMoney(account.currentBalance)} is recorded as an adjustment.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <MoneyField control={form.control} name="actualBalance" label="Actual balance" allowNegative />
            <DateField control={form.control} name="date" label="Date" />
            <TextField control={form.control} name="description" label="Reason (optional)" placeholder="e.g. Bank charges not recorded" />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <SaveButton pending={pending} label="Record adjustment" />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
