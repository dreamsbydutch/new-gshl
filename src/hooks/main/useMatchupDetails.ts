"use client";

import { useQuery } from "convex/react";

import { api } from "../../../convex/_generated/api";
import type { MatchupDetailsPayload } from "@gshl-types";

/** Loads the exact public payload for a single matchup details page. */
export function useMatchupDetails(matchupId: string) {
  const enabled = Boolean(matchupId);
  const result = useQuery(
    api.matchup.details,
    enabled ? { matchupId } : "skip",
  );
  const data: MatchupDetailsPayload | null = result ?? null;

  return {
    data,
    isLoading: enabled && result === undefined,
    error: null,
  };
}
