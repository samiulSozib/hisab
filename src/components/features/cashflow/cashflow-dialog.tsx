"use client";

import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { DateField, MoneyField, SelectField, TextField, TextareaField } from "@/components/forms/fields";
import { useActionSubmit } from "@/components/forms/use-action-form";
import { cashflowSchema, type CashflowInput } from "@/lib/validations/schemas";
import { createCashflowAction, updateCashflowAction } from "@/server/actions/transactions";
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import type { ActionResult } from "@/lib/action-result";

export type Opt = { id: string; name: string; balance?: string };

export async function uploadAttachment(file: File, target: { transactionId?: string; loanId?: string }) {
  if (file.size > MAX_UPLOAD_BYTES) {
    toast.error("Files must be 4 MB or smaller");
    return false;
  }
  const body = new FormData();
  body.set("file", file);
  if (target.transactionId) body.set("transactionId", target.transactionId);
  if (target.loanId) body.set("loanId", target.loanId);
  const res = await fetch("/api/attachments", { method: "POST", body });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({ error: "Upload failed" }))) as { error?: string };
    toast.error(error ?? "Upload failed");
    return false;
  }
  return true;
}

export function CashflowDialog({
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
  initial?: CashflowInput & { id: string };
}) {
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const isIncome = type === "INCOME";
  const defaults: CashflowInput = initial ?? {
    type,
    amount: "",
    date: today,
    accountId: accounts[0]?.id ?? "",
    categoryId: categories[0]?.id ?? "",
    counterparty: "",
    reference: "",
    description: "",
  };
  const form = useForm({ resolver: zodResolver(cashflowSchema), defaultValues: defaults });
  const { onSubmit, pending } = useActionSubmit(
    form,
    async (v): Promise<ActionResult<string>> => {
      const r = initial ? await updateCashflowAction(initial.id, v) : await createCashflowAction(v);
      const file = fileRef.current?.files?.[0];
      if (r.ok && file) await uploadAttachment(file, { transactionId: r.data });
      return r;
    },
    {
      onSuccess: () => {
        setOpen(false);
        form.reset(defaults);
      },
    },
  );

  const noun = isIncome ? "income" : "expense";
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
          <DialogTitle>{initial ? `Edit ${noun}` : `Add ${noun}`}</DialogTitle>
          <DialogDescription>
            {isIncome ? "Salary, bonus, freelancing, business or any money received." : "Record spending and attach the receipt if you have one."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <MoneyField control={form.control} name="amount" label="Amount" />
              <DateField control={form.control} name="date" label="Date" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <SelectField
                control={form.control}
                name="categoryId"
                label={isIncome ? "Income source" : "Category"}
                options={categories.map((c) => ({ value: c.id, label: c.name }))}
              />
              <SelectField
                control={form.control}
                name="accountId"
                label={isIncome ? "Received into" : "Paid from"}
                options={accounts.map((a) => ({ value: a.id, label: a.name, hint: a.balance ? formatMoney(a.balance, { decimals: 0 }) : undefined }))}
              />
            </div>
            <TextField
              control={form.control}
              name="counterparty"
              label={isIncome ? "Payer (optional)" : "Paid to (optional)"}
              placeholder={isIncome ? "e.g. Employer name" : "e.g. Shwapno"}
            />
            <TextareaField control={form.control} name="description" label="Description (optional)" rows={2} />
            <TextField control={form.control} name="reference" label="Reference (optional)" placeholder="Invoice / TrxID" />
            <Field>
              <FieldLabel htmlFor="attachment">
                <Paperclip className="size-3.5" /> {isIncome ? "Attachment" : "Receipt"} (optional)
              </FieldLabel>
              <Input id="attachment" ref={fileRef} type="file" accept={ALLOWED_UPLOAD_TYPES.join(",")} className="text-sm" />
              <FieldDescription>PDF, PNG, JPEG or WebP up to 4 MB.</FieldDescription>
            </Field>
          </FieldGroup>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="animate-spin" />}
              {initial ? "Save changes" : `Add ${noun}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
