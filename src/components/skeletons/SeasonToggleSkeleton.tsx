/**
 * SeasonToggleSkeleton Component
 *
 * Loading skeleton for the season toggle/selector component.
 * Displays a placeholder while season data is being fetched.
 *
 * Features:
 * - Compact rectangular placeholder
 * - Matches season toggle dimensions
 * - Animated shimmer effect
 *
 * @example
 * ```tsx
 * {!seasonsReady && <SeasonToggleSkeleton />}
 * ```
 */

import { Skeleton } from "../ui/skeleton";

export function SeasonToggleSkeleton() {
  return <Skeleton className="mr-4 h-6 w-28" />;
}
