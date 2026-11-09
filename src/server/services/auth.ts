import "server-only";
import { createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { db, type DbTx } from "@/lib/db";
import { sendPasswordResetEmail, sendVerificationEmail } from "@/lib/email";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "@/lib/constants";
import { todayString } from "@/lib/dates";
import { DomainError } from "@/server/errors";
import { emailVerificationEnabled } from "@/lib/features";

const BCRYPT_COST = 12;
const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;
const VERIFY_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;
// Used to equalise timing when the email does not exist.
const DUMMY_HASH = "$2b$12$5cb.uACs/Nv56tUzCSjevekCSLWVOJoBdJrVgIi6FwXmTAXl0DfOi";

type TokenType = "EMAIL_VERIFICATION" | "PASSWORD_RESET";

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_COST);
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

async function issueToken(tx: DbTx, userId: string, type: TokenType, ttlMs: number): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  // Invalidate any outstanding token of the same type.
  await tx.authToken.updateMany({ where: { userId, type, usedAt: null }, data: { usedAt: new Date() } });
  await tx.authToken.create({
    data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/** Atomically mark a token as used and return its user id, or null if invalid / expired / used. */
async function consumeToken(tx: DbTx, token: string, type: TokenType): Promise<string | null> {
  const record = await tx.authToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) return null;
  const { count } = await tx.authToken.updateMany({
    where: { id: record.id, usedAt: null },
    data: { usedAt: new Date() },
  });
  return count === 1 ? record.userId : null;
}

// ───────────── Registration & verification ─────────────

/** Returns whether the new user must verify their email before signing in. */
export async function registerUser(input: { name: string; email: string; password: string }): Promise<{ verificationRequired: boolean }> {
  const verify = emailVerificationEnabled();
  const existing = await db.user.findUnique({ where: { email: input.email }, select: { id: true, name: true, emailVerified: true } });
  if (existing) {
    if (!verify) throw new DomainError("An account with this email already exists. Sign in instead.", { email: ["Already registered"] });
    // Do not reveal whether the address is registered. Re-send verification if still pending.
    if (!existing.emailVerified) {
      const token = await db.$transaction((tx) => issueToken(tx, existing.id, "EMAIL_VERIFICATION", VERIFY_TTL_MS));
      await sendVerificationEmail(input.email, existing.name, token);
    }
    return { verificationRequired: true };
  }

  const passwordHash = await hashPassword(input.password);
  const token = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { name: input.name, email: input.email, passwordHash, emailVerified: verify ? null : new Date() },
      select: { id: true },
    });
    await tx.category.createMany({
      data: [
        ...DEFAULT_INCOME_CATEGORIES.map((c) => ({ userId: user.id, kind: "INCOME" as const, name: c.name, color: c.color })),
        ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ userId: user.id, kind: "EXPENSE" as const, name: c.name, color: c.color })),
      ],
    });
    await tx.account.create({
      data: {
        userId: user.id,
        name: "Cash in hand",
        type: "CASH",
        color: "#16a34a",
        openingBalance: "0",
        currentBalance: "0",
        openingDate: new Date(`${todayString()}T00:00:00.000Z`),
      },
    });
    return verify ? issueToken(tx, user.id, "EMAIL_VERIFICATION", VERIFY_TTL_MS) : null;
  });
  if (token) await sendVerificationEmail(input.email, input.name, token);
  return { verificationRequired: Boolean(token) };
}

export async function verifyEmail(token: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const userId = await consumeToken(tx, token, "EMAIL_VERIFICATION");
    if (!userId) return false;
    await tx.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
    return true;
  });
}

export async function resendVerification(email: string) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true, name: true, emailVerified: true } });
  if (!user || user.emailVerified) return;
  const token = await db.$transaction((tx) => issueToken(tx, user.id, "EMAIL_VERIFICATION", VERIFY_TTL_MS));
  await sendVerificationEmail(email, user.name, token);
}

// ───────────── Login ─────────────

export type CredentialCheck =
  | { ok: true; user: { id: string; name: string; email: string; sessionVersion: number } }
  | { ok: false; reason: "invalid" | "unverified" | "locked" };

export async function verifyCredentials(email: string, password: string): Promise<CredentialCheck> {
  const user = await db.user.findUnique({ where: { email }, omit: { passwordHash: false } });
  if (!user) {
    await bcrypt.compare(password, DUMMY_HASH);
    return { ok: false, reason: "invalid" };
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) return { ok: false, reason: "locked" };

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    const attempts = user.failedLoginAttempts + 1;
    await db.user.update({
      where: { id: user.id },
      data:
        attempts >= MAX_FAILED_LOGINS
          ? { failedLoginAttempts: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
          : { failedLoginAttempts: attempts },
    });
    return { ok: false, reason: attempts >= MAX_FAILED_LOGINS ? "locked" : "invalid" };
  }
  if (!user.emailVerified) {
    if (emailVerificationEnabled()) return { ok: false, reason: "unverified" };
    // Verification is switched off: activate accounts created while it was on.
    await db.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    await db.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0, lockedUntil: null } });
  }
  return { ok: true, user: { id: user.id, name: user.name, email: user.email, sessionVersion: user.sessionVersion } };
}

// ───────────── Password reset & change ─────────────

export async function requestPasswordReset(email: string) {
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) return; // no enumeration
  const token = await db.$transaction((tx) => issueToken(tx, user.id, "PASSWORD_RESET", RESET_TTL_MS));
  await sendPasswordResetEmail(email, token);
}

export async function resetPassword(token: string, newPassword: string): Promise<boolean> {
  const passwordHash = await hashPassword(newPassword);
  return db.$transaction(async (tx) => {
    const userId = await consumeToken(tx, token, "PASSWORD_RESET");
    if (!userId) return false;
    const user = await tx.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        sessionVersion: { increment: 1 }, // sign out all existing sessions
        failedLoginAttempts: 0,
        lockedUntil: null,
        emailVerified: new Date(), // proving inbox access also verifies the address
      },
      select: { id: true },
    });
    await tx.auditLog.create({
      data: { userId: user.id, action: "UPDATE", entityType: "User", entityId: user.id, summary: "Password reset via email" },
    });
    return true;
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  const user = await db.user.findUnique({ where: { id: userId }, omit: { passwordHash: false } });
  if (!user) throw new DomainError("Account not found");
  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) throw new DomainError("Current password is incorrect", { currentPassword: ["Current password is incorrect"] });
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { passwordHash, sessionVersion: { increment: 1 } } }),
    db.auditLog.create({ data: { userId, action: "UPDATE", entityType: "User", entityId: userId, summary: "Password changed" } }),
  ]);
}

export async function signOutEverywhere(userId: string) {
  await db.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
}
