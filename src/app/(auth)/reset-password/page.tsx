import type { Metadata } from "next";
import Link from "next/link";
import { ResetPasswordForm } from "@/components/features/auth/auth-forms";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Reset password" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { token } = await searchParams;
  if (typeof token !== "string" || token.length < 20) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Invalid reset link</h1>
        <p className="text-sm text-muted-foreground">This link is incomplete or has expired. Request a new one.</p>
        <Button asChild>
          <Link href="/forgot-password">Request a new link</Link>
        </Button>
      </div>
    );
  }
  return <ResetPasswordForm token={token} />;
}
