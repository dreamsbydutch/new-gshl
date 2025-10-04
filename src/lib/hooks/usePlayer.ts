import { api, type RouterOutputs } from "src/trpc/react";

type AllPlayersQueryOptions = Parameters<typeof api.player.getAll.useQuery>[1];

type AllPlayersResult = ReturnType<typeof api.player.getAll.useQuery>;
type AllPlayersQueryResult = Omit<AllPlayersResult, "data"> & {
  data: AllPlayersData | undefined;
};

const DEFAULT_PLAYER_QUERY_OPTIONS = {
  staleTime: 0,
  refetchOnMount: "always" as const,
  refetchInterval: 60_000,
  refetchIntervalInBackground: true,
} satisfies AllPlayersQueryOptions;

export type AllPlayersData = RouterOutputs["player"]["getAll"];

export function useAllPlayers(
  options?: AllPlayersQueryOptions,
): AllPlayersQueryResult {
  const finalOptions: AllPlayersQueryOptions = options
    ? { ...DEFAULT_PLAYER_QUERY_OPTIONS, ...options }
    : DEFAULT_PLAYER_QUERY_OPTIONS;

  const query = api.player.getAll.useQuery({}, finalOptions);

  return {
    ...query,
    data: query.data as AllPlayersData | undefined,
  };
}
