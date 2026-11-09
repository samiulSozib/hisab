import "server-only";
import { Resend } from "resend";

/**
 * Transactional email via Resend (https://resend.com).
 * Required in production: RESEND_API_KEY and EMAIL_FROM (a sender on a domain verified in Resend).
 * In development without RESEND_API_KEY, emails are printed to the server console instead.
 */
type Mail = { to: string; subject: string; html: string; text: string };

let client: Resend | null = null;

export async function sendEmail(mail: Mail): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not configured — cannot send email in production.");
    }
    console.info(`\n📧 [dev email] To: ${mail.to}\nSubject: ${mail.subject}\n${mail.text}\n`);
    return;
  }
  client ??= new Resend(key);
  const { error } = await client.emails.send({
    from: process.env.EMAIL_FROM ?? "Hisab <onboarding@resend.dev>",
    to: mail.to,
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  });
  if (error) throw new Error(`Email delivery failed: ${error.message}`);
}

export function appUrl(path: string): string {
  const base = process.env.APP_URL ?? process.env.AUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return new URL(path, base).toString();
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, body: string, cta: { label: string; url: string }) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6f8;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#0f172a">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
  <table width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:32px;border:1px solid #e2e8f0">
  <tr><td><div style="font-size:20px;font-weight:700;color:#0f766e">৳ Hisab</div>
  <h1 style="font-size:20px;margin:24px 0 8px">${escapeHtml(title)}</h1>
  <p style="font-size:14px;line-height:1.6;color:#475569">${body}</p>
  <p style="margin:28px 0"><a href="${cta.url}" style="background:#0f766e;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600;font-size:14px">${escapeHtml(cta.label)}</a></p>
  <p style="font-size:12px;color:#94a3b8;word-break:break-all">Or paste this link into your browser:<br>${cta.url}</p>
  </td></tr></table></td></tr></table></body></html>`;
}

export async function sendVerificationEmail(to: string, name: string, token: string) {
  const url = appUrl(`/verify-email?token=${encodeURIComponent(token)}`);
  await sendEmail({
    to,
    subject: "Verify your email for Hisab",
    html: layout(`Welcome, ${name}`, "Confirm your email address to activate your Hisab account. This link expires in 24 hours.", {
      label: "Verify email",
      url,
    }),
    text: `Welcome to Hisab, ${name}.\n\nVerify your email (link valid 24 hours):\n${url}`,
  });
}

export async function sendPasswordResetEmail(to: string, token: string) {
  const url = appUrl(`/reset-password?token=${encodeURIComponent(token)}`);
  await sendEmail({
    to,
    subject: "Reset your Hisab password",
    html: layout(
      "Reset your password",
      "We received a request to reset your password. This link expires in 1 hour. If you didn't request it, you can ignore this email — your password won't change.",
      { label: "Reset password", url },
    ),
    text: `Reset your Hisab password (link valid 1 hour):\n${url}\n\nIf you didn't request this, ignore this email.`,
  });
}
