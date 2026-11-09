import { ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { Brand } from "@/components/brand";

// Every page here reads the user's session, so it can't be part of a shared static shell.
// Opt out of instant-navigation validation (pages still stream behind loading.tsx).
export const instant = false;

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="surface-hero relative hidden overflow-hidden p-10 text-white lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5 [&_span]:text-white [&_.text-muted-foreground]:text-white/70">
          <Brand />
        </div>
        <div className="mt-auto max-w-md">
          <h1 className="text-3xl font-semibold leading-tight tracking-tight">Every taka, accounted for.</h1>
          <p className="mt-3 text-white/75">
            Salary, bKash, bank accounts, EMIs and personal loans — one clear picture of what you own and what you owe.
          </p>
          <ul className="mt-8 grid gap-4 text-sm text-white/85">
            <li className="flex items-center gap-3">
              <Wallet className="size-4" aria-hidden /> Accurate balances across every account
            </li>
            <li className="flex items-center gap-3">
              <TrendingUp className="size-4" aria-hidden /> Amortized EMI and loan schedules
            </li>
            <li className="flex items-center gap-3">
              <ShieldCheck className="size-4" aria-hidden /> Private by design — only you see your data
            </li>
          </ul>
        </div>
        <div className="pointer-events-none absolute -right-24 -top-24 size-80 rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -right-10 -top-10 size-52 rounded-full border border-white/10" />
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
