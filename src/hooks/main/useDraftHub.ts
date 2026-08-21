"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  DraftHubStatusData,
  UseDraftHubStateOptions,
  UseDraftHubStatusOptions,
} from "@gshl-types";
import { useAppMutation } from "./useAppMutation";

export function useDraftHubStatus(options: UseDraftHubStatusOptions = {}): {
  data: DraftHubStatusData | undefined;
  isLoading: boolean;
  error: null;
} {
  const { seasonId, enabled = true } = options;
  const result = useQuery(
    api.draft.status,
    enabled && seasonId ? { seasonId: seasonId as Id<"seasons"> } : "skip",
  );
  return {
    data: result,
    isLoading: enabled && Boolean(seasonId) && result === undefined,
    error: null,
  };
}

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

export function useUndoDraftPick() {
  return useAppMutation(api.draft.undoPick);
}
