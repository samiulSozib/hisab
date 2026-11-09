import { getCurrentUser } from "@/server/auth";
import { transactionFilterSchema } from "@/lib/validations/schemas";
import { exportTransactions } from "@/server/services/transactions";
import { TRANSACTION_TYPE_LABELS, type TransactionTypeValue } from "@/lib/constants";
import { todayString } from "@/lib/dates";

/** Quote a text cell and neutralise CSV/spreadsheet formula injection. */
function cell(value: string | null | undefined): string {
  let v = value ?? "";
  if (/^[=+\-@\t\r]/.test(v)) v = `'${v}`;
  return `"${v.replace(/"/g, '""')}"`;
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = transactionFilterSchema.parse(params);
  const rows = await exportTransactions(user.id, filters);

  const header = ["Date", "Type", "Direction", "Amount (BDT)", "Account", "To account", "Category", "Counterparty", "Reference", "Description", "Loan"];
  const lines = [header.map(cell).join(",")];
  for (const r of rows) {
    // Amount is a validated decimal string — written raw so spreadsheets treat it as a number.
    const amount = r.direction === "OUTFLOW" ? `-${r.amount}` : r.amount;
    const text = [r.account.name, r.toAccount?.name, r.category?.name, r.counterparty, r.reference, r.description, r.loan?.title];
    const typeLabel = TRANSACTION_TYPE_LABELS[r.type as TransactionTypeValue] ?? r.type;
    lines.push([cell(r.date), cell(typeLabel), cell(r.direction), amount, ...text.map(cell)].join(","));
  }

  const scope = filters.type ? filters.type.toLowerCase() : "transactions";
  // UTF-8 BOM so Excel renders ৳ and Bangla text correctly.
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hisab-${scope}-${todayString(user.timezone)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
