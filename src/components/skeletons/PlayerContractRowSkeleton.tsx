/**
 * PlayerContractRowSkeleton Component
 *
 * Loading skeleton for a single player contract row in the contract table.
 * Displays a placeholder while contract data is being fetched or processed.
 *
 * Features:
 * - Compact horizontal bar
 * - Matches contract row dimensions
 * - Accepts contract prop for potential future use (currently unused)
 *
 * @example
 * ```tsx
 * {isLoading && <PlayerContractRowSkeleton contract={contract} />}
 * ```
 */

import type { PlayerContractRowSkeletonProps } from "@gshl-types";
import { Skeleton } from "../ui/SkeletonPrimitive";

export function PlayerContractRowSkeleton({
  contract: _contract,
}: PlayerContractRowSkeletonProps) {
  return <Skeleton className="mr-4 h-6 w-28" />;
}
