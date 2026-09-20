"use client";

import { useOwnerRankings } from "../main/useOwnerRankings";

import type { OwnerRankingsBrowserViewModel } from "@gshl-types";

const EMPTY_OWNER_RANKINGS: OwnerRankingsBrowserViewModel = {
  rankings: [],
};

export function useOwnerRankingsData() {
  const { data: result, isLoading } = useOwnerRankings();

  return {
    data: result ?? EMPTY_OWNER_RANKINGS,
    isLoading,
  };
}
