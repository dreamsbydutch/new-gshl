/**
 * TeamsToggleSkeleton Component
 *
 * Loading skeleton for the teams toggle/navigation bar. Displays a fixed
 * bottom navigation bar with placeholder team logo buttons while team
 * data is being fetched.
 *
 * Features:
 * - Fixed bottom positioning
 * - 10 team logo placeholders
 * - Matches navigation bar styling
 * - Animated shimmer effect on each logo
 * - Responsive horizontal layout with shadows
 *
 * @example
 * ```tsx
 * {!teamsReady && <TeamsToggleSkeleton />}
 * ```
 */

import { cn } from "@gshl-utils";
import { Skeleton } from "../ui/skeleton";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * TeamLogoSkeleton Component
 *
 * Individual team logo placeholder button
 */
const TeamLogoSkeleton = () => (
  <Skeleton className="mx-1 my-0.5 h-8 w-8 rounded-md bg-gray-300" />
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function TeamsToggleSkeleton() {
  return (
    <div
      className={cn(
        "fixed bottom-14 left-0 right-0 z-30 mx-auto flex h-10 w-full flex-row bg-gray-200 px-2 shadow-nav",
      )}
    >
      {Array(10)
        .fill(1)
        .map((_, i) => (
          <TeamLogoSkeleton key={i} />
        ))}
    </div>
  );
}
