"use client";

import { useNHLStandings } from "../main/useNHL";
import {
  buildNHLDivisionStandings,
  toNHLSeasonId,
} from "@gshl-utils/features/nhl";

export function useNHLHomeStandings(seasonYear: string | number) {
  const standings = useNHLStandings(toNHLSeasonId(seasonYear));
  return {
    ...standings,
    divisions: buildNHLDivisionStandings(standings.data?.standings ?? []),
  };
}
