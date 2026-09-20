import { internal } from "../_generated/api";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { buildLockKey, canonicalJobName } from "../jobCatalog";

export const ACTIVE_JOB_STATUSES = [
  "queued",
  "running",
  "waiting_external",
  "cancelling",
] as const;

export function isActiveJob(status: Doc<"jobRuns">["status"]): boolean {
  return ACTIVE_JOB_STATUSES.some((active) => active === status);
}

export const emptyJobProgress = () => ({
  processed: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  skipped: 0,
});

type RunRequest = {
  jobName: string;
  args: Record<string, unknown>;
  apply: boolean;
  mode: Doc<"jobRuns">["mode"];
  requestedBy?: string;
  parentRunId?: Id<"jobRuns">;
  pipelineStage?: number;
};

async function scopeIsBusy(ctx: MutationCtx, lockKey: string) {
  // Bound reads by both scope and status, not the scope's entire run history.
  const matches = await Promise.all(
    ACTIVE_JOB_STATUSES.map((status) =>
      ctx.db
        .query("jobRuns")
        .withIndex("by_lockKey_status", (q) =>
          q.eq("lockKey", lockKey).eq("status", status),
        )
        .first(),
    ),
  );
  return matches.some(Boolean);
}

async function enqueue(
  ctx: MutationCtx,
  request: RunRequest,
  previous?: Doc<"jobRuns">,
): Promise<Doc<"jobRuns"> | null> {
  const jobName = canonicalJobName(request.jobName);
  const lockKey = buildLockKey(jobName, request.args);
  if (await scopeIsBusy(ctx, lockKey)) return null;
  const now = Date.now();
  const runId = await ctx.db.insert("jobRuns", {
    ...request,
    jobName,
    lockKey,
    status: "queued",
    attempt: previous ? previous.attempt + 1 : 1,
    cursor: previous?.cursor,
    progress: previous?.progress ?? emptyJobProgress(),
    createdAt: now,
  });
  await ctx.db.insert("jobEvents", {
    runId,
    level: "info",
    message: request.apply ? "Apply run queued" : "Dry run queued",
    createdAt: now,
  });
  await ctx.scheduler.runAfter(0, internal.jobRunner.run, { runId });
  return (await ctx.db.get(runId))!;
}

/** A busy scope is expected for schedules and pipeline dispatch. */
export async function queueJob(ctx: MutationCtx, request: RunRequest) {
  return enqueue(ctx, request);
}

export async function startJob(
  ctx: MutationCtx,
  request: Omit<RunRequest, "mode">,
) {
  const run = await enqueue(ctx, { ...request, mode: "manual" });
  if (!run) throw new Error("An active run already owns this scope");
  return run;
}

export async function retryJob(
  ctx: MutationCtx,
  runId: Id<"jobRuns">,
  requestedBy?: string,
) {
  const previous = await ctx.db.get(runId);
  if (!previous || !["failed", "cancelled"].includes(previous.status)) {
    throw new Error("Only failed or cancelled runs can be retried");
  }
  const args: unknown = previous.args;
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    throw new Error("The previous run has invalid arguments");
  }
  const run = await enqueue(
    ctx,
    {
      jobName: previous.jobName,
      args: args as Record<string, unknown>,
      apply: previous.apply,
      mode: "retry",
      requestedBy,
      parentRunId: previous.parentRunId,
      pipelineStage: previous.pipelineStage,
    },
    previous,
  );
  if (!run) throw new Error("An active run already owns this scope");
  return run;
}

export async function cancelJob(ctx: MutationCtx, runId: Id<"jobRuns">) {
  const run = await ctx.db.get(runId);
  if (!run) throw new Error("Run not found");
  if (!isActiveJob(run.status) || run.status === "cancelling") return run;
  const status = run.status === "running" ? "cancelling" : "cancelled";
  const now = Date.now();
  await ctx.db.patch(runId, {
    status,
    finishedAt: status === "cancelled" ? now : undefined,
  });
  await ctx.db.insert("jobEvents", {
    runId,
    level: "warning",
    message: "Cancellation requested",
    createdAt: now,
  });
  if (status === "cancelled" && run.parentRunId) {
    await ctx.scheduler.runAfter(0, internal.jobRunner.run, {
      runId: run.parentRunId,
    });
  }
  return (await ctx.db.get(runId))!;
}

export async function prepareJob(ctx: MutationCtx, runId: Id<"jobRuns">) {
  const run = await ctx.db.get(runId);
  if (!run) return null;
  if (run.status === "cancelling") {
    await finishJob(ctx, { runId, status: "cancelled" });
    return null;
  }
  if (!isActiveJob(run.status)) return null;
  const now = Date.now();
  await ctx.db.patch(runId, {
    status: "running",
    startedAt: run.startedAt ?? now,
    heartbeatAt: now,
    error: undefined,
  });
  return { ...run, status: "running" as const };
}

export async function finishJob(
  ctx: MutationCtx,
  args: {
    runId: Id<"jobRuns">;
    status: "succeeded" | "failed" | "cancelled";
    result?: unknown;
    error?: string;
  },
) {
  const run = await ctx.db.get(args.runId);
  // A late worker must not overwrite a cancellation or another terminal result.
  if (!run || !isActiveJob(run.status)) return;
  const status = run.status === "cancelling" ? "cancelled" : args.status;
  const now = Date.now();
  await ctx.db.patch(args.runId, {
    status,
    result: args.result,
    error: args.error,
    finishedAt: now,
    heartbeatAt: now,
  });
  await ctx.db.insert("jobEvents", {
    runId: args.runId,
    level: status === "failed" ? "error" : "info",
    message:
      status === "failed" ? (args.error ?? "Job failed") : `Job ${status}`,
    createdAt: now,
  });
  if (run.parentRunId) {
    await ctx.scheduler.runAfter(0, internal.jobRunner.run, {
      runId: run.parentRunId,
    });
  }
}
