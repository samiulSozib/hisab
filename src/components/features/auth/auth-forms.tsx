"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { CheckCircle2, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { TextField } from "@/components/forms/fields";
import {
  forgotPasswordAction,
  loginAction,
  registerAction,
  resendVerificationAction,
  resetPasswordAction,
} from "@/server/actions/auth";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@/lib/validations/schemas";

function Submit({ pending, children }: { pending: boolean; children: React.ReactNode }) {
  return (
    <Button type="submit" className="h-10 w-full" disabled={pending}>
      {pending && <Loader2 className="animate-spin" />}
      {children}
    </Button>
  );
}

function Heading({ title, subtitle }: { title: string; subtitle: React.ReactNode }) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p>
    </div>
  );
}

export function LoginForm({ callbackUrl, notice }: { callbackUrl?: string; notice?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [unverified, setUnverified] = useState(false);
  const form = useForm({ resolver: zodResolver(loginSchema), defaultValues: { email: "", password: "" } });

  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const r = await loginAction(values, callbackUrl);
      if (r.ok) {
        router.replace(r.data.redirectTo);
        router.refresh();
      } else {
        setUnverified(Boolean(r.fieldErrors?._unverified));
        toast.error(r.error);
      }
    });
  });

  return (
    <>
      <Heading title="Welcome back" subtitle="Sign in to your Hisab account." />
      {notice && (
        <Alert className="mb-5">
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" placeholder="you@example.com" />
          <TextField control={form.control} name="password" label="Password" type="password" autoComplete="current-password" />
          <div className="-mt-2 flex justify-end">
            <Link href="/forgot-password" className="text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <Submit pending={pending}>Sign in</Submit>
          {unverified && (
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                const r = await resendVerificationAction({ email: form.getValues("email") });
                if (r.ok) toast.success("Verification email sent. Check your inbox.");
                else toast.error(r.error);
              }}
            >
              Resend verification email
            </Button>
          )}
        </FieldGroup>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        New to Hisab?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </>
  );
}

function SentPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <span className="grid size-11 place-items-center rounded-full bg-primary/10 text-primary">
        <MailCheck className="size-5" />
      </span>
      <Heading title={title} subtitle={children} />
      <Button asChild variant="outline" className="w-full">
        <Link href="/login">Back to sign in</Link>
      </Button>
    </div>
  );
}

export function RegisterForm() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", password: "", confirmPassword: "" },
  });
  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const r = await registerAction(values);
      if (r.ok && !r.data.verificationRequired) router.push("/login?reason=registered");
      else if (r.ok) setSentTo(values.email);
      else {
        for (const [k, m] of Object.entries(r.fieldErrors ?? {})) form.setError(k as "email", { message: m[0] });
        toast.error(r.error);
      }
    });
  });

  if (sentTo) {
    return (
      <SentPanel title="Check your email">
        We sent a verification link to <strong className="text-foreground">{sentTo}</strong>. Open it to activate your account, then sign in.
      </SentPanel>
    );
  }

  return (
    <>
      <Heading title="Create your account" subtitle="Start tracking your finances in minutes." />
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <TextField control={form.control} name="name" label="Full name" autoComplete="name" />
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
          <TextField
            control={form.control}
            name="password"
            label="Password"
            type="password"
            autoComplete="new-password"
            description="At least 8 characters with a letter and a number."
          />
          <TextField control={form.control} name="confirmPassword" label="Confirm password" type="password" autoComplete="new-password" />
          <Submit pending={pending}>Create account</Submit>
        </FieldGroup>
      </form>
      <p className="mt-6 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </>
  );
}

export function ForgotPasswordForm() {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const form = useForm({ resolver: zodResolver(forgotPasswordSchema), defaultValues: { email: "" } });
  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const r = await forgotPasswordAction(values);
      if (r.ok) setSent(true);
      else toast.error(r.error);
    });
  });
  if (sent) {
    return (
      <SentPanel title="Check your email">
        If an account exists for that address, we&apos;ve sent a password reset link. It expires in 1 hour.
      </SentPanel>
    );
  }
  return (
    <>
      <Heading title="Forgot your password?" subtitle="Enter your email and we'll send you a reset link." />
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <TextField control={form.control} name="email" label="Email" type="email" autoComplete="email" />
          <Submit pending={pending}>Send reset link</Submit>
        </FieldGroup>
      </form>
      <p className="mt-6 text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const form = useForm({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { token, password: "", confirmPassword: "" },
  });
  const onSubmit = form.handleSubmit((values) => {
    start(async () => {
      const r = await resetPasswordAction(values);
      if (r.ok) setDone(true);
      else toast.error(r.error);
    });
  });
  if (done) {
    return (
      <div className="flex flex-col items-start gap-4">
        <span className="grid size-11 place-items-center rounded-full bg-positive/10 text-positive">
          <CheckCircle2 className="size-5" />
        </span>
        <Heading title="Password updated" subtitle="You've been signed out everywhere. Sign in with your new password." />
        <Button asChild className="w-full">
          <Link href="/login">Sign in</Link>
        </Button>
      </div>
    );
  }
  return (
    <>
      <Heading title="Choose a new password" subtitle="Use at least 8 characters with a letter and a number." />
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <TextField control={form.control} name="password" label="New password" type="password" autoComplete="new-password" />
          <TextField control={form.control} name="confirmPassword" label="Confirm new password" type="password" autoComplete="new-password" />
          <Submit pending={pending}>Update password</Submit>
        </FieldGroup>
      </form>
    </>
  );
}
