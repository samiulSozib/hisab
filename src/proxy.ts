import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

/**
 * Optimistic route protection: unauthenticated visitors to app pages are redirected to /login.
 * This is NOT the security boundary — every page, server action and route handler re-verifies the
 * session against the database (see src/server/auth.ts).
 */
const { auth } = NextAuth(authConfig);

export default auth;

export const config = {
  // Skip API routes (they authenticate themselves), Next internals and static files.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};
