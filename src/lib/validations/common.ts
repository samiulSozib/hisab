import { z } from "zod";
import { isDateOnlyString } from "@/lib/dates";
import { d, parseMoneyInput } from "@/lib/money";

const MAX_AMOUNT = "1000000000000000"; // fits NUMERIC(18,2)

type MoneyOpts = { allowZero?: boolean; allowNegative?: boolean };

function moneyCheck(v: string, opts: MoneyOpts): string | null {
  const parsed = parseMoneyInput(v);
  if (parsed === null) return "Enter a valid amount (up to 2 decimals)";
  const n = d(parsed);
  if (n.abs().greaterThanOrEqualTo(MAX_AMOUNT)) return "Amount is too large";
  if (!opts.allowNegative && n.isNegative()) return "Amount cannot be negative";
  if (!opts.allowZero && n.isZero()) return "Amount must be greater than zero";
  return null;
}

/** Required monetary amount as a string ("1,250.50" allowed). Normalised to "1250.50". */
export const money = (opts: MoneyOpts = {}) =>
  z
    .string()
    .trim()
    .min(1, "Amount is required")
    .superRefine((v, ctx) => {
      const err = moneyCheck(v, opts);
      if (err) ctx.addIssue({ code: "custom", message: err });
    })
    .transform((v) => parseMoneyInput(v) ?? v);

/** Optional monetary amount: "" / undefined → undefined. */
export const optionalMoney = (opts: MoneyOpts = { allowZero: true }) =>
  z
    .string()
    .trim()
    .optional()
    .superRefine((v, ctx) => {
      if (!v) return;
      const err = moneyCheck(v, opts);
      if (err) ctx.addIssue({ code: "custom", message: err });
    })
    .transform((v) => (v ? (parseMoneyInput(v) ?? v) : undefined));

export const rate = z
  .string()
  .trim()
  .optional()
  .superRefine((v, ctx) => {
    if (!v) return;
    if (!/^\d+(\.\d{1,4})?$/.test(v)) ctx.addIssue({ code: "custom", message: "Enter a rate like 9.5" });
    else if (d(v).greaterThan(100)) ctx.addIssue({ code: "custom", message: "Rate cannot exceed 100%" });
  })
  .transform((v) => (v ? v : "0"));

export const dateOnly = z.string().trim().refine(isDateOnlyString, "Enter a valid date");
export const optionalDateOnly = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || isDateOnlyString(v), "Enter a valid date")
  .transform((v) => (v ? v : undefined));

export const id = z.string().trim().min(1, "Required").max(64);
export const optionalId = z
  .string()
  .trim()
  .max(64)
  .optional()
  .transform((v) => (v && v !== "none" ? v : undefined));

export const text = (max: number, label = "This field") =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Must be at most ${max} characters`)
    .optional()
    .transform((v) => (v ? v : undefined));

export const positiveInt = (label: string, maxValue = 1200) =>
  z
    .string()
    .trim()
    .regex(/^\d+$/, `${label} must be a whole number`)
    .refine((v) => Number(v) >= 1 && Number(v) <= maxValue, `${label} must be between 1 and ${maxValue}`)
    .transform(Number);

export const optionalPositiveInt = (label: string, maxValue = 1200) =>
  z
    .string()
    .trim()
    .optional()
    .refine((v) => !v || (/^\d+$/.test(v) && Number(v) >= 1 && Number(v) <= maxValue), `${label} must be between 1 and ${maxValue}`)
    .transform((v) => (v ? Number(v) : undefined));
