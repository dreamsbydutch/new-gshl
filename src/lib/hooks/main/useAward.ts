import { clientApi as api } from "@gshl-trpc";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface UseAwardsOptions {
  awardId?: string;
  winnerId?: string;
  seasonId?: string;
  award?: string;
  enabled?: boolean;
  orderBy?: Record<string, "asc" | "desc">;
}

export function useAwards(options: UseAwardsOptions = {}) {
  const {
    awardId,
    winnerId,
    seasonId,
    award,
    enabled = true,
    orderBy,
  } = options;

  const where: Record<string, unknown> = {};
  if (awardId) where.id = awardId;
  if (winnerId) where.winnerId = winnerId;
  if (seasonId) where.seasonId = seasonId;
  if (award) where.award = award;

  const query = api.award.getAll.useQuery(
    {
      ...(Object.keys(where).length > 0 ? { where } : {}),
      ...(orderBy ? { orderBy } : {}),
    },
    {
      enabled,
      staleTime: DAY_IN_MS,
      gcTime: DAY_IN_MS,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchInterval: false,
      refetchIntervalInBackground: false,
    },
  );

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
