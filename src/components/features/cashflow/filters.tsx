"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { TRANSACTION_TYPE_LABELS, TRANSACTION_TYPES } from "@/lib/constants";

type Opt = { id: string; name: string };

const FILTER_KEYS = ["q", "type", "accountId", "categoryId", "from", "to", "min", "max", "sort"] as const;

/** Search, filter & sort controls stored in the URL; plus CSV export of the filtered set. */
export function TransactionFilters({
  accounts,
  categories,
  showType = false,
  forcedType,
}: {
  accounts: Opt[];
  categories?: Opt[];
  showType?: boolean;
  /** For income/expense pages the export is scoped to this type. */
  forcedType?: "INCOME" | "EXPENSE";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const initial = Object.fromEntries(FILTER_KEYS.map((k) => [k, params.get(k) ?? ""])) as Record<(typeof FILTER_KEYS)[number], string>;
  const [v, setV] = useState(initial);
  const advancedCount = (["type", "accountId", "categoryId", "from", "to", "min", "max"] as const).filter((k) => initial[k]).length;
  const [open, setOpen] = useState(advancedCount > 0);

  const set = (k: (typeof FILTER_KEYS)[number], value: string) => setV((s) => ({ ...s, [k]: value === "all" ? "" : value }));

  function apply(next = v) {
    const sp = new URLSearchParams();
    for (const k of FILTER_KEYS) if (next[k]) sp.set(k, next[k]);
    router.push(`${pathname}${sp.size ? `?${sp}` : ""}`, { scroll: false });
  }
  function reset() {
    const empty = Object.fromEntries(FILTER_KEYS.map((k) => [k, ""])) as typeof v;
    setV(empty);
    apply(empty);
  }

  const exportParams = new URLSearchParams();
  for (const k of FILTER_KEYS) if (initial[k]) exportParams.set(k, initial[k]);
  if (forcedType) exportParams.set("type", forcedType);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={v.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Search description, payee, reference…"
              className="pl-9"
              aria-label="Search transactions"
            />
          </div>
          <Select value={v.sort || "date_desc"} onValueChange={(s) => apply({ ...v, sort: s === "date_desc" ? "" : s })}>
            <SelectTrigger className="w-[150px]" aria-label="Sort">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="date_desc">Newest first</SelectItem>
              <SelectItem value="date_asc">Oldest first</SelectItem>
              <SelectItem value="amount_desc">Largest amount</SelectItem>
              <SelectItem value="amount_asc">Smallest amount</SelectItem>
            </SelectContent>
          </Select>
          <CollapsibleTrigger asChild>
            <Button type="button" variant="outline">
              <SlidersHorizontal /> Filters{advancedCount ? ` (${advancedCount})` : ""}
            </Button>
          </CollapsibleTrigger>
          <Button type="submit">Apply</Button>
          <Button type="button" variant="ghost" asChild>
            <a href={`/api/export/transactions?${exportParams}`} download>
              <Download /> CSV
            </a>
          </Button>
        </div>
        <CollapsibleContent>
          <div className="grid grid-cols-2 gap-3 rounded-xl border bg-muted/30 p-3 md:grid-cols-4">
            {showType && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Type</Label>
                <Select value={v.type || "all"} onValueChange={(s) => set("type", s)}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {TRANSACTION_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {TRANSACTION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-xs">Account</Label>
              <Select value={v.accountId || "all"} onValueChange={(s) => set("accountId", s)}>
                <SelectTrigger className="w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {categories && (
              <div className="grid gap-1.5">
                <Label className="text-xs">Category</Label>
                <Select value={v.categoryId || "all"} onValueChange={(s) => set("categoryId", s)}>
                  <SelectTrigger className="w-full bg-background">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-1.5">
              <Label className="text-xs">From</Label>
              <Input type="date" value={v.from} onChange={(e) => set("from", e.target.value)} className="bg-background" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">To</Label>
              <Input type="date" value={v.to} onChange={(e) => set("to", e.target.value)} className="bg-background" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Min amount</Label>
              <Input inputMode="decimal" value={v.min} onChange={(e) => set("min", e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="num bg-background" />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Max amount</Label>
              <Input inputMode="decimal" value={v.max} onChange={(e) => set("max", e.target.value.replace(/[^\d.]/g, ""))} placeholder="Any" className="num bg-background" />
            </div>
            <div className="col-span-2 flex items-end justify-end gap-2 md:col-span-1">
              <Button type="button" variant="ghost" size="sm" onClick={reset}>
                <X /> Clear all
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </form>
    </Collapsible>
  );
}
