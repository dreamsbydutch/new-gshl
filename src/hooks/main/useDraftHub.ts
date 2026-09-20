"use client";

import { useQuery } from "convex/react";
import { HOME_MOCK_DRAFT_PREVIEW_LIMIT } from "@gshl-utils";
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
} {
  const { seasonId, enabled = true } = options;
  const result = useQuery(
    api.draft.status,
    enabled && seasonId ? { seasonId: seasonId as Id<"seasons"> } : "skip",
  );
  return {
    data: result,
    isLoading: enabled && Boolean(seasonId) && result === undefined,
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

export function useMockDraftPreview(seasonId: string) {
  const result = useQuery(
    api.frontend.mockDraftPreview,
    seasonId
      ? {
          seasonId: seasonId as Id<"seasons">,
          take: HOME_MOCK_DRAFT_PREVIEW_LIMIT,
        }
      : "skip",
  );
  return {
    isLoading: Boolean(seasonId) && result === undefined,
    nhlTeams: result?.nhlTeams ?? [],
    projectedDraftPicks: result?.projectedDraftPicks ?? [],
  };
}
