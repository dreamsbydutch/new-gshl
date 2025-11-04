/**
 * TeamContractTableSkeleton Component
 *
 * Loading skeleton for the team contract table component.
 * Displays a placeholder while contract table data is being fetched.
 *
 * Features:
 * - Compact rectangular placeholder
 * - Matches contract table dimensions
 * - Animated shimmer effect
 *
 * @example
 * ```tsx
 * {isLoading && <TeamContractTableSkeleton />}
 * ```
 */

import { Skeleton } from "../ui/skeleton";

export function TeamContractTableSkeleton() {
  return <Skeleton className="mr-4 h-6 w-28" />;
}
