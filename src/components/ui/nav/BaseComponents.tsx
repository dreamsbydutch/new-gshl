/**
 * Base Navigation Components
 *
 * Core building blocks for navigation interfaces with standardized styling,
 * behavior, and accessibility features across the application.
 */

import { type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@gshl-utils";
import type { LinkNavItem } from "@gshl-types";

interface ClickableNavItemProps {
  id: string;
  label: string;
  icon?: ReactNode | string;
  isActive?: boolean;
  isDisabled?: boolean;
  onClick: () => void;
  className?: string;
}

interface NavContainerProps {
  children: ReactNode;
  className?: string;
  position?: "top" | "bottom" | "secondary" | "tertiary";
  variant?: "primary" | "secondary" | "tertiary";
}

/**
 * Clickable navigation item component
 * @param props - Component props
 * @returns Clickable navigation item with accessibility support
 */
export function ClickableNavItem({
  label,
  icon,
  isActive = false,
  isDisabled = false,
  onClick,
  className,
}: ClickableNavItemProps) {
  return (
    <div
      onClick={isDisabled ? undefined : onClick}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm transition-colors",
        isActive
          ? "bg-blue-100 text-blue-700"
          : "text-gray-700 hover:bg-gray-100",
        isDisabled && "cursor-not-allowed opacity-50",
        className,
      )}
      role="button"
      tabIndex={isDisabled ? -1 : 0}
      aria-disabled={isDisabled}
      onKeyDown={(e) => {
        if (!isDisabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick();
        }
      }}
    >
      {typeof icon === "string" ? (
        <Image
          src={icon}
          alt={`${label} icon`}
          width={20}
          height={20}
          className="h-5 w-5"
        />
      ) : (
        icon
      )}
      <span>{label}</span>
    </div>
  );
}

/**
 * Link navigation item component with Next.js routing
 * @param props - Component props
 * @returns Link-based navigation item with responsive design
 */
export function LinkNavItem({
  label,
  icon,
  href,
  isActive = false,
  className,
}: LinkNavItem) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2 rounded-lg p-1.5 text-sm transition-colors",
        href === "/" && "p-0.5",
        isActive ? "bg-primary text-white" : "text-gray-700 hover:bg-gray-100",
        className,
      )}
    >
      {typeof icon === "string" ? (
        <Image
          src={icon}
          alt={`${label} icon`}
          width={32}
          height={32}
          className={cn(
            "h-10 w-10 transition-all duration-200",
            isActive && "brightness-0 invert",
            href === "/" && "h-12 w-12",
          )}
        />
      ) : (
        icon
      )}
      {label && <span className="hidden sm:inline">{label}</span>}
    </Link>
  );
}

/**
 * Navigation container component with positioning and styling variants
 * @param props - Component props
 * @returns Navigation container with fixed positioning and styling
 */
export function NavContainer({
  children,
  className,
  position = "bottom",
  variant = "primary",
}: NavContainerProps) {
  const baseClasses =
    "fixed flex items-center justify-center transition-all duration-200 shadow-lg";

  const positionClasses = {
    top: "top-0 left-0 right-0",
    bottom: "bottom-0 left-0 right-0",
    secondary: "bottom-14 left-0 right-0",
    tertiary: "bottom-24 left-0 right-0",
  };

  const variantClasses = {
    primary: "bg-white border-t h-14 z-50",
    secondary: "bg-gray-100 border-t h-10 z-20",
    tertiary: "bg-gray-100 border-t h-7 text-sm z-10",
  };

  return (
    <div
      className={cn(
        baseClasses,
        positionClasses[position],
        variantClasses[variant],
        className,
      )}
    >
      {children}
    </div>
  );
}
