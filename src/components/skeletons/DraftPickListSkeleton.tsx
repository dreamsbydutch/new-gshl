/**
 * DraftPickListSkeleton Component
 *
 * Loading skeleton displayed while draft pick data is being fetched.
 * Shows a centered placeholder bar representing a draft pick entry.
 *
 * Features:
 * - Animated shimmer effect
 * - Responsive width (75% of container)
 * - Centered alignment
 *
 * @example
 * ```tsx
 * {isLoading && <DraftPickListSkeleton />}
 * ```
 */

import { Skeleton } from "../ui/skeleton";

export function DraftPickListSkeleton() {
  return <Skeleton className="mx-auto my-2 h-6 w-3/4" />;
}
