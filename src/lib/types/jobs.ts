import type { Id } from "@gshl-convex/_generated/dataModel";
import type { AppMutationController } from "./app-mutation";
import type { QueryLike } from "./hook-query";

export interface JobRunProgress {
  processed?: number;
  updated?: number;
}

export interface JobRun {
  id: Id<"jobRuns">;
  jobName: string;
  requestedBy: string;
  apply: boolean;
  mode: string;
  status: string;
  progress: JobRunProgress;
  error?: string;
  startedAt?: number;
  createdAt?: number;
}

export interface JobCatalog {
  jobs: readonly string[];
  statuses: readonly string[];
}

export interface StartJobArgs extends Record<string, unknown> {
  jobName: string;
  apply: boolean;
  args: Record<string, string>;
}

export interface JobRunMutationArgs extends Record<string, unknown> {
  runId: Id<"jobRuns">;
}

export interface UseJobAdminResult {
  catalog: QueryLike<JobCatalog>;
  runs: QueryLike<JobRun[]>;
  start: AppMutationController<StartJobArgs>;
  cancel: AppMutationController<JobRunMutationArgs>;
  retry: AppMutationController<JobRunMutationArgs>;
}
