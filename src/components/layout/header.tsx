"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { MOBILE_NAV, titleFor } from "./nav";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Sun className="hidden dark:block" />
      <Moon className="dark:hidden" />
    </Button>
  );
}

function PageTitle() {
  return <h2 className="truncate text-sm font-medium">{titleFor(usePathname())}</h2>;
}

export function AppHeader({ userSlot }: { userSlot: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur-md md:rounded-t-xl md:bg-card/80 md:px-6">
      <SidebarTrigger className="-ml-1 hidden md:inline-flex" />
      <Separator orientation="vertical" className="mr-1 hidden h-4 md:block" />
      <Suspense fallback={<span />}>
        <PageTitle />
      </Suspense>
      <div className="ml-auto flex items-center gap-1">
        <ThemeToggle />
        {userSlot}
      </div>
    </header>
  );
}

/** Touch-friendly bottom navigation for phones. */
export function MobileNav() {
  return (
    <Suspense fallback={<MobileNavView pathname={null} />}>
      <MobileNavWithPath />
    </Suspense>
  );
}

function MobileNavWithPath() {
  return <MobileNavView pathname={usePathname()} />;
}

function MobileNavView({ pathname }: { pathname: string | null }) {
  const { setOpenMobile } = useSidebar();
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-5">
        {MOBILE_NAV.map((item) => {
          const active =
            pathname !== null &&
            (item.href === "/loans" ? pathname.startsWith("/loans") : pathname === item.href || pathname.startsWith(`${item.href}/`));
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground transition-colors",
                  active && "text-primary",
                )}
                aria-current={active ? "page" : undefined}
              >
                <item.icon className="size-5" aria-hidden />
                {item.title}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            onClick={() => setOpenMobile(true)}
            className="flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium text-muted-foreground"
          >
            <Menu className="size-5" aria-hidden />
            More
          </button>
        </li>
      </ul>
    </nav>
  );
}
