import { api } from "src/trpc/react";

export function useAllPlayers() {
  return api.player.getAll.useQuery({});
}