import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { verifyEmail } from "@/server/services/auth";

export const metadata: Metadata = { title: "Verify email" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  const ok = typeof token === "string" && token.length >= 20 && token.length <= 200 ? await verifyEmail(token) : false;
  return (
    <div className="flex flex-col items-start gap-4">
      <span className={`grid size-11 place-items-center rounded-full ${ok ? "bg-positive/10 text-positive" : "bg-negative/10 text-negative"}`}>
        {ok ? <CheckCircle2 className="size-5" /> : <XCircle className="size-5" />}
      </span>
      <h1 className="text-2xl font-semibold tracking-tight">{ok ? "Email verified" : "Link invalid or expired"}</h1>
      <p className="text-sm text-muted-foreground">
        {ok
          ? "Your account is active. Sign in to start tracking your finances."
          : "This verification link has already been used or has expired. Sign in to request a new one."}
      </p>
      <Button asChild className="w-full">
        <Link href={ok ? "/login?reason=verified" : "/login"}>Go to sign in</Link>
      </Button>
    </div>
  );
}
