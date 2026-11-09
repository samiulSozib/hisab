"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTheme } from "next-themes";
import { ArchiveRestore, Calculator, Loader2, Monitor, Moon, Pencil, Plus, Repeat, Sun, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { FieldGroup } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SelectField, TextField } from "@/components/forms/fields";
import { useActionSubmit } from "@/components/forms/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { categorySchema, type CategoryInput } from "@/lib/validations/schemas";
import type { ActionResult } from "@/lib/action-result";
import {
  createCategoryAction,
  recalculateBalancesAction,
  removeCategoryAction,
  restoreCategoryAction,
  updateCategoryAction,
} from "@/server/actions/accounts";
import { runRecurringNowAction } from "@/server/actions/transactions";
import { cn } from "@/lib/utils";

type Cat = { id: string; name: string; kind: "INCOME" | "EXPENSE"; color: string | null; isArchived: boolean; usage: number };

const PALETTE = ["#16a34a", "#0ea5e9", "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e", "#f97316", "#eab308", "#14b8a6", "#64748b"];

function CategoryDialog({ kind, initial, trigger }: { kind: "INCOME" | "EXPENSE"; initial?: Cat; trigger: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const defaults: CategoryInput = { name: initial?.name ?? "", kind: initial?.kind ?? kind, color: initial?.color ?? PALETTE[0] };
  const form = useForm({ resolver: zodResolver(categorySchema), defaultValues: defaults });
  const color = useWatch({ control: form.control, name: "color" });
  const { onSubmit, pending } = useActionSubmit(
    form,
    (v): Promise<ActionResult<unknown>> => (initial ? updateCategoryAction(initial.id, v) : createCategoryAction(v)),
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
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{initial ? "Edit category" : "New category"}</DialogTitle>
          <DialogDescription>Categories organise your income and spending reports.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <TextField control={form.control} name="name" label="Name" />
            <SelectField
              control={form.control}
              name="kind"
              label="Type"
              options={[
                { value: "EXPENSE", label: "Expense" },
                { value: "INCOME", label: "Income" },
              ]}
            />
            <div className="flex flex-wrap gap-2">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Colour ${c}`}
                  onClick={() => form.setValue("color", c)}
                  className={cn("size-7 rounded-full ring-offset-2 ring-offset-background", color === c && "ring-2 ring-foreground")}
                  style={{ background: c }}
                />
              ))}
            </div>
          </FieldGroup>
          <DialogFooter className="mt-6">
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

function CategoryList({ items, kind }: { items: Cat[]; kind: "INCOME" | "EXPENSE" }) {
  const [, start] = useTransition();
  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <CategoryDialog
          kind={kind}
          trigger={
            <Button size="sm" variant="outline">
              <Plus /> Add category
            </Button>
          }
        />
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {items.map((c) => (
          <li key={c.id} className={cn("flex items-center gap-3 rounded-lg border px-3 py-2", c.isArchived && "opacity-60")}>
            <span className="size-3 rounded-full" style={{ background: c.color ?? "#94a3b8" }} />
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{c.name}</span>
            {c.isArchived && <Badge variant="secondary">Archived</Badge>}
            <span className="num text-xs text-muted-foreground">{c.usage}</span>
            {c.isArchived ? (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="Restore"
                onClick={() =>
                  start(async () => {
                    const r = await restoreCategoryAction(c.id);
                    if (r.ok) toast.success("Category restored");
                    else toast.error(r.error);
                  })
                }
              >
                <ArchiveRestore />
              </Button>
            ) : (
              <>
                <CategoryDialog
                  kind={kind}
                  initial={c}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Edit ${c.name}`}>
                      <Pencil />
                    </Button>
                  }
                />
                <ConfirmAction
                  title={`Remove "${c.name}"?`}
                  description={c.usage > 0 ? "This category is in use, so it will be archived (history keeps its label)." : "This unused category will be deleted."}
                  confirmLabel={c.usage > 0 ? "Archive" : "Delete"}
                  action={() => removeCategoryAction(c.id)}
                  onDone={(r) => toast.success(r === "archived" ? "Category archived" : "Category deleted")}
                  trigger={
                    <Button variant="ghost" size="icon-sm" aria-label={`Remove ${c.name}`}>
                      <Trash2 />
                    </Button>
                  }
                />
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CategoryManager({ categories }: { categories: Cat[] }) {
  return (
    <Tabs defaultValue="EXPENSE">
      <TabsList>
        <TabsTrigger value="EXPENSE">Expense</TabsTrigger>
        <TabsTrigger value="INCOME">Income</TabsTrigger>
      </TabsList>
      <TabsContent value="EXPENSE" className="mt-4">
        <CategoryList kind="EXPENSE" items={categories.filter((c) => c.kind === "EXPENSE")} />
      </TabsContent>
      <TabsContent value="INCOME" className="mt-4">
        <CategoryList kind="INCOME" items={categories.filter((c) => c.kind === "INCOME")} />
      </TabsContent>
    </Tabs>
  );
}

export function ThemePicker() {
  const { theme, setTheme } = useTheme();
  return (
    <ToggleGroup type="single" variant="outline" value={theme} onValueChange={(v) => v && setTheme(v)} aria-label="Theme">
      <ToggleGroupItem value="light" className="px-3">
        <Sun /> Light
      </ToggleGroupItem>
      <ToggleGroupItem value="dark" className="px-3">
        <Moon /> Dark
      </ToggleGroupItem>
      <ToggleGroupItem value="system" className="px-3">
        <Monitor /> System
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export function DataTools() {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await recalculateBalancesAction();
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.data.length ? `Corrected ${r.data.length} account balance(s)` : "All balances match the ledger ✓");
          })
        }
      >
        {pending ? <Loader2 className="animate-spin" /> : <Calculator />} Verify balances
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await runRecurringNowAction();
            if (!r.ok) return void toast.error(r.error);
            toast.success(r.data ? `Posted ${r.data} recurring entr${r.data === 1 ? "y" : "ies"}` : "Nothing due right now");
          })
        }
      >
        <Repeat /> Run recurring now
      </Button>
    </div>
  );
}
