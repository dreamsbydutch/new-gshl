"use client";

import { useEffect, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type {
  PerformanceFilters,
  PerformanceResult,
} from "@gshl-lib/types/performances";

export function usePerformances(filters: PerformanceFilters, enabled: boolean) {
  const load = useAction(api.performances.leaderboard);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{
    key: string;
    data?: PerformanceResult;
    error?: string;
  }>({ key: "" });
  const key = JSON.stringify([filters, retry]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const timer = setTimeout(() => {
      void load({
        filters: {
          ...filters,
          seasonIds: filters.seasonIds as Id<"seasons">[],
        },
      }).then(
        (data) => {
          if (active) setState({ key, data });
        },
        () => {
          if (active)
            setState({
              key,
              error: "Unable to load performances. Please try again.",
            });
        },
      );
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [enabled, filters, key, load]);
  return {
    data: enabled && state.key === key ? state.data : undefined,
    error: enabled && state.key === key ? state.error : undefined,
    isLoading: enabled && (state.key !== key || (!state.data && !state.error)),
    refresh: () => setRetry((value) => value + 1),
  };
}
