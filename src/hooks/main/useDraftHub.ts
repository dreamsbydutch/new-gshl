"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  DraftHubStatusData,
  UseDraftHubStateOptions,
  UseDraftHubStatusOptions,
} from "@gshl-types";
import { useDomainMutation } from "./useDomainMutation";

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
  return useDomainMutation(
    api.draft.submitPick,
    (args: { seasonId: string; pickId: string; playerId: string }) => ({
      ...args,
      seasonId: args.seasonId as Id<"seasons">,
      pickId: args.pickId as Id<"draftPicks">,
      playerId: args.playerId as Id<"players">,
    }),
  );
}

export function useUndoDraftPick() {
  return useDomainMutation(
    api.draft.undoPick,
    (args: { seasonId: string; pickId: string }) => ({
      ...args,
      seasonId: args.seasonId as Id<"seasons">,
      pickId: args.pickId as Id<"draftPicks">,
    }),
  );
}

export function useSetDraftTeamMode() {
  return useDomainMutation(
    api.draft.setTeamMode,
    (args: { teamId: string; auto: boolean }) => ({
      ...args,
      teamId: args.teamId as Id<"teams">,
    }),
  );
}
