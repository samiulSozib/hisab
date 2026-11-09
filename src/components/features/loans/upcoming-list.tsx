import Link from "next/link";
import { AlertCircle, CalendarCheck2 } from "lucide-react";
import { Money } from "@/components/shared/money";
import { formatDate } from "@/lib/dates";
import { LOAN_KIND_LABELS } from "@/lib/constants";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  loanId: string;
  loanTitle: string;
  loanKind: "PERSONAL" | "EMI" | "BANK";
  number: number;
  dueDate: string;
  amount: string;
  overdue: boolean;
  daysLeft: number;
  status: string;
};

function when(i: Item) {
  if (i.overdue) return `${Math.abs(i.daysLeft)} day${Math.abs(i.daysLeft) === 1 ? "" : "s"} overdue`;
  if (i.daysLeft === 0) return "Due today";
  if (i.daysLeft === 1) return "Due tomorrow";
  return `In ${i.daysLeft} days`;
}

export function UpcomingList({ items }: { items: Item[] }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
        <CalendarCheck2 className="size-6" />
        No installments due in the next 45 days.
      </div>
    );
  }
  return (
    <ul className="flex flex-col gap-1">
      {items.map((i) => (
        <li key={i.id}>
          <Link href={`/loans/${i.loanId}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60">
            <span
              className={cn(
                "flex w-11 shrink-0 flex-col items-center rounded-lg border py-1 leading-none",
                i.overdue ? "border-negative/30 bg-negative/5 text-negative" : "bg-muted/40",
              )}
            >
              <span className="text-[10px] uppercase">{formatDate(i.dueDate).split(" ")[1]}</span>
              <span className="num text-base font-semibold">{formatDate(i.dueDate).split(" ")[0]}</span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{i.loanTitle}</span>
              <span className={cn("flex items-center gap-1 text-xs", i.overdue ? "text-negative" : "text-muted-foreground")}>
                {i.overdue && <AlertCircle className="size-3" />}
                {LOAN_KIND_LABELS[i.loanKind]} #{i.number} · {when(i)}
                {i.status === "PARTIAL" && " · partly paid"}
              </span>
            </span>
            <Money value={i.amount} className="text-sm font-semibold" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
