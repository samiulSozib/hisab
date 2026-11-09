import { Suspense } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { AppHeader, MobileNav } from "@/components/layout/header";
import { UserMenu } from "@/components/layout/user-menu";
import { getCurrentUser } from "@/server/auth";

async function UserSlot() {
  const user = await getCurrentUser();
  if (!user) return null;
  return <UserMenu name={user.name} email={user.email} />;
}

// Every page here reads the user's session, so it can't be part of a shared static shell.
// Opt out of instant-navigation validation (pages still stream behind loading.tsx).
export const instant = false;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="min-w-0">
        <AppHeader
          userSlot={
            <Suspense fallback={<Skeleton className="size-8 rounded-full" />}>
              <UserSlot />
            </Suspense>
          }
        />
        <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-28 pt-5 md:px-6 md:pb-10 md:pt-6">{children}</div>
      </SidebarInset>
      <MobileNav />
    </SidebarProvider>
  );
}
