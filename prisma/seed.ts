/**
 * Development / test seed — ~6 months of realistic Bangladeshi personal-finance activity.
 *
 * Everything goes through the real service layer, so balances, schedules, loan totals and the
 * audit log are produced by exactly the same transactional code paths the app uses.
 *
 *   npm run db:seed          (DEV ONLY — refuses to run when NODE_ENV=production)
 *
 * Demo login: demo@hisab.app / Demo@12345   (re-running the seed resets this user only)
 */
import "dotenv/config";
import { db } from "../src/lib/db";
import { addDays, addMonths, parseDateOnly, startOfMonth, toDateOnly, todayString } from "../src/lib/dates";
import { hashPassword } from "../src/server/services/auth";
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from "../src/lib/constants";
import { createAccount, recalculateBalances, transferBetweenAccounts } from "../src/server/services/accounts";
import { createCashflow } from "../src/server/services/transactions";
import { createRecurring, processDueRecurring } from "../src/server/services/recurring";
import { createBankLoan, createEmiLoan, createPersonalLoan, recordLoanPayment, updateInstallment } from "../src/server/services/loans";

export const DEMO_EMAIL = "demo@hisab.app";
export const DEMO_PASSWORD = "Demo@12345";

if (process.env.NODE_ENV === "production" && process.env.ALLOW_PROD_SEED !== "1") {
  console.error("Refusing to seed in production. Set ALLOW_PROD_SEED=1 to override.");
  process.exit(1);
}

// ───────────── Deterministic randomness (same data every run) ─────────────
let state = 20261109;
function rand() {
  state |= 0;
  state = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(state ^ (state >>> 15), 1 | state);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const between = (min: number, max: number) => min + rand() * (max - min);
const chance = (p: number) => rand() < p;
const pick = <T,>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
/** Round to a "human" amount (nearest 5 / 10 / 50 Taka depending on size). */
function amt(min: number, max: number): string {
  const v = between(min, max);
  const step = v < 200 ? 5 : v < 2000 ? 10 : 50;
  return (Math.max(step, Math.round(v / step) * step)).toFixed(2);
}

// ───────────── Dates ─────────────
const TODAY = parseDateOnly(todayString());
const START = startOfMonth(addMonths(TODAY, -6, 1)); // first day, 6 months back
const iso = toDateOnly;
const dayOf = (monthOffset: number, d: number) => {
  const m = startOfMonth(addMonths(TODAY, monthOffset, 1));
  const last = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), Math.min(d, last))));
};
const past = (date: string) => date <= iso(TODAY);

let counter = 0;
const tick = () => {
  counter++;
  if (counter % 100 === 0) process.stdout.write(`  … ${counter} entries\n`);
};

async function main() {
  const t0 = Date.now();
  const existing = await db.user.findUnique({ where: { email: DEMO_EMAIL }, select: { id: true } });
  if (existing) {
    await db.user.delete({ where: { id: existing.id } }); // cascades all of the demo user's data
    console.log("• Removed previous demo user");
  }

  const user = await db.user.create({
    data: { name: "Samiul Bashar", email: DEMO_EMAIL, passwordHash: await hashPassword(DEMO_PASSWORD), emailVerified: new Date() },
    select: { id: true },
  });
  const uid = user.id;
  await db.category.createMany({
    data: [
      ...DEFAULT_INCOME_CATEGORIES.map((c) => ({ userId: uid, kind: "INCOME" as const, name: c.name, color: c.color })),
      ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ userId: uid, kind: "EXPENSE" as const, name: c.name, color: c.color })),
      { userId: uid, kind: "EXPENSE" as const, name: "Subscriptions", color: "#0d9488" },
      { userId: uid, kind: "EXPENSE" as const, name: "Eating Out", color: "#fb923c" },
      { userId: uid, kind: "EXPENSE" as const, name: "Personal Care", color: "#d946ef" },
      { userId: uid, kind: "EXPENSE" as const, name: "Charity & Zakat", color: "#22c55e" },
    ],
  });
  const cat = Object.fromEntries((await db.category.findMany({ where: { userId: uid } })).map((c) => [c.name, c.id]));

  // ───────────── Accounts ─────────────
  const opening = iso(START);
  const mk = (name: string, type: "CASH" | "BANK" | "BKASH" | "NAGAD" | "SAVINGS" | "CREDIT_CARD", openingBalance: string, color: string, institution?: string) =>
    createAccount(uid, { name, type, openingBalance, openingDate: opening, includeInNetWorth: true, color, institution });
  const cash = await mk("Cash in hand", "CASH", "6500.00", "#16a34a");
  const salary = await mk("DBBL Salary", "BANK", "84250.00", "#2563eb", "Dutch-Bangla Bank");
  const savings = await mk("City Bank Savings", "SAVINGS", "325000.00", "#0f766e", "City Bank");
  const bkash = await mk("bKash", "BKASH", "4300.00", "#e2136e");
  const nagad = await mk("Nagad", "NAGAD", "1250.00", "#f97316");
  const card = await mk("EBL Credit Card", "CREDIT_CARD", "-12500.00", "#dc2626", "Eastern Bank");
  console.log("• 6 accounts created");

  // ───────────── Recurring rules (posted automatically, back-filled) ─────────────
  const rules = [
    { type: "INCOME", amount: "95000.00", accountId: salary.id, categoryId: cat["Salary"], counterparty: "Acme Technologies Ltd.", description: "Monthly salary", startDate: dayOf(-6, 1) },
    { type: "EXPENSE", amount: "28000.00", accountId: salary.id, categoryId: cat["Rent & Housing"], counterparty: "Landlord — Mr. Karim", description: "Flat rent, Mirpur DOHS", startDate: dayOf(-6, 5) },
    { type: "EXPENSE", amount: "1200.00", accountId: bkash.id, categoryId: cat["Mobile & Internet"], counterparty: "Link3", description: "Home broadband", startDate: dayOf(-6, 10) },
    { type: "EXPENSE", amount: "799.00", accountId: bkash.id, categoryId: cat["Mobile & Internet"], counterparty: "Grameenphone", description: "Mobile postpaid", startDate: dayOf(-6, 12) },
    { type: "EXPENSE", amount: "1100.00", accountId: card.id, categoryId: cat["Subscriptions"], counterparty: "Netflix", description: "Netflix Standard", startDate: dayOf(-6, 18) },
    { type: "EXPENSE", amount: "450.00", accountId: card.id, categoryId: cat["Subscriptions"], counterparty: "Spotify", description: "Spotify Premium", startDate: dayOf(-6, 20) },
    { type: "EXPENSE", amount: "3500.00", accountId: salary.id, categoryId: cat["Education"], counterparty: "Coaching centre", description: "Younger brother's tuition", startDate: dayOf(-6, 7) },
    { type: "EXPENSE", amount: "8000.00", accountId: salary.id, categoryId: cat["Family & Gifts"], counterparty: "Parents", description: "Monthly support for parents", startDate: dayOf(-6, 3) },
  ] as const;
  for (const r of rules) {
    await createRecurring(uid, { ...r, frequency: "MONTHLY", interval: 1, isActive: true });
  }
  const posted = await processDueRecurring(uid);
  counter += posted;
  console.log(`• ${rules.length} recurring rules (${posted} entries posted)`);

  // ───────────── Day-by-day activity ─────────────
  const exp = async (date: string, category: string, amount: string, accountId: string, counterparty: string, description: string) => {
    await createCashflow(uid, { type: "EXPENSE", amount, date, accountId, categoryId: cat[category], counterparty, description });
    tick();
  };
  const inc = async (date: string, category: string, amount: string, accountId: string, counterparty: string, description: string) => {
    await createCashflow(uid, { type: "INCOME", amount, date, accountId, categoryId: cat[category], counterparty, description });
    tick();
  };
  const xfer = async (date: string, from: string, to: string, amount: string, description: string) => {
    await transferBetweenAccounts(uid, { fromAccountId: from, toAccountId: to, amount, date, description });
    tick();
  };

  const balanceOf = async (id: string) =>
    Number((await db.account.findUniqueOrThrow({ where: { id }, select: { currentBalance: true } })).currentBalance.toFixed(2));

  const snacks = ["Tea & snacks", "Singara & tea", "Fuchka", "Coffee", "Morning paratha"] as const;
  const lunchSpots = ["Office canteen", "Kacchi Bhai", "Sultan's Dine", "Star Kabab", "Takeout lunch"] as const;
  const rides = [
    ["Pathao", "Bike ride to office"],
    ["Uber", "Ride home"],
    ["CNG", "CNG fare"],
    ["Rickshaw", "Rickshaw fare"],
    ["Pathao", "Bike ride"],
  ] as const;

  for (let date = START; date <= TODAY; date = addDays(date, 1)) {
    const d = iso(date);
    const dow = date.getUTCDay(); // 5 = Friday (weekend in BD)
    const dom = date.getUTCDate();
    const weekday = dow !== 5 && dow !== 6;

    // Daily small spending
    if (chance(0.75)) await exp(d, "Food & Groceries", amt(30, 180), cash.id, "Tong / local shop", pick(snacks));
    if (weekday && chance(0.85)) {
      const [who, what] = pick(rides);
      await exp(d, "Transport", amt(60, 420), who === "Rickshaw" || who === "CNG" ? cash.id : bkash.id, who, what);
    }
    if (weekday && chance(0.55)) await exp(d, "Eating Out", amt(180, 650), chance(0.5) ? cash.id : bkash.id, pick(lunchSpots), "Lunch");
    if (chance(0.18)) await exp(d, "Eating Out", amt(550, 1900), bkash.id, "Foodpanda", "Dinner delivery");

    // Weekly
    if (dow === 6) await exp(d, "Food & Groceries", amt(2600, 5200), chance(0.6) ? card.id : salary.id, pick(["Shwapno", "Meena Bazar", "Unimart"]), "Weekly groceries");
    if (dow === 5) await exp(d, "Food & Groceries", amt(900, 2200), cash.id, "Kawran Bazar", "Fish, meat & vegetables");
    // Top up only when running low — like real life.
    if (dow === 4 && (await balanceOf(cash.id)) < 4000) await xfer(d, salary.id, cash.id, pick(["5000.00", "6000.00", "8000.00"]), "ATM withdrawal");
    if (dow === 1 && (await balanceOf(bkash.id)) < 3500) await xfer(d, salary.id, bkash.id, pick(["4000.00", "5000.00", "6000.00"]), "bKash add money");

    // Monthly bills & routines
    if (dom === 8) await exp(d, "Utilities", amt(1600, 3400), bkash.id, "DESCO", "Electricity bill (prepaid)");
    if (dom === 9) await exp(d, "Utilities", "1080.00", nagad.id, "Titas Gas", "Gas bill");
    if (dom === 11) await exp(d, "Utilities", amt(300, 450), nagad.id, "DWASA", "Water bill");
    if (dom === 14) await exp(d, "Personal Care", amt(350, 1200), cash.id, pick(["Persona", "Local salon"]), "Haircut & grooming");
    if (dom === 2) await xfer(d, salary.id, savings.id, "15000.00", "Monthly savings (DPS)");
    if (dom === 6 && (await balanceOf(nagad.id)) < 1500) await xfer(d, salary.id, nagad.id, "2000.00", "Nagad top-up");
    if (dom === 25) {
      // Pay off most of the credit card from the salary account
      const bal = await db.account.findUniqueOrThrow({ where: { id: card.id }, select: { currentBalance: true } });
      const due = Number(bal.currentBalance.toFixed(2));
      if (due < -1000) await xfer(d, salary.id, card.id, (Math.round(-due * 0.9 / 10) * 10).toFixed(2), "Credit card bill payment");
    }

    // Occasional
    if (chance(0.06)) await exp(d, "Healthcare", amt(250, 2800), cash.id, pick(["Lazz Pharma", "Tamanna Pharmacy", "Popular Diagnostic"]), pick(["Medicine", "Doctor visit", "Lab tests"]));
    if (chance(0.05)) await exp(d, "Shopping", amt(1200, 7500), card.id, pick(["Aarong", "Yellow", "Bata", "Daraz", "Ecstasy"]), pick(["Clothing", "Shoes", "Household items", "Online order"]));
    if (chance(0.04)) await exp(d, "Entertainment", amt(600, 2400), card.id, pick(["Star Cineplex", "Bowling — Jamuna", "Concert tickets"]), "Weekend outing");
    if (chance(0.025)) await exp(d, "Family & Gifts", amt(1000, 5000), bkash.id, pick(["Cousin's wedding", "Nephew's birthday", "Eid salami"]), "Gift");
    if (chance(0.02)) await exp(d, "Charity & Zakat", amt(500, 3000), bkash.id, pick(["Mosque", "Bidyanondo", "JAAGO Foundation"]), "Donation");
    if (chance(0.03)) await exp(d, "Transport", amt(1500, 4200), bkash.id, pick(["Green Line", "Shohagh", "Biman Bangladesh"]), "Trip home");

    // Side income
    if (weekday && chance(0.035)) await inc(d, "Freelancing", amt(8000, 38000), salary.id, pick(["Upwork via Payoneer", "Fiverr via Payoneer", "Local agency"]), pick(["Web project milestone", "Logo & branding", "WordPress fixes", "API integration"]));
    if (dom === 28 && chance(0.4)) await inc(d, "Other Income", amt(1500, 6000), cash.id, "Tuition", "Private tuition fee");
  }

  // One-off income
  const one = async (mo: number, day: number, f: () => Promise<void>) => {
    if (past(dayOf(mo, day))) await f();
  };
  await one(-4, 24, () => inc(dayOf(-4, 24), "Bonus", "47500.00", salary.id, "Acme Technologies Ltd.", "Festival bonus"));
  await one(-1, 20, () => inc(dayOf(-1, 20), "Bonus", "30000.00", salary.id, "Acme Technologies Ltd.", "Performance bonus"));
  for (const mo of [-6, -3, 0]) await one(mo, 30, () => inc(dayOf(mo, 30), "Interest & Profit", amt(2800, 3400), savings.id, "City Bank", "Quarterly savings profit"));
  await one(-2, 15, () => inc(dayOf(-2, 15), "Gifts Received", "10000.00", bkash.id, "Uncle", "Eid salami"));
  await one(-3, 16, () => inc(dayOf(-3, 16), "Business", "18500.00", salary.id, "Online shop", "Sold old furniture & gadgets"));
  console.log(`• Daily activity: ${counter} entries so far`);

  // ───────────── Personal loans ─────────────
  const borrowed = await createPersonalLoan(uid, {
    title: "Loan from Rafiq bhai",
    counterparty: "Rafiq Ahmed",
    direction: "BORROWED",
    principal: "60000.00",
    startDate: dayOf(-5, 12),
    interestRate: "0",
    repaymentTerms: "Repay in parts before the end of the year",
    dueDate: dayOf(2, 30),
    accountId: bkash.id,
    recordCashFlow: true,
  });
  for (const [mo, a] of [[-4, "10000.00"], [-3, "10000.00"], [-1, "15000.00"]] as const) {
    if (past(dayOf(mo, 15))) await recordLoanPayment(uid, borrowed.id, { amount: a, date: dayOf(mo, 15), accountId: bkash.id, splitMode: "auto" });
  }

  const withInterest = await createPersonalLoan(uid, {
    title: "Office colleague loan",
    counterparty: "Tanim Hossain",
    direction: "BORROWED",
    principal: "40000.00",
    startDate: dayOf(-3, 3),
    interestRate: "10",
    repaymentTerms: "10% simple interest, flexible repayment",
    accountId: salary.id,
    recordCashFlow: true,
  });
  if (past(dayOf(-1, 3))) {
    await recordLoanPayment(uid, withInterest.id, {
      amount: "10000.00",
      date: dayOf(-1, 3),
      accountId: salary.id,
      splitMode: "manual",
      interestAmount: "660.00",
      principalAmount: "9340.00",
      notes: "First repayment incl. 2 months' interest",
    });
  }

  const lent = await createPersonalLoan(uid, {
    title: "Loan to cousin Tanvir",
    counterparty: "Tanvir Hasan",
    direction: "LENT",
    principal: "30000.00",
    startDate: dayOf(-4, 8),
    interestRate: "0",
    repaymentTerms: "Will return after his job joining",
    dueDate: dayOf(1, 30),
    accountId: salary.id,
    recordCashFlow: true,
  });
  for (const [mo, a] of [[-2, "8000.00"], [0, "5000.00"]] as const) {
    if (past(dayOf(mo, 10))) await recordLoanPayment(uid, lent.id, { amount: a, date: dayOf(mo, 10), accountId: cash.id, splitMode: "auto" });
  }
  const lentSettled = await createPersonalLoan(uid, {
    title: "Lent to friend Arif",
    counterparty: "Arif Rahman",
    direction: "LENT",
    principal: "12000.00",
    startDate: dayOf(-5, 20),
    interestRate: "0",
    accountId: bkash.id,
    recordCashFlow: true,
  });
  if (past(dayOf(-3, 22))) await recordLoanPayment(uid, lentSettled.id, { amount: "12000.00", date: dayOf(-3, 22), accountId: bkash.id, splitMode: "auto" });
  console.log("• 4 personal loans (borrowed, with interest, lent, settled)");

  // ───────────── EMIs ─────────────
  const payDue = async (loanId: string, accountId: string, opts: { skipLast?: boolean; partialLast?: string } = {}) => {
    const due = await db.loanInstallment.findMany({ where: { loanId, dueDate: { lt: TODAY } }, orderBy: { number: "asc" } });
    for (const [i, inst] of due.entries()) {
      const last = i === due.length - 1;
      if (last && opts.skipLast) {
        await updateInstallment(uid, inst.id, { status: "MISSED", dueDate: iso(inst.dueDate), notes: "Missed — card limit issue" });
        continue;
      }
      await recordLoanPayment(uid, loanId, {
        amount: last && opts.partialLast ? opts.partialLast : inst.scheduledAmount.toFixed(2),
        date: iso(inst.dueDate),
        accountId,
        installmentId: inst.id,
        splitMode: "auto",
      });
    }
  };

  const laptop = await createEmiLoan(uid, {
    title: "MacBook Air M4",
    counterparty: "Star Tech · EBL card 0% EMI",
    purchasePrice: "168000.00",
    downPayment: "24000.00",
    startDate: dayOf(-5, 2),
    accountId: salary.id,
    purchaseCategoryId: cat["Electronics"],
    recordPurchase: true,
    interestRate: "0",
    interestMethod: "NONE",
    frequency: "MONTHLY",
    installmentCount: 12,
    firstPaymentDate: dayOf(-4, 2),
  });
  await payDue(laptop.id, salary.id);

  const phone = await createEmiLoan(uid, {
    title: "Samsung Galaxy S25",
    counterparty: "Samsung Plaza · City Bank",
    purchasePrice: "115000.00",
    downPayment: "15000.00",
    startDate: dayOf(-3, 20),
    accountId: salary.id,
    purchaseCategoryId: cat["Electronics"],
    recordPurchase: true,
    interestRate: "9",
    interestMethod: "REDUCING_BALANCE",
    frequency: "MONTHLY",
    installmentCount: 18,
    firstPaymentDate: dayOf(-2, 20),
  });
  await payDue(phone.id, salary.id, { partialLast: "3000.00" });

  const fridge = await createEmiLoan(uid, {
    title: "Walton Refrigerator",
    counterparty: "Walton Plaza",
    purchasePrice: "72000.00",
    downPayment: "12000.00",
    startDate: dayOf(-4, 15),
    accountId: card.id,
    purchaseCategoryId: cat["Shopping"],
    recordPurchase: true,
    interestRate: "12",
    interestMethod: "FLAT_RATE",
    frequency: "MONTHLY",
    installmentCount: 6,
    firstPaymentDate: dayOf(-3, 15),
  });
  await payDue(fridge.id, salary.id, { skipLast: true });
  console.log("• 3 EMIs (0% laptop, 9% phone with a partial payment, flat-rate fridge with a missed installment)");

  // ───────────── Bank loans ─────────────
  const pl = await createBankLoan(uid, {
    title: "Personal loan",
    counterparty: "BRAC Bank",
    loanType: "Personal loan",
    referenceNumber: "BRAC-PL-2026-004512",
    principal: "500000.00",
    startDate: dayOf(-6, 10),
    processingFee: "5000.00",
    accountId: salary.id,
    recordCashFlow: true,
    interestRate: "11.5",
    interestMethod: "REDUCING_BALANCE",
    frequency: "MONTHLY",
    installmentCount: 36,
    firstPaymentDate: dayOf(-5, 10),
  });
  await payDue(pl.id, salary.id);
  // A prepayment from savings after the bonus
  if (past(dayOf(-1, 22))) {
    await xfer(dayOf(-1, 21), savings.id, salary.id, "60000.00", "Moved savings for loan prepayment");
    const next = await db.loanInstallment.findFirst({ where: { loanId: pl.id, status: { in: ["PENDING", "PARTIAL"] } }, orderBy: { number: "asc" } });
    if (next) {
      await recordLoanPayment(uid, pl.id, { amount: "50000.00", date: dayOf(-1, 22), accountId: salary.id, installmentId: next.id, splitMode: "auto", notes: "Partial prepayment from bonus" });
    }
  }

  const reno = await createBankLoan(uid, {
    title: "Home renovation loan",
    counterparty: "Eastern Bank PLC",
    loanType: "Home improvement loan",
    referenceNumber: "EBL-HIL-88213",
    principal: "300000.00",
    startDate: dayOf(-2, 1),
    processingFee: "3000.00",
    accountId: salary.id,
    recordCashFlow: true,
    interestRate: "10.5",
    interestMethod: "REDUCING_BALANCE",
    frequency: "MONTHLY",
    installmentCount: 24,
    firstPaymentDate: dayOf(-1, 1),
  });
  // Spend most of it on the renovation
  for (const [mo, day, a, who, what] of [
    [-2, 4, "85000.00", "Hatil", "Living room furniture"],
    [-2, 12, "62000.00", "Local contractor", "Kitchen renovation — labour & materials"],
    [-1, 6, "38500.00", "RAK Ceramics", "Bathroom tiles & fittings"],
    [-1, 18, "24000.00", "Berger Paints", "Painting the flat"],
  ] as const) {
    if (past(dayOf(mo, day))) await exp(dayOf(mo, day), "Rent & Housing", a, salary.id, who, what);
  }
  await payDue(reno.id, salary.id);
  console.log("• 2 bank loans (personal loan with prepayment, home renovation loan)");

  // ───────────── Summary ─────────────
  const [txCount, accounts] = await Promise.all([
    db.transaction.count({ where: { userId: uid } }),
    db.account.findMany({ where: { userId: uid }, select: { name: true, currentBalance: true }, orderBy: { createdAt: "asc" } }),
  ]);
  console.log(`\n${txCount} transactions from ${iso(START)} to ${iso(TODAY)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  for (const a of accounts) console.log(`   ${a.name.padEnd(20)} ৳${a.currentBalance.toFixed(2)}`);
  const drift = await recalculateBalances(uid);
  console.log(drift.length ? `⚠️  Balance drift corrected: ${JSON.stringify(drift)}` : "   Ledger integrity check: all balances match ✓");
  console.log(`\n✅ Seed complete. Sign in with ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
