"use client";

/**
 * Main Navigation Bar Component
 *
 * Primary application navigation with route-based active states and responsive design.
 */

import Link from "next/link";
import {
  ArrowLeft,
  CalendarDays,
  Gem,
  House,
  Shirt,
  Trophy,
} from "lucide-react";
import { useAppPathname } from "@gshl-hooks";
import { cn } from "@gshl-utils";
import { getAppShellRouteContext } from "@gshl-utils";
import { NavContainer, LinkNavItem } from "./BaseComponents";
import type { LinkNavItem as LinkNavItemType, NavbarProps } from "@gshl-types";
import { AuthNavControl } from "@gshl-components/auth";
import { MoreNavigationMenu } from "./MoreNavigationMenu";

/**
 * Main navigation bar component with responsive design and active state detection
 * @param props - Component props
 * @returns Primary navigation bar with route-based active states
 */
export function MainNavbar({ className, search = "" }: NavbarProps) {
  const { pathname } = useAppPathname();
  const routeContext = getAppShellRouteContext(pathname, search);

  const navItems: LinkNavItemType[] = [
    {
      id: "home",
      label: "Home",
      href: "/",
      icon: <House className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "schedule",
      label: "Schedule",
      href: "/schedule",
      icon: <CalendarDays className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "standings",
      label: "Standings",
      href: "/standings",
      icon: <Trophy className="h-5 w-5" aria-hidden="true" />,
    },
    {
      id: "lockerroom",
      label: "My Team",
      href: "/lockerroom",
      icon: <Shirt className="h-5 w-5" aria-hidden="true" />,
    },
  ];

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-800 bg-slate-950 pt-[env(safe-area-inset-top)] text-white shadow-sm lg:hidden print:hidden">
        <div className="grid h-[var(--app-mobile-header-height)] grid-cols-[5rem_minmax(0,1fr)_5rem] items-center px-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))]">
          {routeContext.backHref ? (
            <Link
              href={routeContext.backHref}
              aria-label={routeContext.backLabel}
              className="flex min-h-11 min-w-11 items-center justify-start rounded-lg px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </Link>
          ) : (
            <Link
              href="/"
              aria-label="GSHL home"
              className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-bold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
            >
              <Gem className="h-5 w-5" aria-hidden="true" />
              <span>GSHL</span>
            </Link>
          )}
          <p className="truncate px-1 text-center text-sm font-bold">
            {routeContext.title}
          </p>
          <div className="flex justify-end">
            <AuthNavControl compact />
          </div>
        </div>
      </header>

      <NavContainer ariaLabel="Primary">
        <div
          className={cn(
            className,
            "mx-auto flex h-[var(--app-primary-nav-height)] w-full max-w-7xl items-stretch px-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))] lg:items-center lg:gap-4 lg:px-5",
          )}
        >
          <Link
            href="/"
            className="hidden min-h-11 shrink-0 items-center gap-2 rounded-lg px-2 text-base font-black tracking-[0.08em] text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 lg:flex"
            aria-label="GSHL home"
          >
            <Gem className="h-6 w-6" aria-hidden="true" />
            <span>GSHL</span>
          </Link>
          <div className="flex min-w-0 flex-1 items-stretch justify-around lg:justify-center lg:gap-1">
            {navItems.map((item) => (
              <LinkNavItem
                key={item.id}
                {...item}
                isActive={routeContext.activeNavId === item.id}
                className="h-full min-w-0 flex-1 flex-col gap-0.5 rounded-xl px-1 py-1 text-[11px] lg:h-11 lg:flex-none lg:flex-row lg:gap-2 lg:px-3 lg:py-2 lg:text-sm"
              />
            ))}
            <MoreNavigationMenu
              pathname={pathname}
              isActive={routeContext.activeNavId === "more"}
              placement="mobile"
            />
            <MoreNavigationMenu
              pathname={pathname}
              isActive={routeContext.activeNavId === "more"}
              placement="desktop"
            />
          </div>
          <div className="hidden shrink-0 lg:block">
            <AuthNavControl />
          </div>
        </div>
      </NavContainer>
    </>
  );
}
