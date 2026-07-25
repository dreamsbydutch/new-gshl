/**
 * Skeleton Component
 *
 * Loading skeleton component with pulse animation for placeholder content.
 */

import { cn } from "@gshl-utils";

/**
 * Skeleton component for loading states
 * @param props - Standard HTML div props with optional className
 * @returns Animated skeleton placeholder
 */
function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse rounded-md bg-primary/10 motion-reduce:animate-none",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
