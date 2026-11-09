import "server-only";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserOrThrow, type CurrentUser } from "@/server/auth";
import { DomainError, UnauthorizedError } from "@/server/errors";
import type { ActionResult } from "@/lib/action-result";

export function fieldErrorsFrom(error: z.ZodError): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (out[key] ??= []).push(issue.message);
  }
  return out;
}

export function toActionError(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) {
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrorsFrom(error) };
  }
  if (error instanceof DomainError) return { ok: false, error: error.message, fieldErrors: error.fieldErrors };
  if (error instanceof UnauthorizedError) return { ok: false, error: "Your session has expired. Please sign in again." };
  const code = (error as { code?: string })?.code;
  if (code === "P2002") return { ok: false, error: "A record with this name already exists." };
  if (code === "P2025") return { ok: false, error: "Record not found." };
  console.error("[action] unexpected error", error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

/**
 * Standard pipeline for authenticated mutations:
 * authenticate → validate (Zod, server-side) → run service (DB transaction) → revalidate → result.
 */
export async function runAction<S extends z.ZodType, T>(
  schema: S,
  input: unknown,
  fn: (user: CurrentUser, data: z.output<S>) => Promise<T>,
  opts: { success?: string } = {},
): Promise<ActionResult<T>> {
  try {
    const user = await requireUserOrThrow();
    const parsed = schema.safeParse(input);
    if (!parsed.success) return toActionError(parsed.error);
    const data = await fn(user, parsed.data);
    revalidatePath("/", "layout");
    return { ok: true, data, message: opts.success };
  } catch (error) {
    return toActionError(error);
  }
}

export const idSchema = z.string().trim().min(1).max(64);
