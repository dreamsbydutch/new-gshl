"use client";

import { useEffect, useState } from "react";
import { toLocalIsoDateOnly } from "@gshl-utils/core/date";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

export function usePowerRankingsPreview(
  seasonId?: string,
  take = 8,
  weekId?: string,
) {
  const [referenceDate, setReferenceDate] = useState<string>();
  useEffect(() => {
    if (!weekId) return;
    const refresh = () => setReferenceDate(toLocalIsoDateOnly(new Date()));
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [weekId]);
  const result = useQuery(
    api.frontend.powerRankingsPreview,
    seasonId && (!weekId || referenceDate)
      ? {
          seasonId: seasonId as Id<"seasons">,
          take,
          ...(weekId ? { weekId: weekId as Id<"weeks">, referenceDate } : {}),
        }
      : "skip",
  );

  return {
    data: result,
    isLoading: Boolean(seasonId) && result === undefined,
    error: null,
  };
}
