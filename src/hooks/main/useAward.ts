import type { UseAwardsOptions } from "@gshl-types";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Awards } from "@gshl-types";

/**
 * Fetches awards with optional filters and stable long-lived caching because
 * award data changes infrequently.
 */
export function useAwards(options: UseAwardsOptions = {}) {
  const {
    awardId,
    winnerId,
    seasonId,
    award,
    enabled = true,
    orderBy,
  } = options;

  const where: Record<string, string> = {};
  if (awardId) where.id = awardId;
  if (winnerId) where.winnerId = winnerId;
  if (seasonId) where.seasonId = seasonId;
  if (award) where.award = award;

  const data = useQuery(
    api.frontend.awards,
    enabled
      ? {
      ...(Object.keys(where).length > 0 ? { where } : {}),
      ...(orderBy ? { orderBy } : {}),
        }
      : "skip",
  );

  return {
    data: (data ?? []) as unknown as Awards[],
    isLoading: enabled && data === undefined,
    error: null,
  };
}
