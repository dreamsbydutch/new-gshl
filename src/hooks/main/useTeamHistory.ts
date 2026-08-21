"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  TeamHistoryPayload,
  UseTeamHistorySummaryOptions,
} from "@gshl-types";

const EMPTY_TEAM_HISTORY: TeamHistoryPayload = {
  matchups: [],
  teams: [],
  weeks: [],
  seasons: [],
};

/** Loads one owner's indexed, public team-history projection. */
export function useTeamHistorySummary({
  ownerId,
  enabled = true,
}: UseTeamHistorySummaryOptions) {
  const hasScope = enabled && Boolean(ownerId);
  const result = useQuery(
    api.teamHistory.byOwner,
    hasScope ? { ownerId: ownerId as Id<"owners"> } : "skip",
  );
  const data = (result ?? EMPTY_TEAM_HISTORY) as unknown as TeamHistoryPayload;

  return {
    data,
    isLoading: hasScope && result === undefined,
    error: null,
    ready: !hasScope || result !== undefined,
  };
}
