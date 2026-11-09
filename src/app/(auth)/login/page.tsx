import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/features/auth/auth-forms";
import { getCurrentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  session: "Your session has ended. Please sign in again.",
  "password-changed": "Password changed. Please sign in with your new password.",
  "signed-out-everywhere": "You've been signed out on all devices.",
  verified: "Email verified — you can sign in now.",
  registered: "Account created — sign in to get started.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect("/dashboard");
  const reason = typeof sp.reason === "string" ? sp.reason : undefined;
  const callbackUrl = typeof sp.callbackUrl === "string" ? sp.callbackUrl : undefined;
  // Auth.js passes absolute callback URLs — keep only the path.
  let cb: string | undefined;
  try {
    cb = callbackUrl ? new URL(callbackUrl, "http://x").pathname : undefined;
  } catch {
    cb = undefined;
  }
  return <LoginForm callbackUrl={cb} notice={reason ? NOTICES[reason] : undefined} />;
}
