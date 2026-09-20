"use client";

import { useCallback, useMemo } from "react";
import type { FunctionArgs } from "convex/server";
import { useQueries, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  WeeklyEdition,
  WeeklyEditionAiStatus,
  WeeklyEditionArchiveSummary,
  WeeklyEditionHomeSummary,
  WeeklyEditionNewsroomSummary,
  WeeklyEditionQueryState,
  WeeklyEditionReaderDetail,
  WeeklyEditionRevisionSummary,
} from "@gshl-types";
import { useAppAction } from "./useAppAction";
import { useDomainMutation } from "./useDomainMutation";

export function useLatestWeeklyEdition(): WeeklyEditionQueryState<WeeklyEditionHomeSummary | null> {
  const data = useQuery(api.weeklyEditions.latestPublished, {});
  return {
    data,
    isLoading: data === undefined,
  };
}

export function useWeeklyEditionArchive(
  seasonId?: string,
): WeeklyEditionQueryState<WeeklyEditionArchiveSummary[]> {
  const data = useQuery(api.weeklyEditions.publishedArchive, {
    seasonId: seasonId as Id<"seasons"> | undefined,
    limit: 100,
  });
  return {
    data,
    isLoading: data === undefined,
  };
}

export function useWeeklyEdition(
  editionId: string,
): WeeklyEditionQueryState<WeeklyEditionReaderDetail | null> {
  const data = useQuery(
    api.weeklyEditions.publishedById,
    editionId ? { editionId: editionId as Id<"weeklyEditions"> } : "skip",
  );
  return {
    data,
    isLoading: Boolean(editionId) && data === undefined,
  };
}

export function useWeeklyEditionNewsroom(editionId?: string) {
  // Optional AI capabilities must not take down the manual editor when the
  // frontend is ahead of the deployed backend. useQueries returns errors
  // as values and keeps the subscription alive for backend recovery.
  const aiQueryRequest = useMemo(
    () => ({
      aiStatus: { query: api.weeklyEditions.aiStatus, args: {} },
    }),
    [],
  );
  const aiQueries = useQueries(aiQueryRequest);
  const aiResult = aiQueries.aiStatus as
    | WeeklyEditionAiStatus
    | Error
    | undefined;
  const isAiStatusUnavailable = aiResult instanceof Error;
  const aiStatus = aiResult instanceof Error ? undefined : aiResult;
  const editions: WeeklyEditionNewsroomSummary[] | undefined = useQuery(
    api.weeklyEditions.newsroom,
    {},
  );
  const selectedEdition = useQuery(
    api.weeklyEditions.newsroomById,
    editionId ? { editionId: editionId as Id<"weeklyEditions"> } : "skip",
  );
  const revisions: WeeklyEditionRevisionSummary[] | undefined = useQuery(
    api.weeklyEditions.revisions,
    editionId ? { editionId: editionId as Id<"weeklyEditions"> } : "skip",
  );
  const aiGeneration = useAppAction(api.weeklyEditions.generateWithAi);
  const executeAiGeneration = aiGeneration.mutateAsync;
  const generateWithAi = useCallback(
    (
      args: Omit<
        FunctionArgs<typeof api.weeklyEditions.generateWithAi>,
        "seasonId" | "weekId"
      > & { seasonId: string; weekId: string },
    ) =>
      executeAiGeneration({
        ...args,
        seasonId: args.seasonId as Id<"seasons">,
        weekId: args.weekId as Id<"weeks">,
      }),
    [executeAiGeneration],
  );
  return {
    editions,
    selectedEdition: selectedEdition as WeeklyEdition | null | undefined,
    revisions,
    aiStatus,
    isLoading: editions === undefined,
    isAiStatusLoading: aiResult === undefined,
    isAiStatusUnavailable,
    isEditionLoading: Boolean(editionId) && selectedEdition === undefined,
    generateWithAi: { ...aiGeneration, mutateAsync: generateWithAi },
    generateHistorical: useDomainMutation(
      api.weeklyEditions.generateHistorical,
      (
        args: Omit<
          FunctionArgs<typeof api.weeklyEditions.generateHistorical>,
          "seasonId" | "weekId"
        > & { seasonId: string; weekId: string },
      ) => ({
        ...args,
        seasonId: args.seasonId as Id<"seasons">,
        weekId: args.weekId as Id<"weeks">,
      }),
    ),
    publishImport: useDomainMutation(
      api.weeklyEditions.publishImport,
      (
        args: Omit<
          FunctionArgs<typeof api.weeklyEditions.publishImport>,
          "editionId"
        > & { editionId: string },
      ) => ({ ...args, editionId: args.editionId as Id<"weeklyEditions"> }),
    ),
    updateManual: useDomainMutation(
      api.weeklyEditions.updateManual,
      (
        args: Omit<
          FunctionArgs<typeof api.weeklyEditions.updateManual>,
          "editionId"
        > & { editionId: string },
      ) => ({ ...args, editionId: args.editionId as Id<"weeklyEditions"> }),
    ),
    setVisibility: useDomainMutation(
      api.weeklyEditions.setVisibility,
      (
        args: Omit<
          FunctionArgs<typeof api.weeklyEditions.setVisibility>,
          "editionId"
        > & { editionId: string },
      ) => ({ ...args, editionId: args.editionId as Id<"weeklyEditions"> }),
    ),
    setHomeActive: useDomainMutation(
      api.weeklyEditions.setHomeActive,
      (args: { editionId?: string }) =>
        args as FunctionArgs<typeof api.weeklyEditions.setHomeActive>,
    ),
    setSectionActive: useDomainMutation(
      api.weeklyEditions.setSectionActive,
      (
        args: Omit<
          FunctionArgs<typeof api.weeklyEditions.setSectionActive>,
          "editionId"
        > & { editionId: string },
      ) => ({ ...args, editionId: args.editionId as Id<"weeklyEditions"> }),
    ),
    restoreRevision: useDomainMutation(
      api.weeklyEditions.restoreRevision,
      (
        args: Omit<
          FunctionArgs<typeof api.weeklyEditions.restoreRevision>,
          "revisionId"
        > & { revisionId: string },
      ) => ({
        ...args,
        revisionId: args.revisionId as Id<"weeklyEditionRevisions">,
      }),
    ),
  };
}
