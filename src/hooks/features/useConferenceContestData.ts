"use client";

import { useConferenceContestView } from "../main";

/**
 * Returns the server-derived Conference Contest view without raw history.
 */
export function useConferenceContestData() {
  const query = useConferenceContestView();

  return {
    overall: query.data?.overall ?? null,
    seasons: query.data?.seasons ?? [],
    isLoading: query.isLoading,
    error: query.error,
    ready: !query.isLoading,
  };
}
