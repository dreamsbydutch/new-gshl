"use client";

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
import { useAppMutation } from "./useAppMutation";

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
  const aiQueries = useQueries({
    aiStatus: { query: api.weeklyEditions.aiStatus, args: {} },
  });
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
  return {
    editions,
    selectedEdition: selectedEdition as WeeklyEdition | null | undefined,
    revisions,
    aiStatus,
    isLoading: editions === undefined,
    isAiStatusLoading: aiResult === undefined,
    isAiStatusUnavailable,
    isEditionLoading: Boolean(editionId) && selectedEdition === undefined,
    generateWithAi: useAppAction(api.weeklyEditions.generateWithAi),
    generateHistorical: useAppMutation(api.weeklyEditions.generateHistorical),
    publishImport: useAppMutation(api.weeklyEditions.publishImport),
    updateManual: useAppMutation(api.weeklyEditions.updateManual),
    setVisibility: useAppMutation(api.weeklyEditions.setVisibility),
    setHomeActive: useAppMutation(api.weeklyEditions.setHomeActive),
    setSectionActive: useAppMutation(api.weeklyEditions.setSectionActive),
    restoreRevision: useAppMutation(api.weeklyEditions.restoreRevision),
  };
}
