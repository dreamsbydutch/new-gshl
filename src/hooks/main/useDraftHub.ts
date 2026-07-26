"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { UseDraftHubStateOptions } from "@gshl-types";
import { useAppMutation } from "./useAppMutation";

export function useDraftHubState(options: UseDraftHubStateOptions = {}) {
  const { seasonId, enabled = true } = options;
  const result = useQuery(
    api.draft.state,
    enabled && seasonId ? { seasonId: seasonId as Id<"seasons"> } : "skip",
  );
  return {
    data: result,
    isLoading: enabled && Boolean(seasonId) && result === undefined,
    error: null,
  };
}

export function useSubmitDraftPick() {
  return useAppMutation(api.draft.submitPick);
}
