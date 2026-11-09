import type { Metadata } from "next";
import { LoanListPage } from "@/components/features/loans/loan-list-page";

export const metadata: Metadata = { title: "Bank loans" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { closed } = await searchParams;
  return <LoanListPage kind="BANK" showClosed={closed === "1"} />;
}
