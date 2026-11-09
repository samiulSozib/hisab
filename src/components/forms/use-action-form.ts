"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";
import type { ActionResult } from "@/lib/action-result";

/**
 * Submit a react-hook-form through a server action: shows loading state, maps server-side
 * validation errors back onto fields, and toasts success / failure.
 */
export function useActionSubmit<TIn extends FieldValues, TOut extends FieldValues, R>(
  form: UseFormReturn<TIn, unknown, TOut>,
  action: (values: TIn) => Promise<ActionResult<R>>,
  opts: { onSuccess?: (data: R) => void; successMessage?: string | false } = {},
) {
  const [pending, startTransition] = useTransition();

  const onSubmit = form.handleSubmit(() => {
    // Send the RAW input values — the server re-validates and normalises them with the same schema.
    const raw = form.getValues();
    startTransition(async () => {
      const result = await action(raw);
      if (!result.ok) {
        if (result.fieldErrors) {
          for (const [key, messages] of Object.entries(result.fieldErrors)) {
            if (key.startsWith("_")) continue;
            form.setError(key.replace(/^data\./, "") as FieldPath<TIn>, { type: "server", message: messages[0] });
          }
        }
        toast.error(result.error);
        return;
      }
      if (opts.successMessage !== false) toast.success(opts.successMessage ?? result.message ?? "Saved");
      opts.onSuccess?.(result.data);
    });
  });

  return { onSubmit, pending };
}
