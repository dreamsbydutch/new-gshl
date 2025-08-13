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
      icon: "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPUlYN16LenlwB8jrUW0c12o5NM39iGduZPVHy",
    },
    {
      id: "schedule",
      label: "Schedule",
      href: "/schedule",
      icon: "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPs04OIzdLR9ueY0X1NhCqQOSWadyrJxT3A2Fj",
    },
    {
      id: "standings",
      label: "Standings",
      href: "/standings",
      icon: "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPiectEHnCYyHDkF5T4S9ctKIqur7Lomb6zPjZ",
    },
    {
      id: "lockerroom",
      label: "Locker Room",
      href: "/lockerroom",
      icon: "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPLyrpNZeCT8iDGR3lYbs7e6nujtdHEZJpXg1B",
    },
    {
      id: "leagueoffice",
      label: "League Office",
      href: "/leagueoffice",
      icon: "https://jn9n1jxo7g.ufs.sh/f/94GU8p0EVxqPqRHfkoWc94CkgwWOzBQ5iATa0py2DdXlMIUH",
    },
  ];

  return (
    <NavContainer position="bottom" variant="primary">
      <div
        className={cn(
          className,
          "fixed bottom-0 z-20 flex w-full items-center justify-evenly bg-gray-200 shadow-inv",
          "lg:top-0 lg:justify-center lg:gap-8 lg:px-4 lg:py-2 xl:gap-14",
          "h-[55px] text-center",
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
