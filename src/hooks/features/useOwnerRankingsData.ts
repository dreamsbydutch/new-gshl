"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

import type { OwnerRankingsBrowserViewModel } from "@gshl-types";

const EMPTY_OWNER_RANKINGS: OwnerRankingsBrowserViewModel = {
  rankings: [],
};

export function useOwnerRankingsData() {
  const result = useQuery(api.frontend.ownerRankings, {});

  return {
    data: result ?? EMPTY_OWNER_RANKINGS,
    isLoading: result === undefined,
    error: null,
  };
}
