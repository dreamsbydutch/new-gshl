import { clientApi as api } from "@gshl-trpc";
import type { UseTeamAwardsOptions } from "@gshl-types";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

export function useTeamAwards(options: UseTeamAwardsOptions = {}) {
  const { enabled = true, orderBy, ...filters } = options;
  const where = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  );
  const query = api.teamAward.getAll.useQuery(
    {
      ...(Object.keys(where).length > 0 ? { where } : {}),
      ...(orderBy ? { orderBy } : {}),
    },
    {
      enabled,
      staleTime: DAY_IN_MS,
      gcTime: DAY_IN_MS,
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
    },
  );

  return {
    data: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ?? null,
  };
}
