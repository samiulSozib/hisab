"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CalendarClock, Loader2, Pencil, Plus, Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { DateField, MoneyField, SelectField, SwitchField, TextField } from "@/components/forms/fields";
import { useActionSubmit } from "@/components/forms/use-action-form";
import { EmptyState } from "@/components/shared/page";
import { Money } from "@/components/shared/money";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { RECURRING_FREQUENCIES, RECURRING_FREQUENCY_LABELS } from "@/lib/constants";
import { formatDate } from "@/lib/dates";
import { recurringSchema, type RecurringInput } from "@/lib/validations/schemas";
import { createRecurringAction, deleteRecurringAction, updateRecurringAction } from "@/server/actions/transactions";
import type { RecurringDTO } from "@/server/services/recurring";
import type { ActionResult } from "@/lib/action-result";
import type { Opt } from "./cashflow-dialog";

export function RecurringDialog({
  type,
  trigger,
  accounts,
  categories,
  today,
  initial,
}: {
  type: "INCOME" | "EXPENSE";
  trigger: React.ReactNode;
  accounts: Opt[];
  categories: Opt[];
  today: string;
  initial?: RecurringInput & { id: string };
}) {
  const [open, setOpen] = useState(false);
  const salary = categories.find((c) => c.name === "Salary");
  const defaults: RecurringInput = initial ?? {
    type,
    amount: "",
    accountId: accounts[0]?.id ?? "",
    categoryId: (type === "INCOME" ? salary?.id : undefined) ?? categories[0]?.id ?? "",
    counterparty: "",
    description: type === "INCOME" ? "Monthly salary" : "",
    frequency: "MONTHLY",
    interval: "1",
    startDate: today,
    endDate: "",
    isActive: true,
  };
  const form = useForm({ resolver: zodResolver(recurringSchema), defaultValues: defaults });
  const { onSubmit, pending } = useActionSubmit(
    form,
    (v): Promise<ActionResult<unknown>> => (initial ? updateRecurringAction(initial.id, v) : createRecurringAction(v)),
    { onSuccess: () => setOpen(false) },
  );
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
          <DialogTitle>{initial ? "Edit recurring rule" : `New recurring ${type === "INCOME" ? "income" : "expense"}`}</DialogTitle>
          <DialogDescription>
            Entries are posted automatically on each due date (also back-filled if the start date is in the past).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField control={form.control} name="amount" label="Amount" />
              <SelectField control={form.control} name="categoryId" label={type === "INCOME" ? "Income source" : "Category"} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
            </div>
            <SelectField control={form.control} name="accountId" label={type === "INCOME" ? "Received into" : "Paid from"} options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={form.control}
                name="frequency"
                label="Repeats"
                options={RECURRING_FREQUENCIES.map((f) => ({ value: f, label: RECURRING_FREQUENCY_LABELS[f] }))}
              />
              <TextField control={form.control} name="interval" label="Every N periods" type="number" description="1 = every period" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <DateField control={form.control} name="startDate" label="First date" />
              <DateField control={form.control} name="endDate" label="End date (optional)" />
            </div>
            <TextField control={form.control} name="description" label="Description" />
            <TextField control={form.control} name="counterparty" label={type === "INCOME" ? "Payer (optional)" : "Payee (optional)"} />
            <SwitchField control={form.control} name="isActive" label="Active" description="Pause to stop posting new entries." />
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              Save rule
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecurringList({
  type,
  rules,
  accounts,
  categories,
  today,
}: {
  type: "INCOME" | "EXPENSE";
  rules: RecurringDTO[];
  accounts: Opt[];
  categories: Opt[];
  today: string;
}) {
  const addButton = (
    <RecurringDialog
      type={type}
      accounts={accounts}
      categories={categories}
      today={today}
      trigger={
        <Button variant="outline" size="sm">
          <Plus /> Add rule
        </Button>
      }
    />
  );
  if (rules.length === 0) {
    return (
      <EmptyState
        icon={Repeat}
        title={type === "INCOME" ? "No recurring income" : "No recurring expenses"}
        description={type === "INCOME" ? "Set up your monthly salary once and it will be recorded automatically." : "Rent, internet, subscriptions — record them automatically every period."}
        action={addButton}
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">{addButton}</div>
      <ul className="divide-y rounded-xl border">
        {rules.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center gap-3 p-4">
            <span className="grid size-9 place-items-center rounded-full bg-primary/10 text-primary">
              <CalendarClock className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.description || r.categoryName || "Recurring"}</p>
              <p className="text-xs text-muted-foreground">
                {RECURRING_FREQUENCY_LABELS[r.frequency]}
                {r.interval > 1 ? ` ×${r.interval}` : ""} · {r.accountName} · next {formatDate(r.nextRunDate)}
                {r.endDate ? ` · until ${formatDate(r.endDate)}` : ""}
              </p>
            </div>
            {!r.isActive && <Badge variant="secondary">Paused</Badge>}
            <Money value={r.amount} className="font-semibold" />
            <div className="flex gap-1">
              <RecurringDialog
                type={type}
                accounts={accounts}
                categories={categories}
                today={today}
                initial={{
                  id: r.id,
                  type: r.type,
                  amount: r.amount,
                  accountId: r.accountId,
                  categoryId: r.categoryId ?? "",
                  counterparty: r.counterparty ?? "",
                  description: r.description ?? "",
                  frequency: r.frequency,
                  interval: String(r.interval),
                  startDate: r.startDate,
                  endDate: r.endDate ?? "",
                  isActive: r.isActive,
                }}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label="Edit rule">
                    <Pencil />
                  </Button>
                }
              />
              <ConfirmAction
                title="Delete recurring rule?"
                description="Future entries stop. Entries already recorded are kept."
                action={() => deleteRecurringAction(r.id)}
                trigger={
                  <Button variant="ghost" size="icon-sm" aria-label="Delete rule">
                    <Trash2 />
                  </Button>
                }
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
