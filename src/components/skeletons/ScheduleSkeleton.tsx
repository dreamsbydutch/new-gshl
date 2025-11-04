/**
 * ScheduleSkeleton Component
 *
 * Loading skeleton for the schedule page matchup list. Displays multiple
 * placeholder cards while matchup data is being fetched, providing visual
 * feedback during the loading state.
 *
 * Features:
 * - 5 placeholder matchup cards
 * - Team logo placeholders (circular)
 * - Animated pulse effect
 * - Score and metadata placeholders
 * - Responsive card layout
 *
 * @example
 * ```tsx
 * {isLoading && <ScheduleSkeleton />}
 * ```
 */

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * MatchupCardSkeleton Component
 *
 * Individual matchup card placeholder with team logos and score section
 */
const MatchupCardSkeleton = () => (
  <div className="animate-pulse rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
    {/* Header with date and status */}
    <div className="mb-3 flex items-center justify-between">
      <div className="h-4 w-24 rounded bg-gray-200"></div>
      <div className="h-4 w-16 rounded bg-gray-200"></div>
    </div>

    {/* Matchup content */}
    <div className="flex items-center justify-between">
      {/* Home team */}
      <div className="flex items-center space-x-3">
        <div className="h-12 w-12 rounded-full bg-gray-200"></div>
        <div>
          <div className="mb-1 h-5 w-32 rounded bg-gray-200"></div>
          <div className="h-3 w-20 rounded bg-gray-200"></div>
        </div>
      </div>

      {/* Score */}
      <div className="text-center">
        <div className="mx-auto h-6 w-16 rounded bg-gray-200"></div>
      </div>

      {/* Away team */}
      <div className="flex items-center space-x-3">
        <div>
          <div className="mb-1 h-5 w-32 rounded bg-gray-200"></div>
          <div className="h-3 w-20 rounded bg-gray-200"></div>
        </div>
        <div className="h-12 w-12 rounded-full bg-gray-200"></div>
      </div>
    </div>
  </div>
);

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function ScheduleSkeleton() {
  return (
    <div className="mx-2 mb-40 mt-4 space-y-4">
      {Array.from({ length: 5 }, (_, i) => (
        <MatchupCardSkeleton key={i} />
      ))}
    </div>
  );
}
