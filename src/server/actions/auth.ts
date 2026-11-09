"use server";

import { AuthError, CredentialsSignin } from "next-auth";
import { signIn, signOut } from "@/auth";
import type { ActionResult } from "@/lib/action-result";
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  profileSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validations/schemas";
import { db } from "@/lib/db";
import { requireUserOrThrow } from "@/server/auth";
import * as authService from "@/server/services/auth";
import { revalidatePath } from "next/cache";
import { toActionError } from "./run";

function safeCallback(url: unknown): string {
  return typeof url === "string" && url.startsWith("/") && !url.startsWith("//") ? url : "/dashboard";
}

export async function loginAction(input: unknown, callbackUrl?: string): Promise<ActionResult<{ redirectTo: string }>> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  try {
    await signIn("credentials", { ...parsed.data, redirect: false });
    return { ok: true, data: { redirectTo: safeCallback(callbackUrl) } };
  } catch (error) {
    if (error instanceof CredentialsSignin) {
      if (error.code === "email_not_verified") {
        return { ok: false, error: "Please verify your email first. We can send you a new link." , fieldErrors: { _unverified: ["1"] } };
      }
      if (error.code === "account_locked") {
        return { ok: false, error: "Too many failed attempts. Your account is locked for 15 minutes." };
      }
      return { ok: false, error: "Incorrect email or password." };
    }
    if (error instanceof AuthError) return { ok: false, error: "Sign-in failed. Please try again." };
    return toActionError(error);
  }
}

export async function registerAction(input: unknown): Promise<ActionResult<{ verificationRequired: boolean }>> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  try {
    return { ok: true, data: await authService.registerUser(parsed.data) };
  } catch (error) {
    return toActionError(error);
  }
}

export async function resendVerificationAction(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  try {
    await authService.resendVerification(parsed.data.email);
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function forgotPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  try {
    await authService.requestPasswordReset(parsed.data.email);
    return { ok: true, data: undefined }; // identical response whether or not the email exists
  } catch (error) {
    return toActionError(error);
  }
}

export async function resetPasswordAction(input: unknown): Promise<ActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return toActionError(parsed.error);
  try {
    const ok = await authService.resetPassword(parsed.data.token, parsed.data.password);
    if (!ok) return { ok: false, error: "This reset link is invalid or has expired. Request a new one." };
    return { ok: true, data: undefined };
  } catch (error) {
    return toActionError(error);
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/login" });
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUserOrThrow();
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return toActionError(parsed.error);
    try {
      new Intl.DateTimeFormat("en", { timeZone: parsed.data.timezone });
    } catch {
      return { ok: false, error: "Unknown time zone", fieldErrors: { timezone: ["Unknown time zone"] } };
    }
    await db.$transaction([
      db.user.update({ where: { id: user.id }, data: { name: parsed.data.name, timezone: parsed.data.timezone } }),
      db.auditLog.create({ data: { userId: user.id, action: "UPDATE", entityType: "User", entityId: user.id, summary: "Updated profile" } }),
    ]);
    revalidatePath("/", "layout");
    return { ok: true, data: undefined, message: "Profile updated" };
  } catch (error) {
    return toActionError(error);
  }
}

export async function changePasswordAction(input: unknown): Promise<ActionResult> {
  try {
    const user = await requireUserOrThrow();
    const parsed = changePasswordSchema.safeParse(input);
    if (!parsed.success) return toActionError(parsed.error);
    await authService.changePassword(user.id, parsed.data.currentPassword, parsed.data.newPassword);
  } catch (error) {
    return toActionError(error);
  }
  // All sessions (including this one) are now invalid — sign out cleanly.
  await signOut({ redirectTo: "/login?reason=password-changed" });
  return { ok: true, data: undefined };
}

export async function signOutEverywhereAction() {
  const user = await requireUserOrThrow();
  await authService.signOutEverywhere(user.id);
  await signOut({ redirectTo: "/login?reason=signed-out-everywhere" });
}
