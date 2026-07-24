import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { UseTeamAwardsOptions } from "@gshl-types";
import type { TeamAward } from "@gshl-types";

export function useTeamAwards(options: UseTeamAwardsOptions = {}) {
  const { enabled = true, orderBy, ...filters } = options;
  const where = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  );
  const data = useQuery(
    api.frontend.teamAwards,
    enabled
      ? {
      ...(Object.keys(where).length > 0 ? { where } : {}),
      ...(orderBy ? { orderBy } : {}),
        }
      : "skip",
  );

  return {
    data: (data ?? []) as unknown as TeamAward[],
    isLoading: enabled && data === undefined,
    error: null,
  };
}
