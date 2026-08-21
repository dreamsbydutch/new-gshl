"use client";

/**
 * Main Navigation Bar Component
 *
 * Primary application navigation with route-based active states and responsive design.
 */

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { ArrowLeft, CalendarDays, House, Shirt, Trophy } from "lucide-react";
import { useAppPathname } from "@gshl-hooks";
import {
  calculatePageScrollProgress,
  cn,
  getAppShellRouteContext,
} from "@gshl-utils";
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
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let frameId: number | null = null;

    const updateScrollProgress = () => {
      frameId = null;
      const { clientHeight, scrollHeight } = document.documentElement;
      const nextProgress = calculatePageScrollProgress(
        window.scrollY,
        scrollHeight,
        clientHeight,
      );

      setScrollProgress((currentProgress) =>
        currentProgress === nextProgress ? currentProgress : nextProgress,
      );
    };

    const scheduleScrollUpdate = () => {
      frameId ??= window.requestAnimationFrame(updateScrollProgress);
    };

    updateScrollProgress();
    window.addEventListener("scroll", scheduleScrollUpdate, { passive: true });
    window.addEventListener("resize", scheduleScrollUpdate);

    return () => {
      window.removeEventListener("scroll", scheduleScrollUpdate);
      window.removeEventListener("resize", scheduleScrollUpdate);
      if (frameId !== null) window.cancelAnimationFrame(frameId);
    };
  }, [pathname, search]);

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
  const mobileNavItems: LinkNavItemType[] = routeContext.backHref
    ? [
        {
          id: "back",
          label: "Back",
          href: routeContext.backHref,
          icon: <ArrowLeft className="h-5 w-5" aria-hidden="true" />,
        },
        ...navItems.slice(1),
      ]
    : navItems;

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-800 bg-slate-950 pt-[env(safe-area-inset-top)] text-white shadow-sm lg:hidden print:hidden">
        <div className="grid h-[var(--app-mobile-header-height)] grid-cols-[5rem_minmax(0,1fr)_5rem] items-center px-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))]">
          <Link
            href="/"
            aria-label="GSHL home"
            className="flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-xs font-bold tracking-wide focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
          >
            <Image
              src="/favicon.ico"
              alt=""
              aria-hidden="true"
              width={28}
              height={28}
              className="h-7 w-7 rounded-full bg-white object-contain"
              priority
            />
            <span>GSHL</span>
          </Link>
          <p className="truncate px-1 text-center text-sm font-bold">
            {routeContext.title}
          </p>
          <div className="flex justify-end">
            <AuthNavControl compact />
          </div>
        </div>
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-0.5 bg-slate-800"
        >
          <div
            className="h-full bg-white transition-[width] duration-100 motion-reduce:transition-none"
            style={{ width: `${scrollProgress}%` }}
          />
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
            <Image
              src="/favicon.ico"
              alt=""
              aria-hidden="true"
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-contain"
              priority
            />
            <span>GSHL</span>
          </Link>
          <div className="flex min-w-0 flex-1 items-stretch justify-around lg:hidden">
            {mobileNavItems.map((item) => (
              <LinkNavItem
                key={item.id}
                {...item}
                isActive={routeContext.activeNavId === item.id}
                className="h-full min-w-0 flex-1 flex-col gap-0.5 rounded-xl px-1 py-1 text-[11px]"
              />
            ))}
            <MoreNavigationMenu
              pathname={pathname}
              isActive={routeContext.activeNavId === "more"}
              placement="mobile"
            />
          </div>
          <div className="hidden min-w-0 flex-1 items-stretch justify-center gap-1 lg:flex">
            {navItems.map((item) => (
              <LinkNavItem
                key={item.id}
                {...item}
                isActive={routeContext.activeNavId === item.id}
                className="h-11 flex-none flex-row gap-2 px-3 py-2 text-sm"
              />
            ))}
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
