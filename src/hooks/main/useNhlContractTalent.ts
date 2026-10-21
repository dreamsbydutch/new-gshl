"use client";

import { useMemo } from "react";
import { useQueries, useQuery } from "convex/react";
import type { NhlContractTalentPopulation } from "../../lib/types/nhl-contract-talent-view";
import { api } from "../../../convex/_generated/api";

/** One bounded, reactive season read, shared by every contract for that player. */
export function useNhlContractTalent() {
  const seasons = useQuery(api.nhlContractAnalytics.rosterSeasons, {});
  const requests = useMemo(
    () =>
      Object.fromEntries(
        (seasons ?? []).map((season) => [
          season.id,
          {
            query: api.nhlContractAnalytics.talentSeason,
            args: { seasonId: season.id },
          },
        ]),
      ),
    [seasons],
  );
  const results = useQueries(requests);
  const { populations, error, pending } = useMemo(() => {
    const populations: NhlContractTalentPopulation[] = [];
    let error: string | null = null,
      pending = 0;
    for (const result of Object.values(results)) {
      if (result instanceof Error) error = result.message;
      else if (result === undefined) pending++;
      else populations.push(result as NhlContractTalentPopulation);
    }
    return { populations, error, pending };
  }, [results]);
  return {
    populations,
    error,
    isLoading: seasons === undefined || pending > 0,
    loadedSeasons: populations.length,
    totalSeasons: seasons?.length ?? 0,
  };
}
