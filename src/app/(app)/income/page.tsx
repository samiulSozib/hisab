import type { Metadata } from "next";
import { CashflowPage } from "@/components/features/cashflow/cashflow-page";

export const metadata: Metadata = { title: "Income" };

export default function IncomePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  return <CashflowPage type="INCOME" searchParams={searchParams} />;
}
