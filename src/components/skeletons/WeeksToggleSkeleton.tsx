/**
 * WeeksToggleSkeleton Component
 *
 * Loading skeleton for the weeks toggle/selector component.
 * Displays a placeholder while week data is being fetched.
 *
 * Features:
 * - Compact rectangular placeholder
 * - Matches weeks toggle dimensions
 * - Animated shimmer effect
 *
 * @example
 * ```tsx
 * {!weeksReady && <WeeksToggleSkeleton />}
 * ```
 */

import { Skeleton } from "../ui/skeleton";

export function WeeksToggleSkeleton() {
  return <Skeleton className="mr-4 h-6 w-28" />;
}
