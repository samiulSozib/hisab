import { d, formatMoney, type MoneyLike } from "@/lib/money";
import { cn } from "@/lib/utils";

type Props = {
  value: MoneyLike;
  className?: string;
  /** Colour by sign: positive = green, negative = red. */
  tone?: "auto" | "positive" | "negative" | "muted" | "none";
  signed?: boolean;
  compact?: boolean;
  decimals?: number;
};

/** Monetary figure in BDT with tabular numerals. */
export function Money({ value, className, tone = "none", signed, compact, decimals }: Props) {
  const v = d(value);
  const toneClass =
    tone === "positive"
      ? "text-positive"
      : tone === "negative"
        ? "text-negative"
        : tone === "muted"
          ? "text-muted-foreground"
          : tone === "auto"
            ? v.isNegative()
              ? "text-negative"
              : v.greaterThan(0)
                ? "text-positive"
                : ""
            : "";
  return <span className={cn("num whitespace-nowrap", toneClass, className)}>{formatMoney(v, { signed, compact, decimals })}</span>;
}

/** Amount with direction sign for ledger rows. */
export function FlowAmount({ amount, direction, className }: { amount: string; direction: "INFLOW" | "OUTFLOW" | "TRANSFER"; className?: string }) {
  if (direction === "TRANSFER") return <Money value={amount} className={cn("text-muted-foreground", className)} />;
  return (
    <Money
      value={direction === "OUTFLOW" ? d(amount).negated() : amount}
      signed
      tone={direction === "OUTFLOW" ? "none" : "positive"}
      className={cn("font-medium", className)}
    />
  );
}
