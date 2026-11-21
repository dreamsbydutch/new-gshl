"use client";

import Link from "next/link";
import {
  BookOpenText,
  ClipboardList,
  Menu,
  ShieldCheck,
} from "lucide-react";
import { useAppSearchParams, useAuthSession } from "@gshl-hooks";
import type { MainNavbarMoreMenuProps } from "@gshl-types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@gshl-ui";
import { cn } from "@gshl-utils";

function isMenuRouteActive(
  pathname: string,
  search: string,
  href: string,
): boolean {
  const [route, query] = href.split("?");
  if (!route) return false;
  if (
    route === "/rulebook" &&
    (pathname === "/rules" || pathname.startsWith("/rules/"))
  )
    return true;
  if (route === "/leagueoffice") {
    return (
      pathname === route &&
      new URLSearchParams(search).get("view") ===
        new URLSearchParams(query).get("view")
    );
  }
  return pathname === route || pathname.startsWith(`${route}/`);
}

export function MoreNavigationMenu({
  isActive,
  pathname,
  placement,
}: MainNavbarMoreMenuProps) {
  const isMobile = placement === "mobile";
  const { session } = useAuthSession();
  const { search } = useAppSearchParams();
  const items = [
    {
      label: "Free agency",
      href: "/leagueoffice?view=freeAgents",
      icon: ClipboardList,
    },
    ...(isMobile
      ? [{ label: "Rulebook", href: "/rulebook", icon: BookOpenText }]
      : []),
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "min-h-11 items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 motion-reduce:transition-none",
            isActive
              ? "bg-slate-900 text-white"
              : "text-slate-700 hover:bg-slate-100",
            isMobile
              ? "flex h-full min-w-0 flex-1 flex-col gap-0.5 rounded-xl px-1 py-1 text-[11px] lg:hidden"
              : "hidden px-2 py-2 text-sm lg:flex xl:px-3",
          )}
          aria-label="Open league menu"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>Menu</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "top" : "bottom"}
        align="end"
        sideOffset={8}
        className="z-[70] max-h-[75dvh] w-52 overflow-y-auto p-1"
      >
        {items.map(({ label, href, icon: Icon }) => {
          const isCurrent = isMenuRouteActive(pathname, search, href);
          return (
            <DropdownMenuItem
              key={href}
              asChild
              className={cn(
                "min-h-11 cursor-pointer rounded px-3 py-2",
                isCurrent && "bg-slate-100",
              )}
            >
              <Link href={href} aria-current={isCurrent ? "page" : undefined}>
                <Icon className="h-4 w-4 text-slate-600" aria-hidden="true" />
                <span className="font-semibold text-slate-900">{label}</span>
              </Link>
            </DropdownMenuItem>
          );
        })}
        {session?.user.role === "commissioner" ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              asChild
              className={cn(
                "min-h-11 cursor-pointer rounded px-3 py-2",
                isMenuRouteActive(pathname, search, "/admin") && "bg-slate-100",
              )}
            >
              <Link
                href="/admin"
                aria-current={
                  isMenuRouteActive(pathname, search, "/admin")
                    ? "page"
                    : undefined
                }
              >
                <ShieldCheck
                  className="h-4 w-4 text-slate-600"
                  aria-hidden="true"
                />
                <span className="font-semibold text-slate-900">Admin</span>
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
