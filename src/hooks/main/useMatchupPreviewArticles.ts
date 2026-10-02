"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";

export function useMatchupPreviewArticles(matchupId: string) {
  return useQuery(api.matchupPreviews.forMatchup, { matchupId }) ?? [];
}
