"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  WeeklyEdition,
  WeeklyEditionArchiveSummary,
  WeeklyEditionHomeSummary,
  WeeklyEditionNewsroomSummary,
  WeeklyEditionQueryState,
  WeeklyEditionReaderDetail,
  WeeklyEditionRevisionSummary,
} from "@gshl-types";
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
    isLoading: editions === undefined,
    isEditionLoading: Boolean(editionId) && selectedEdition === undefined,
    generateHistorical: useAppMutation(api.weeklyEditions.generateHistorical),
    publishImport: useAppMutation(api.weeklyEditions.publishImport),
    updateManual: useAppMutation(api.weeklyEditions.updateManual),
    setVisibility: useAppMutation(api.weeklyEditions.setVisibility),
    setHomeActive: useAppMutation(api.weeklyEditions.setHomeActive),
    setSectionActive: useAppMutation(api.weeklyEditions.setSectionActive),
    restoreRevision: useAppMutation(api.weeklyEditions.restoreRevision),
  };
}
