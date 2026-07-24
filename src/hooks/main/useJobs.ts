"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAppMutation } from "./useAppMutation";
import { normalizeJobRuns } from "@gshl-utils";
import type { JobRun, QueryLike, UseJobAdminResult } from "@gshl-types";

export function useJobAdmin(): UseJobAdminResult {
  const catalog = useQuery(api.frontend.jobCatalog, {});
  const runs = useQuery(api.frontend.jobRuns, { limit: 50 });
  const normalizedRuns = normalizeJobRuns(runs);
  const runsState: QueryLike<JobRun[]> = {
    data: normalizedRuns,
    isLoading: runs === undefined,
    error: null,
  };
  return {
    catalog: {
      data: catalog,
      isLoading: catalog === undefined,
      error: null,
    },
    runs: runsState,
    start: useAppMutation(api.frontend.startJob),
    cancel: useAppMutation(api.frontend.cancelJob),
    retry: useAppMutation(api.frontend.retryJob),
  };
}
