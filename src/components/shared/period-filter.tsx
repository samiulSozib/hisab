"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CalendarRange } from "lucide-react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const PRESETS = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "year", label: "Year" },
] as const;

/** Monthly / quarterly / yearly / custom date-range filter, stored in the URL. */
export function PeriodFilter({ label }: { label: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get("period") ?? "month";
  const [from, setFrom] = useState(params.get("from") ?? "");
  const [to, setTo] = useState(params.get("to") ?? "");
  const [open, setOpen] = useState(false);

  function apply(next: Record<string, string | null>) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) {
      if (v) sp.set(k, v);
      else sp.delete(k);
    }
    router.push(`${pathname}?${sp.toString()}`, { scroll: false });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={current === "custom" ? "" : current}
        onValueChange={(v) => v && apply({ period: v, from: null, to: null })}
        aria-label="Reporting period"
      >
        {PRESETS.map((p) => (
          <ToggleGroupItem key={p.value} value={p.value} className="px-3">
            {p.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant={current === "custom" ? "secondary" : "outline"} size="sm">
            <CalendarRange />
            {current === "custom" ? label : "Custom"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72">
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (from && to) {
                apply({ period: "custom", from, to });
                setOpen(false);
              }
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="pf-from">From</Label>
              <Input id="pf-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="pf-to">To</Label>
              <Input id="pf-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} required />
            </div>
            <Button type="submit" size="sm">
              Apply range
            </Button>
          </form>
        </PopoverContent>
      </Popover>
    </div>
  );
}
