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

import type { Contract } from "@gshl-types";
import { Skeleton } from "../ui/skeleton";

export interface PlayerContractRowSkeletonProps {
  /** Contract data (currently unused, reserved for future enhancements) */
  contract: Contract;
}

export function PlayerContractRowSkeleton({
  contract: _contract,
}: PlayerContractRowSkeletonProps) {
  return <Skeleton className="mr-4 h-6 w-28" />;
}
