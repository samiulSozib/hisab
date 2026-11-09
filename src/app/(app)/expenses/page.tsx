import type { Metadata } from "next";
import { CashflowPage } from "@/components/features/cashflow/cashflow-page";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CashflowPage type="EXPENSE" searchParams={searchParams} />;
}
