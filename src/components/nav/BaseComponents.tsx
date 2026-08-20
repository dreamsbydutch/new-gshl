/**
 * Base Navigation Components
 *
 * Core building blocks for navigation interfaces with standardized styling,
 * behavior, and accessibility features across the application.
 */

import Link from "next/link";
import Image from "next/image";
import { cn } from "@gshl-utils";
import type {
  ClickableNavItemProps,
  LinkNavItem,
  NavContainerProps,
} from "@gshl-types";

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
    <button
      type="button"
      onClick={isDisabled ? undefined : onClick}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-2 rounded px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 motion-reduce:transition-none",
        isActive
          ? "bg-blue-100 text-blue-700"
          : "text-gray-700 hover:bg-gray-100",
        isDisabled && "cursor-not-allowed opacity-50",
        className,
      )}
      disabled={isDisabled}
      aria-disabled={isDisabled}
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
    </button>
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
  preserveIconColors = false,
  className,
}: LinkNavItem) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex min-h-11 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 motion-reduce:transition-none",
        isActive
          ? "bg-slate-900 text-white"
          : "text-slate-700 hover:bg-slate-100",
        className,
      )}
    >
      {typeof icon === "string" ? (
        <Image
          src={icon}
          alt=""
          aria-hidden="true"
          width={24}
          height={24}
          className={cn(
            "h-6 w-6 object-contain transition-all duration-200 motion-reduce:transition-none",
            isActive && !preserveIconColors && "brightness-0 invert",
          )}
        />
      ) : (
        icon
      )}
      {label && <span className="truncate">{label}</span>}
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
  ariaLabel = "Primary",
}: NavContainerProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cn(
        "fixed inset-x-0 bottom-0 z-50 flex items-center justify-center border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:bottom-auto lg:top-0 lg:border-b lg:border-t-0 lg:pb-0 lg:pt-[env(safe-area-inset-top)] lg:shadow-sm print:hidden",
        className,
      )}
    >
      {children}
    </nav>
  );
}
