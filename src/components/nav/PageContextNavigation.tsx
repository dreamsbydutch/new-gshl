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
      data-page-context-single={mobileRows === 1 ? "" : undefined}
      data-page-context-double={mobileRows === 2 ? "" : undefined}
      className={cn(
        "fixed inset-x-0 bottom-[calc(var(--app-primary-nav-height)+env(safe-area-inset-bottom))] z-40 rounded-t-lg border-t border-slate-200 bg-white/95 shadow-[0_-2px_8px_rgba(15,23,42,0.08)] backdrop-blur lg:sticky lg:bottom-auto lg:top-[calc(var(--app-primary-nav-height)+env(safe-area-inset-top))] lg:rounded-none lg:border-b lg:border-t-0 lg:shadow-none print:hidden",
        className,
      )}
    >
      {children}
    </nav>
  );
}
