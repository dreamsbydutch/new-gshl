"use client";

import { useEffect, useState } from "react";
import { useConvex } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { StatsFilters, StatsResult } from "@gshl-lib/types/stats-browser";

export function useStats(filters: StatsFilters, enabled: boolean) {
  const client = useConvex();
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: StatsResult;
    error?: string;
  }>({ key: "" });
  const key = JSON.stringify([filters, retry]);
  useEffect(() => {
    if (!enabled) return;
    const watch = client.watchQuery(api.stats.browse, {
      ...filters,
      seasonId: filters.seasonId as Id<"seasons">,
      weekId: filters.weekId as Id<"weeks"> | undefined,
      teamId: filters.teamId as Id<"teams"> | undefined,
    });
    const update = () => {
      try {
        const data = watch.localQueryResult();
        if (data) setState({ key, data });
      } catch (error) {
        setState({
          key,
          error:
            error instanceof ConvexError && typeof error.data === "string"
              ? error.data
              : "Stats are unavailable. Please try again.",
        });
      }
    };
    const stop = watch.onUpdate(update);
    update();
    return stop;
  }, [client, filters, enabled, key]);
  return {
    data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : undefined,
    refresh: () => setRetry((value) => value + 1),
  };
}
