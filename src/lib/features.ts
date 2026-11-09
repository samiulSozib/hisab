/**
 * Feature flags (server-side).
 *
 * EMAIL_VERIFICATION="on" requires new users to confirm their email before signing in
 * (needs RESEND_API_KEY + EMAIL_FROM in production). Default: off — accounts are active immediately.
 */
export function emailVerificationEnabled(): boolean {
  return process.env.EMAIL_VERIFICATION === "on";
}
