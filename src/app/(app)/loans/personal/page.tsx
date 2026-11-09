import type { Metadata } from "next";
import { LoanListPage } from "@/components/features/loans/loan-list-page";

export const metadata: Metadata = { title: "Personal loans" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { closed } = await searchParams;
  return <LoanListPage kind="PERSONAL" showClosed={closed === "1"} />;
}
