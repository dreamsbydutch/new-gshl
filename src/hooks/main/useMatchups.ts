"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Matchup, UseMatchupsOptions } from "@gshl-types";
import { normalizePlayoffMatchupOutcome } from "@gshl-utils/domain/matchup";

export function useMatchups(options: UseMatchupsOptions = {}) {
  const {
    matchupId,
    weekId,
    seasonId,
    orderBy = { seasonId: "asc" },
    enabled = true,
  } = options;
  const where: Record<string, unknown> = {};
  if (matchupId) where.id = String(matchupId);
  if (weekId) where.weekId = String(weekId);
  if (seasonId) where.seasonId = String(seasonId);
  const result = useQuery(
    api.frontend.matchups,
    enabled
      ? {
          ...(Object.keys(where).length ? { where } : {}),
          orderBy,
        }
      : "skip",
  );
  const data = ((result ?? []) as unknown as Matchup[]).map(
    normalizePlayoffMatchupOutcome,
  );
  return {
    data,
    isLoading: enabled && result === undefined,
    isFetching: enabled && result === undefined,
    error: null,
  };
}
