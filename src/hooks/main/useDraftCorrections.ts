"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useAppMutation } from "./useAppMutation";

export function useDraftCorrections(seasonId: string, pickId?: string) {
  const data = useQuery(
    api.draft.adminPicks,
    seasonId ? { seasonId: seasonId as Id<"seasons"> } : "skip",
  );
  const history = useQuery(
    api.draft.correctionHistory,
    pickId ? { pickId: pickId as Id<"draftPicks"> } : "skip",
  );
  const mutation = useAppMutation(api.draft.correctPicks);
  return { data, history, ...mutation };
}
