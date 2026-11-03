"use client";

import { useEffect, useMemo, useState } from "react";
import { toLocalIsoDateOnly } from "@gshl-utils/core/date";
import { useQueries, type RequestForQueries } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

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
  const requests = useMemo<RequestForQueries>(
    (): RequestForQueries =>
      seasonId && (!weekId || referenceDate)
        ? {
            rankings: {
              query: api.frontend.powerRankingsPreview,
              args: {
                seasonId,
                take,
                ...(weekId ? { weekId, referenceDate } : {}),
              },
            },
          }
        : {},
    [seasonId, take, weekId, referenceDate],
  );
  // Rankings are optional homepage data. Keep server failures local while
  // preserving the subscription so a backend recovery updates both consumers.
  const results = useQueries(requests);
  const result = results.rankings as
    | FunctionReturnType<typeof api.frontend.powerRankingsPreview>
    | Error
    | undefined;
  const error = result instanceof Error ? result : null;

  return {
    data: result instanceof Error ? undefined : result,
    isLoading: Boolean(seasonId) && !error && result === undefined,
    error,
  };
}
