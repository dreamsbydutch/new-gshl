import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { UsePlayerAwardsOptions } from "@gshl-types";
import type { PlayerAward } from "@gshl-types";

export function usePlayerAwards(options: UsePlayerAwardsOptions = {}) {
  const { enabled = true, orderBy, ...filters } = options;
  const where = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value !== undefined),
  );
  const data = useQuery(
    api.frontend.playerAwards,
    enabled
      ? {
      ...(Object.keys(where).length > 0 ? { where } : {}),
      ...(orderBy ? { orderBy } : {}),
        }
      : "skip",
  );

  return {
    data: (data ?? []) as unknown as PlayerAward[],
    isLoading: enabled && data === undefined,
    error: null,
  };
}
