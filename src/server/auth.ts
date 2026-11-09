import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { UnauthorizedError } from "@/server/errors";
import { emailVerificationEnabled } from "@/lib/features";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  currency: string;
  timezone: string;
};

/**
 * Data Access Layer entry point. Validates the JWT session AND re-checks the user in the database:
 * the account must exist, be verified, and the session version must match (password changes and
 * "sign out everywhere" bump the version, instantly invalidating old sessions).
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  await connection(); // always request-time: never prerender session-dependent output
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, currency: true, timezone: true, sessionVersion: true, emailVerified: true },
  });
  if (!user || user.sessionVersion !== session.sessionVersion) return null;
  if (!user.emailVerified && emailVerificationEnabled()) return null;
  return { id: user.id, name: user.name, email: user.email, currency: user.currency, timezone: user.timezone };
});

/** For pages: redirect to login if there is no valid session. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login?reason=session");
  return user;
}

/** For server actions and route handlers: throw instead of redirecting. */
export async function requireUserOrThrow(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  return user;
}
