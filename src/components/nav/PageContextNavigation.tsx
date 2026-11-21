import { cn } from "@gshl-utils";
import type { PageContextNavigationProps } from "@gshl-types";

/** Keeps page-level controls together in one sticky, scroll-safe surface. */
export function PageContextNavigation({
  children,
  ariaLabel,
  className,
  mobileRows = 1,
}: PageContextNavigationProps) {
  return (
    <nav
      aria-label={ariaLabel}
      data-page-context-rows={mobileRows}
      className={cn(
        "sticky top-[calc(var(--app-mobile-header-height)+env(safe-area-inset-top))] z-40 border-b border-slate-200 bg-white/95 backdrop-blur lg:top-[calc(var(--app-primary-nav-height)+env(safe-area-inset-top))] print:hidden",
        className,
      )}
    >
      {children}
    </nav>
  );
}
