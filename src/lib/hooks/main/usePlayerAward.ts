import { clientApi as api } from "@gshl-trpc";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export interface UsePlayerAwardsOptions {
  playerId?: string;
  gshlTeamId?: string;
  seasonId?: string;
  award?: string;
  enabled?: boolean;
  orderBy?: Record<string, "asc" | "desc">;
}

export function usePlayerAwards(options: UsePlayerAwardsOptions = {}) {
  const { enabled = true, orderBy, ...filters } = options;
  const where = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  );
  const query = api.playerAward.getAll.useQuery(
    {
      ...(Object.keys(where).length ? { where } : {}),
      ...(orderBy ? { orderBy } : {}),
    },
    {
      enabled,
      staleTime: DAY_IN_MS,
      gcTime: DAY_IN_MS,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
    },
  );

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
