"use client";

import Link from "next/link";
import {
  BookOpenText,
  Building2,
  ClipboardList,
  Ellipsis,
  Newspaper,
} from "lucide-react";
import type { MainNavbarMoreMenuProps } from "@gshl-types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@gshl-ui";
import { cn } from "@gshl-utils";

const moreItems = [
  {
    label: "Press Box",
    description: "League news and weekly editions",
    href: "/headlines",
    icon: Newspaper,
  },
  {
    label: "Rulebook",
    description: "League rules and policies",
    href: "/rulebook",
    icon: BookOpenText,
  },
  {
    label: "League Office",
    description: "League tools and reference views",
    href: "/leagueoffice",
    icon: Building2,
  },
  {
    label: "Draft Hub",
    description: "Live draft board and team rooms",
    href: "/draft",
    icon: ClipboardList,
  },
];

function isMenuRouteActive(pathname: string, href: string): boolean {
  if (href === "/rulebook" && pathname === "/rules") return true;
  if (
    href === "/draft" &&
    (pathname === "/draftboard" || pathname.startsWith("/draftboard/"))
  ) {
    return true;
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MoreNavigationMenu({
  isActive,
  pathname,
  placement,
}: MainNavbarMoreMenuProps) {
  const isMobile = placement === "mobile";

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
              : "hidden px-3 py-2 text-sm lg:flex",
          )}
          aria-label="Open more navigation"
        >
          <Ellipsis className="h-5 w-5" aria-hidden="true" />
          <span>More</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={isMobile ? "top" : "bottom"}
        align="end"
        sideOffset={isMobile ? 12 : 10}
        className="z-[70] w-72 p-2"
      >
        <DropdownMenuLabel className="px-3 py-2 text-xs uppercase tracking-[0.14em] text-slate-500">
          Explore GSHL
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {moreItems.map(({ label, description, href, icon: Icon }) => {
          const isCurrent = isMenuRouteActive(pathname, href);
          return (
            <DropdownMenuItem
              key={href}
              asChild
              className={cn(
                "min-h-12 cursor-pointer rounded-lg px-3 py-2",
                isCurrent && "bg-slate-100",
              )}
            >
              <Link href={href} aria-current={isCurrent ? "page" : undefined}>
                <Icon className="h-5 w-5 text-slate-600" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block font-semibold text-slate-900">
                    {label}
                  </span>
                  <span className="block truncate text-xs text-slate-500">
                    {description}
                  </span>
                </span>
              </Link>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
