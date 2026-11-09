"use client";

import { useTransition } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, LogOut, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { SelectField, TextField } from "@/components/forms/fields";
import { useActionSubmit } from "@/components/forms/use-action-form";
import { ConfirmAction } from "@/components/shared/confirm-action";
import { changePasswordSchema, profileSchema } from "@/lib/validations/schemas";
import { changePasswordAction, logoutAction, signOutEverywhereAction, updateProfileAction } from "@/server/actions/auth";

const ZONES = ["Asia/Dhaka", "Asia/Kolkata", "Asia/Dubai", "Asia/Riyadh", "Asia/Kuala_Lumpur", "Asia/Singapore", "Europe/London", "America/New_York", "Australia/Sydney", "UTC"];

export function ProfileForm({ name, timezone }: { name: string; timezone: string }) {
  const form = useForm({ resolver: zodResolver(profileSchema), defaultValues: { name, timezone } });
  const { onSubmit, pending } = useActionSubmit(form, updateProfileAction);
  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <TextField control={form.control} name="name" label="Full name" autoComplete="name" />
        <SelectField
          control={form.control}
          name="timezone"
          label="Time zone"
          description="Used to decide what “today” and “this month” mean."
          options={(ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES]).map((z) => ({ value: z, label: z.replace("_", " ") }))}
        />
        <Button type="submit" disabled={pending} className="self-start">
          {pending && <Loader2 className="animate-spin" />}
          Save profile
        </Button>
      </FieldGroup>
    </form>
  );
}

export function ChangePasswordForm() {
  const form = useForm({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });
  const { onSubmit, pending } = useActionSubmit(form, changePasswordAction);
  return (
    <form onSubmit={onSubmit} noValidate>
      <FieldGroup>
        <TextField control={form.control} name="currentPassword" label="Current password" type="password" autoComplete="current-password" />
        <TextField
          control={form.control}
          name="newPassword"
          label="New password"
          type="password"
          autoComplete="new-password"
          description="At least 8 characters with a letter and a number. You'll be signed out on all devices."
        />
        <TextField control={form.control} name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" />
        <Button type="submit" disabled={pending} className="self-start">
          {pending && <Loader2 className="animate-spin" />}
          Change password
        </Button>
      </FieldGroup>
    </form>
  );
}

export function SessionActions() {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={pending} onClick={() => start(() => logoutAction())}>
        <LogOut /> Sign out
      </Button>
      <ConfirmAction
        title="Sign out on all devices?"
        description="Every active session, including this one, will be ended immediately."
        confirmLabel="Sign out everywhere"
        action={async () => {
          try {
            await signOutEverywhereAction();
            return { ok: true as const, data: undefined };
          } catch (e) {
            // signOut throws a redirect, which is expected.
            if ((e as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw e;
            toast.error("Could not sign out everywhere");
            return { ok: false as const, error: "Could not sign out everywhere" };
          }
        }}
        trigger={
          <Button variant="destructive">
            <MonitorSmartphone /> Sign out everywhere
          </Button>
        }
      />
    </div>
  );
}
