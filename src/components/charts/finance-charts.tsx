"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { formatMoney } from "@/lib/money";

// Chart numbers are converted from exact decimal strings ONLY for plotting; every figure the user
// reads (tooltips, labels, tables) is formatted from the original string.

const axisMoney = (v: number) => formatMoney(String(v), { compact: true, decimals: 1 });

function moneyFormatter(config: ChartConfig) {
  // eslint-disable-next-line react/display-name
  return (value: unknown, name: unknown, item: { color?: string; payload?: Record<string, unknown> }) => {
    const key = String(name);
    const raw = item.payload?.[`${key}Raw`];
    return (
      <div className="flex w-full items-center gap-2">
        <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
        <span className="text-muted-foreground">{config[key]?.label ?? key}</span>
        <span className="num ml-auto pl-4 font-medium text-foreground">{formatMoney(typeof raw === "string" ? raw : String(value))}</span>
      </div>
    );
  };
}

// ───────────── Income vs expenses (grouped bars) ─────────────

const cashflowConfig = {
  income: { label: "Income", color: "var(--chart-1)" },
  expenses: { label: "Expenses", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function CashflowChart({ data }: { data: { label: string; income: string; expenses: string }[] }) {
  const rows = data.map((d) => ({
    label: d.label,
    income: Number(d.income),
    expenses: Number(d.expenses),
    incomeRaw: d.income,
    expensesRaw: d.expenses,
  }));
  return (
    <ChartContainer config={cashflowConfig} className="aspect-auto h-[260px] w-full">
      <BarChart data={rows} barGap={2} barCategoryGap="28%" margin={{ left: 4, right: 4, top: 8 }}>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.6} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} width={56} fontSize={11} tickFormatter={axisMoney} />
        <ChartTooltip cursor={{ fillOpacity: 0.4 }} content={<ChartTooltipContent formatter={moneyFormatter(cashflowConfig)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Bar dataKey="income" fill="var(--color-income)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="expenses" fill="var(--color-expenses)" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ChartContainer>
  );
}

// ───────────── Balance trend (lines with soft area) ─────────────

const trendConfig = {
  netWorth: { label: "Net worth", color: "var(--chart-1)" },
  cash: { label: "Cash & bank", color: "var(--chart-3)" },
} satisfies ChartConfig;

export function BalanceTrendChart({ data }: { data: { label: string; cash: string; netWorth: string }[] }) {
  const rows = data.map((d) => ({
    label: d.label,
    cash: Number(d.cash),
    netWorth: Number(d.netWorth),
    cashRaw: d.cash,
    netWorthRaw: d.netWorth,
  }));
  return (
    <ChartContainer config={trendConfig} className="aspect-auto h-[260px] w-full">
      <AreaChart data={rows} margin={{ left: 4, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillNetWorth" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-netWorth)" stopOpacity={0.18} />
            <stop offset="100%" stopColor="var(--color-netWorth)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" strokeOpacity={0.6} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} fontSize={12} />
        <YAxis tickLine={false} axisLine={false} width={56} fontSize={11} tickFormatter={axisMoney} />
        <ChartTooltip cursor={{ strokeDasharray: "4 4" }} content={<ChartTooltipContent indicator="line" formatter={moneyFormatter(trendConfig)} />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area dataKey="netWorth" type="monotone" stroke="var(--color-netWorth)" strokeWidth={2} fill="url(#fillNetWorth)" activeDot={{ r: 4, strokeWidth: 2 }} />
        <Area dataKey="cash" type="monotone" stroke="var(--color-cash)" strokeWidth={2} fill="transparent" activeDot={{ r: 4, strokeWidth: 2 }} />
      </AreaChart>
    </ChartContainer>
  );
}

// ───────────── Category ranking (single-hue horizontal bars, plain HTML) ─────────────

export function CategoryBars({
  data,
  limit = 6,
}: {
  data: { id: string; name: string; total: string; share: number }[];
  limit?: number;
}) {
  const top = data.slice(0, limit);
  const rest = data.slice(limit);
  const restShare = rest.reduce((s, r) => s + r.share, 0);
  const max = Math.max(...top.map((t) => t.share), restShare, 1);
  const rows = rest.length
    ? [...top, { id: "other", name: `Other (${rest.length})`, total: "", share: Math.round(restShare * 10) / 10 }]
    : top;
  return (
    <ul className="flex flex-col gap-3.5">
      {rows.map((c) => (
        <li key={c.id} className="group" title={`${c.name}: ${c.total ? formatMoney(c.total) : ""} (${c.share}%)`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{c.name}</span>
            <span className="num shrink-0 text-muted-foreground">
              {c.total && <span className="font-medium text-foreground">{formatMoney(c.total, { decimals: 0 })}</span>}
              <span className="ml-2 text-xs">{c.share}%</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-[var(--chart-2)] transition-[width] duration-500 group-hover:brightness-110"
              style={{ width: `${(c.share / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
