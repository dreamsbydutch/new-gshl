"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  WeeklyEdition,
  WeeklyEditionRevision,
  WeeklyEditionQueryState,
} from "@gshl-types";
import { useAppMutation } from "./useAppMutation";

export function useLatestWeeklyEdition(): WeeklyEditionQueryState<WeeklyEdition | null> {
  const data = useQuery(api.weeklyEditions.latestPublished, {});
  return {
    data,
    isLoading: data === undefined,
  };
}

export function useWeeklyEditionArchive(
  seasonId?: string,
): WeeklyEditionQueryState<WeeklyEdition[]> {
  const data = useQuery(api.weeklyEditions.publishedArchive, {
    seasonId: seasonId as Id<"seasons"> | undefined,
    limit: 100,
  });
  return {
    data,
    isLoading: data === undefined,
  };
}

export function useWeeklyEdition(editionId: string) {
  const data = useQuery(
    api.weeklyEditions.publishedById,
    editionId ? { editionId: editionId as Id<"weeklyEditions"> } : "skip",
  );
  return {
    data: data as WeeklyEdition | null | undefined,
    isLoading: Boolean(editionId) && data === undefined,
  };
}

export function useWeeklyEditionNewsroom(editionId?: string) {
  const editions = useQuery(api.weeklyEditions.newsroom, {});
  const prompt = useQuery(
    api.weeklyEditions.prompt,
    editionId ? { editionId: editionId as Id<"weeklyEditions"> } : "skip",
  );
  const revisions = useQuery(
    api.weeklyEditions.revisions,
    editionId ? { editionId: editionId as Id<"weeklyEditions"> } : "skip",
  );
  return {
    editions: editions as WeeklyEdition[] | undefined,
    prompt,
    revisions: revisions as WeeklyEditionRevision[] | undefined,
    isLoading: editions === undefined,
    generateHistorical: useAppMutation(api.weeklyEditions.generateHistorical),
    publishImport: useAppMutation(api.weeklyEditions.publishImport),
    updateManual: useAppMutation(api.weeklyEditions.updateManual),
    setVisibility: useAppMutation(api.weeklyEditions.setVisibility),
    setHomeActive: useAppMutation(api.weeklyEditions.setHomeActive),
    setSectionActive: useAppMutation(api.weeklyEditions.setSectionActive),
    restoreRevision: useAppMutation(api.weeklyEditions.restoreRevision),
  };
}
