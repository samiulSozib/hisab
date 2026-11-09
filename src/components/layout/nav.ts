import {
  ArrowLeftRight,
  BarChart3,
  CreditCard,
  HandCoins,
  Landmark,
  LayoutDashboard,
  ReceiptText,
  Settings,
  Smartphone,
  TrendingUp,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { title: string; href: string; icon: LucideIcon };

export const MAIN_NAV: NavItem[] = [
  { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { title: "Accounts", href: "/accounts", icon: Wallet },
  { title: "Income", href: "/income", icon: TrendingUp },
  { title: "Expenses", href: "/expenses", icon: ReceiptText },
  { title: "Transactions", href: "/transactions", icon: ArrowLeftRight },
];

export const LOAN_NAV: NavItem[] = [
  { title: "Overview", href: "/loans", icon: HandCoins },
  { title: "Personal loans", href: "/loans/personal", icon: Users },
  { title: "EMI", href: "/loans/emi", icon: Smartphone },
  { title: "Bank loans", href: "/loans/bank", icon: Landmark },
];

export const SECONDARY_NAV: NavItem[] = [
  { title: "Reports", href: "/reports", icon: BarChart3 },
  { title: "Settings", href: "/settings", icon: Settings },
  { title: "Profile", href: "/profile", icon: UserRound },
];

/** Bottom bar on phones (4 most-used destinations + menu). */
export const MOBILE_NAV: NavItem[] = [
  { title: "Home", href: "/dashboard", icon: LayoutDashboard },
  { title: "Spend", href: "/expenses", icon: ReceiptText },
  { title: "Loans", href: "/loans", icon: CreditCard },
  { title: "Accounts", href: "/accounts", icon: Wallet },
];

export function titleFor(pathname: string): string {
  const all = [...MAIN_NAV, ...LOAN_NAV, ...SECONDARY_NAV];
  const exact = all.find((n) => n.href === pathname);
  if (exact) return exact.href === "/loans" ? "Loans" : exact.title;
  if (pathname.startsWith("/loans/")) return "Loan details";
  if (pathname.startsWith("/transactions/")) return "Transaction";
  const prefix = all.filter((n) => pathname.startsWith(n.href + "/")).sort((a, b) => b.href.length - a.href.length)[0];
  return prefix?.title ?? "Hisab";
}
