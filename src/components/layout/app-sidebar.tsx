"use client";

import { Suspense } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Brand, BrandMark } from "@/components/brand";
import { LOAN_NAV, MAIN_NAV, SECONDARY_NAV, type NavItem } from "./nav";

function isActive(pathname: string, href: string) {
  if (href === "/loans") return pathname === "/loans";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavGroupView({ label, items, pathname }: { label: string; items: NavItem[]; pathname: string | null }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{label}</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton asChild isActive={pathname ? isActive(pathname, item.href) : false} tooltip={item.title}>
                <Link href={item.href} onClick={() => setOpenMobile(false)}>
                  <item.icon />
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function NavGroupWithPath(props: { label: string; items: NavItem[] }) {
  return <NavGroupView {...props} pathname={usePathname()} />;
}

/** The pathname is request data on dynamic routes, so the highlighted state streams in. */
function NavGroup(props: { label: string; items: NavItem[] }) {
  return (
    <Suspense fallback={<NavGroupView {...props} pathname={null} />}>
      <NavGroupWithPath {...props} />
    </Suspense>
  );
}

export function AppSidebar({ footer }: { footer?: React.ReactNode }) {
  const { state } = useSidebar();
  return (
    <Sidebar collapsible="icon" variant="inset">
      <SidebarHeader className="px-3 py-3">
        <Link href="/dashboard" className="flex items-center" aria-label="Hisab home">
          {state === "collapsed" ? <BrandMark /> : <Brand />}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavGroup label="Money" items={MAIN_NAV} />
        <NavGroup label="Loans" items={LOAN_NAV} />
        <NavGroup label="Insights" items={SECONDARY_NAV} />
      </SidebarContent>
      {footer && <SidebarFooter>{footer}</SidebarFooter>}
      <SidebarRail />
    </Sidebar>
  );
}
