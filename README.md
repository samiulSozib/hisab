# Hisab · হিসাব — Personal Finance Manager

A secure, multi-user personal finance app for Bangladesh: salary and other income, cash, bank and mobile-wallet (bKash / Nagad / Rocket) balances, everyday expenses, personal loans, EMI purchases and bank loans. It calculates available balance, total assets, outstanding debt and net worth exactly, in Bangladeshi Taka (৳, lakh/crore grouping).

**Stack:** Next.js 16 (App Router, Cache Components) · TypeScript (strict) · Tailwind CSS 4 · shadcn/ui · Neon PostgreSQL · Prisma 7 · Auth.js v5 · Recharts · Zod 4 · React Hook Form · Lucide · Resend · Vitest · Vercel

---

## Contents

1. [Quick start (local)](#1-quick-start-local)
2. [Architecture](#2-architecture)
3. [Database schema](#3-database-schema)
4. [Financial rules](#4-financial-rules)
5. [Loan calculations](#5-loan-calculations)
6. [Security](#6-security)
7. [Testing](#7-testing)
8. [Deploying to Vercel + Neon](#8-deploying-to-vercel--neon)
9. [Email configuration](#9-email-configuration)
10. [Limitations & unsupported features](#10-limitations--unsupported-features)

---

## 1. Quick start (local)

Prerequisites: **Node.js ≥ 22** and a PostgreSQL database (a free Neon project, Docker Postgres, or `npx prisma dev`).

```bash
npm install                      # also runs `prisma generate`
cp .env.example .env             # then fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET
npx auth secret                  # optional: writes AUTH_SECRET for you

npm run db:deploy                # apply migrations (prisma migrate deploy)
npm run db:seed                  # optional demo data (dev only)
npm run dev                      # http://localhost:3000
```

**Demo account (after seeding):** `demo@hisab.app` / `Demo@12345`

**No database yet?** `npx prisma dev -d` starts a local Postgres and prints a `postgres://…` URL. Use it for both `DATABASE_URL` and `DIRECT_URL`.

In development, if `RESEND_API_KEY` is empty, verification and password-reset links are **printed to the terminal** running `npm run dev`.

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server / production build / production server |
| `npm run typecheck` · `npm run lint` | TypeScript strict check · ESLint |
| `npm test` | Unit tests (finance engine; no DB needed) |
| `npm run test:integration` | Integration tests against `DATABASE_URL`. **Use a dev or test database, never production.** |
| `npm run db:migrate` | Create a new migration while developing (`prisma migrate dev`) |
| `npm run db:deploy` | Apply migrations (CI / production) |
| `npm run db:seed` · `npm run db:studio` | Demo data · Prisma Studio |

---

## 2. Architecture

```
src/
├─ app/
│  ├─ (auth)/            login · register · forgot-password · reset-password · verify-email
│  ├─ (app)/             dashboard · accounts · income · expenses · transactions[/id]
│  │                     loans · loans/{personal,emi,bank,new,[id]} · reports · settings · profile
│  └─ api/               auth/[...nextauth] · attachments · attachments/[id] · export/transactions · cron/recurring
├─ components/
│  ├─ ui/                shadcn/ui primitives
│  ├─ layout/            collapsible sidebar, header, mobile bottom nav
│  ├─ forms/             RHF field components + server-action submit hook
│  ├─ charts/            Recharts wrappers (income vs expenses, balance trend, category bars)
│  └─ features/          accounts · cashflow · loans · settings · auth
├─ lib/
│  ├─ money.ts           decimal.js money helpers + BDT formatting (isomorphic)
│  ├─ dates.ts           date-only (UTC) helpers, schedules, reporting periods
│  ├─ finance/           ★ pure financial engine: loan-math.ts, ledger.ts (unit tested)
│  ├─ validations/       Zod schemas shared by client forms and server actions
│  ├─ db.ts              Prisma client (Neon adapter in prod, pg locally)
│  └─ email.ts           Resend integration + templates
├─ server/
│  ├─ auth.ts            Data Access Layer: getCurrentUser / requireUser
│  ├─ services/          ★ business logic + DB transactions (ownership enforced here)
│  └─ actions/           "use server" actions: auth → Zod → service → revalidate
├─ auth.ts / auth.config.ts   Auth.js (Credentials + JWT)
└─ proxy.ts              optimistic route protection (Next 16's replacement for middleware)
prisma/  schema.prisma · migrations/ · seed.ts
tests/   unit tests · integration/ (real DB)
```

**Layers**

- **UI** (server and client components) never touches the database. Server components call **services**. Client components call **server actions**.
- **Server actions** run the same pipeline every time: authenticate (DAL) → validate with Zod on the server → call a service → `revalidatePath`.
- **Services** hold the business rules. Every mutation runs in **one `db.$transaction`**, so the ledger row, account balances, loan totals, installment state and audit entry commit or roll back together.
- **The finance engine** (`lib/finance`) is pure and isomorphic. The EMI form's live schedule preview runs the exact code the server uses to persist the schedule.

**Rendering:** Cache Components is enabled. Personal financial data is never cached server-side. Each page renders request-time data behind `loading.tsx` / Suspense boundaries, so routes are Partial Prerender: a static shell plus streamed user data.

---

## 3. Database schema

All IDs are CUIDs. Every user-owned table has `userId` (indexed, cascade on user delete). Money columns are `NUMERIC(18,2)`, rates are `NUMERIC(9,4)` (annual %), and financial dates are `DATE`.

| Model | Purpose |
|---|---|
| **User** | Credentials (bcrypt hash), timezone, `sessionVersion` (for revoking sessions), login lockout counters |
| **AuthToken** | Single-use email-verification and password-reset tokens. Only a SHA-256 hash is stored. |
| **Account** | Cash, bank, bKash, Nagad, Rocket, savings, credit card, other. Stores `openingBalance` and a denormalised `currentBalance`. |
| **Category** | User-defined income or expense categories (archived rather than deleted once used) |
| **Transaction** | **The ledger.** `type` (business meaning), `direction` (INFLOW / OUTFLOW / TRANSFER), positive `amount`, `date`, account, optional `toAccount`, category, loan, recurring rule |
| **Loan** | One table for PERSONAL / EMI / BANK loans with `direction` (BORROWED / LENT), terms, EMI purchase fields, bank fields, and running totals (`principalRepaid`, `interestPaid`, `feesPaid`, `outstandingPrincipal`) |
| **LoanInstallment** | Generated schedule: due date, scheduled amount / principal / interest, opening and closing balance, amounts paid, status (PENDING · PARTIAL · PAID · MISSED · WAIVED) |
| **LoanPayment** | One repayment or collection, linked 1:1 to its ledger `Transaction`, with its principal / interest / fee split |
| **RecurringTransaction** | Recurring income or expense rules (salary, rent…) with `nextRunDate` |
| **Attachment** | Receipts and documents (bytes in Postgres, at most 4 MB) |
| **AuditLog** | Who changed what: action, entity, summary, JSON diff |

Indexes cover `userId`, `(userId, date)`, `(userId, type, date)`, `(userId, categoryId, date)`, `(accountId, date)`, `loanId` and installment `(userId, status, dueDate)`.

The migration also adds **CHECK constraints**: positive amounts, transfers must have a different destination, `0 ≤ outstanding ≤ principal`, rate between 0 and 100, `payment = principal + interest + fee`, and the attachment size limit.

---

## 4. Financial rules

| Event | Ledger entries | Effect |
|---|---|---|
| Income | `INCOME` inflow | +account, counts as income |
| Expense | `EXPENSE` outflow | −account, counts as expense |
| Transfer | `TRANSFER` | −from, +to. **Never** income or expense. |
| Opening balance | `OPENING_BALANCE` | Sets the starting balance (can be negative for cards / overdrafts) |
| Reconcile | `ADJUSTMENT` | Records the difference between the app balance and the real balance |
| Borrow (personal / bank) | `LOAN_RECEIVED` inflow | +account, +liability. **Not income.** |
| Lend | `LOAN_GIVEN` outflow | −account, +receivable. Net worth unchanged. |
| Bank processing fee | `EXPENSE` (Bank Fees & Charges) | −account, counts as expense |
| **EMI purchase** (price P, down payment D) | `EXPENSE` of **P** + `LOAN_RECEIVED` of **P − D** | Cash changes by **−D**. The full price is recorded as an expense once. Financing is a liability, not income. |
| Repayment / EMI installment | `LOAN_REPAYMENT` / `EMI_PAYMENT` outflow + `LoanPayment` split | −account, −liability by the **principal** portion. Only **interest + fees** count as expenses. |
| Collection on money lent | `LOAN_COLLECTION` inflow | +account, −receivable. Interest counts as income. |

**Roll-ups** (`lib/finance/ledger.ts → computeNetWorth`, which excludes archived accounts and accounts flagged "exclude from net worth"):

- Available balance = Σ account balances
- Total assets = Σ positive balances + receivables
- Liabilities = outstanding borrowed principal + negative balances
- **Net worth = assets − liabilities**

**Integrity:** Settings → *Verify balances* recomputes every balance from the ledger and corrects any drift (each correction is audited). Balances are updated with atomic `increment`s in a deterministic account order, which avoids deadlocks.

---

## 5. Loan calculations

All arithmetic uses **decimal.js** with ROUND_HALF_UP to 2 decimal places, never JavaScript floats. Values travel as strings and are stored as `NUMERIC`.

- **EMI (reducing balance / amortizing):** `EMI = P × r × (1+r)^n / ((1+r)^n − 1)`, where `r` = annual rate ÷ 100 ÷ periods per year. If the rate is 0, `EMI = P / n`.
- **Schedule:** each period, interest = `round(balance × r)` and principal = EMI − interest. The last installment absorbs rounding so the closing balance is exactly 0.00.
- **Merchant-quoted EMI:** if you enter the EMI amount, the schedule uses it and the final installment settles the remainder.
- **Flat rate:** total interest = `P × rate × years`, spread evenly.
- **Payment waterfall:** fees → unpaid interest due → principal. You can also enter the principal/interest split manually.
- **Partial payment:** the installment becomes PARTIAL.
- **Overpayment:** the extra goes to principal as a prepayment. Paying more than the amount owed is rejected.
- **Early repayment:** when outstanding principal reaches 0, the loan is CLOSED and remaining installments are marked WAIVED. Reversing that payment reopens the loan.
- **Reschedule:** regenerates unpaid installments from the current outstanding principal. *Keep installment* shortens the term (`n = −ln(1 − rP/A) / ln(1+r)`). *Keep term* lowers the EMI.
- **Missed payments:** shown as Overdue automatically, can be marked MISSED, waived, or have their due date moved.
- **Personal loans with interest:** simple interest accrued actual/365 since the last payment is suggested as the interest portion.

---

## 6. Security

- **Authentication:** Auth.js v5 Credentials provider with JWT sessions (7 days). Passwords are hashed with bcrypt (cost 12). Login is timing-equalised for unknown emails. The account locks for 15 minutes after 5 failed attempts.
- **Email verification required** before sign-in. Reset tokens are random 256-bit values, stored hashed, single-use, valid 1 hour (verification links: 24 hours). Responses never reveal whether an email is registered.
- **Session revocation:** each request re-checks the user in the database (`server/auth.ts`). Changing or resetting the password, or "sign out everywhere", bumps `sessionVersion`, which immediately invalidates every existing JWT.
- **Authorisation:** `proxy.ts` only redirects optimistically. The real checks are in the Data Access Layer and services. **Every** query is scoped by `userId`, and referenced accounts, categories, loans and installments are ownership-checked. Records belonging to someone else return "not found", so their existence is never revealed. Integration tests cover cross-user access.
- **Validation:** Zod on the client for UX, and the same schemas again on the server for every action and route.
- **Uploads:** at most 4 MB, at most 10 per record. The type is detected from **magic bytes** (PDF, PNG, JPEG, WebP), not the browser's MIME type, and file names are sanitised. Files are served only to their owner, with `nosniff`, a sandboxing CSP and `no-store`.
- **CSV export:** text cells are protected against formula injection.
- **Headers:** HSTS, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy and COOP.
- **Secrets:** only server-side environment variables. Nothing sensitive uses the `NEXT_PUBLIC_` prefix. Password hashes and attachment bytes are excluded from Prisma queries by default (`omit`).
- **Cron endpoint:** protected by `CRON_SECRET` using a constant-time comparison.

---

## 7. Testing

```bash
npm test                    # 32 unit tests: EMI formula, schedules, flat rate, reschedule,
                            # payment waterfall, ledger effects, net worth, BDT formatting, dates
npm run test:integration    # 8 DB tests: exact balances, edits/deletes, transfers excluded from P&L,
                            # EMI purchase accounting, bank loan prepayment → reschedule → payoff → reversal,
                            # lent loans, recurring idempotency, cross-user isolation
```

EMI test vectors were verified independently with Python's `decimal` module (e.g. ৳1,00,000 @ 12% × 12 → ৳8,884.88; ৳5,00,000 @ 9% × 60 → ৳10,379.18).

---

## 8. Deploying to Vercel + Neon

### 8.1 Neon

1. Create a project at <https://console.neon.tech> (region close to your users, e.g. *AWS ap-southeast-1 Singapore*).
2. Under **Connect**, copy two connection strings:
   - **Pooled** (host contains `-pooler`) → `DATABASE_URL`
   - **Direct** (pooling toggled off) → `DIRECT_URL`
3. Apply the schema from your machine:
   ```bash
   DIRECT_URL="postgresql://…direct…" DATABASE_URL="postgresql://…pooled…" npx prisma migrate deploy
   ```
   Tip: create a Neon **branch** for development and preview deployments, and keep `main` for production.

### 8.2 Vercel

1. Push the repository to GitHub/GitLab and **Import** it in Vercel (framework: Next.js; the build command `npm run build` already runs `prisma generate`).
2. Add the environment variables from `.env.example` (Production, and Preview if you use a Neon branch):
   `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `APP_URL` (e.g. `https://hisab.yourdomain.com`), `RESEND_API_KEY`, `EMAIL_FROM`, `CRON_SECRET`.
   `AUTH_URL` is optional on Vercel.
3. Deploy. `vercel.json` registers a daily cron (`/api/cron/recurring`, 00:30 UTC = 06:30 Dhaka) that posts due recurring entries. They are also posted whenever you open the dashboard.
4. **Migrations on each release:** run `npm run db:deploy` from CI or locally against `DIRECT_URL` before or with each deploy. (You can also set the Vercel build command to `prisma migrate deploy && npm run build`, but then make sure Preview deployments use a separate Neon branch.)
5. **Verify the production build locally first:**
   ```bash
   npm run typecheck && npm run lint && npm test && npm run build && npm start
   ```

> Do **not** run `npm run db:seed` against production. The seed refuses to run when `NODE_ENV=production` unless you set `ALLOW_PROD_SEED=1`.

---

## 9. Email configuration

Email verification and password reset need a transactional email provider. Hisab uses **Resend**:

1. Create an account at <https://resend.com>, add and **verify your sending domain** (DNS: SPF and DKIM records).
2. Create an API key → `RESEND_API_KEY`.
3. Set `EMAIL_FROM`, e.g. `Hisab <no-reply@yourdomain.com>` (it must use the verified domain).
4. Set `APP_URL` to your public URL so links in emails point to the right host.

Without a key: in **development** the links are logged to the console. In **production**, registration and password reset fail with a clear server error, so misconfiguration is never silent.

To use another provider (SES, Postmark, SMTP), replace `sendEmail()` in `src/lib/email.ts`. Nothing else depends on Resend.

---

## 10. Limitations & unsupported features

- **Interest methods:** supported are fixed-rate reducing balance (standard amortizing EMI), flat rate, interest-free, and simple interest for personal loans. **Not supported:** daily-reducing balance (daily rest), variable/floating rates, compounding periods different from the payment frequency, balloon payments, moratorium or grace periods, and capitalised interest. For these, enter the bank's actual EMI and use the manual principal/interest split on each payment to match the bank statement.
- **Currency:** BDT only (single currency per user).
- **Attachments** are stored in Postgres (simple and private, at most 4 MB each). For heavy use, move them to object storage such as Vercel Blob (private) or S3 by replacing `src/server/services/attachments.ts`.
- **Rate limiting** is per account (login lockout). For internet-facing deployments, also add edge rate limiting (Vercel Firewall or Upstash) on `/api/auth/*`.
- Editing a loan's principal, rate or term after creation is intentionally not allowed, to keep the ledger consistent. Delete and re-create the loan, which reverses all of its balance effects, or use Reschedule.
