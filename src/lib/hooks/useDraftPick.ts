import { api } from "src/trpc/react";

export function useAllDraftPicks() {
  return api.draftPick.getAll.useQuery({});
}
