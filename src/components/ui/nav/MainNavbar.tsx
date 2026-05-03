"use client";

/**
 * Main Navigation Bar Component
 *
 * Primary application navigation with route-based active states and responsive design.
 */

import { usePathname } from "next/navigation";
import { cn } from "@gshl-utils";
import { NavContainer, LinkNavItem } from "./BaseComponents";
import type { LinkNavItem as LinkNavItemType } from "@gshl-types";

interface NavbarProps {
  className?: string;
}

/**
 * Main navigation bar component with responsive design and active state detection
 * @param props - Component props
 * @returns Primary navigation bar with route-based active states
 */
export function Navbar({ className }: NavbarProps) {
  const pathname = usePathname();

  const navItems: LinkNavItemType[] = [
    {
      id: "home",
      label: "Home",
      href: "/",
      icon: "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMaxJjw04E3mwF7uVBU48DCS2OnLW9fcI0QiA5",
    },
    {
      id: "schedule",
      label: "Schedule",
      href: "/schedule",
      icon: "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMI7MWvQRNdPSmXIBgAbtWUyKaxRZHCfQYzp3l",
    },
    {
      id: "standings",
      label: "Standings",
      href: "/standings",
      icon: "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMuqdgVVUEFxzGnpeN7IBhDvwsJM8P6fLmXqCb",
    },
    {
      id: "lockerroom",
      label: "Locker Room",
      href: "/lockerroom",
      icon: "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMKD0Cm0ynvo3h1cd80KYVjsC6fXrutBw95TND",
    },
    {
      id: "leagueoffice",
      label: "League Office",
      href: "/leagueoffice",
      icon: "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMxA70fumSV4vn8XiNop25ErOBzWbPQtAfHj31",
    },
  ];

  return (
    <NavContainer position="bottom" variant="primary">
      <div
        className={cn(
          className,
          "fixed bottom-0 z-20 flex w-full items-center justify-evenly bg-gray-200 shadow-inv",
          "lg:bottom-auto lg:top-0 lg:justify-center lg:gap-8 lg:px-4 lg:py-2 xl:gap-14",
          "h-14 text-center",
        )}
      >
        {navItems.map((item) => (
          <LinkNavItem
            key={item.id}
            {...item}
            isActive={pathname === item.href}
          />
        ))}
      </div>
    </NavContainer>
  );
}
