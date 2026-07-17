/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */
import {
  makeFunctionReference,
  mutationGeneric,
  queryGeneric,
} from "convex/server";
import { v } from "convex/values";
import {
  buildLockKey,
  canonicalJobName,
  JOB_NAMES,
  JOB_STATUSES,
  jobStatusValidator,
} from "./jobCatalog";

const runner = makeFunctionReference<"action", { runId: string }>(
  "jobRunner:run",
);
const ACTIVE = new Set(["queued", "running", "waiting_external", "cancelling"]);

function requireSecret(serverSecret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || serverSecret !== expected)
    throw new Error("Unauthorized server request");
}

function publicRun(row: Record<string, unknown> & { _id: string }) {
  return { ...row, id: row._id };
}

export const catalog = queryGeneric({
  args: { serverSecret: v.string() },
  handler: (_ctx, args) => {
    requireSecret(args.serverSecret);
    return { jobs: JOB_NAMES, statuses: JOB_STATUSES };
  },
});

export const start = mutationGeneric({
  args: {
    serverSecret: v.string(),
    jobName: v.string(),
    args: v.optional(v.record(v.string(), v.any())),
    apply: v.optional(v.boolean()),
    requestedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    const jobName = canonicalJobName(args.jobName);
    const jobArgs = args.args ?? {};
    const lockKey = buildLockKey(jobName, jobArgs);
    const conflicts = await ctx.db
      .query("jobRuns" as never)
      .withIndex("by_lockKey_status" as never, (q) =>
        q.eq("lockKey" as never, lockKey),
      )
      .collect();
    if (conflicts.some((row) => ACTIVE.has(String(row.status)))) {
      throw new Error(`An active run already owns scope ${lockKey}`);
    }
    const now = Date.now();
    const runId = await ctx.db.insert(
      "jobRuns" as never,
      {
        jobName,
        args: jobArgs,
        apply: args.apply === true,
        mode: "manual",
        status: "queued",
        lockKey,
        attempt: 1,
        requestedBy: args.requestedBy,
        createdAt: now,
        progress: {
          processed: 0,
          inserted: 0,
          updated: 0,
          deleted: 0,
          unchanged: 0,
          skipped: 0,
        },
      } as never,
    );
    await ctx.db.insert(
      "jobEvents" as never,
      {
        runId,
        level: "info",
        message: args.apply === true ? "Apply run queued" : "Dry run queued",
        createdAt: now,
      } as never,
    );
    await ctx.scheduler.runAfter(0, runner, { runId });
    return publicRun((await ctx.db.get(runId)) as never);
  },
});

export const list = queryGeneric({
  args: {
    serverSecret: v.string(),
    status: v.optional(jobStatusValidator),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    const limit = Math.max(1, Math.min(args.limit ?? 50, 200));
    const rows = args.status
      ? await ctx.db
          .query("jobRuns" as never)
          .withIndex("by_status" as never, (q) =>
            q.eq("status" as never, args.status),
          )
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("jobRuns" as never)
          .order("desc")
          .take(limit);
    return rows.map((row) => publicRun(row as never));
  },
});

export const inspect = queryGeneric({
  args: { serverSecret: v.string(), runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    const [events, artifacts, tasks, children] = await Promise.all([
      ctx.db
        .query("jobEvents")
        .withIndex("by_runId_createdAt", (q) => q.eq("runId", args.runId))
        .order("desc")
        .take(200),
      ctx.db
        .query("jobArtifacts")
        .withIndex("by_runId", (q) => q.eq("runId", args.runId))
        .collect(),
      ctx.db
        .query("externalTasks")
        .withIndex("by_runId", (q) => q.eq("runId", args.runId))
        .collect(),
      ctx.db
        .query("jobRuns")
        .withIndex("by_parentRunId", (q) => q.eq("parentRunId", args.runId))
        .collect(),
    ]);
    return {
      run: publicRun(run as never),
      events,
      artifacts,
      tasks,
      children: children.map((row) => publicRun(row as never)),
    };
  },
});

export const cancel = mutationGeneric({
  args: { serverSecret: v.string(), runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    if (!ACTIVE.has(run.status)) return publicRun(run as never);
    const status =
      run.status === "queued" || run.status === "waiting_external"
        ? "cancelled"
        : "cancelling";
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      status,
      finishedAt: status === "cancelled" ? now : undefined,
    });
    await ctx.db.insert("jobEvents", {
      runId: args.runId,
      level: "warning",
      message: "Cancellation requested",
      createdAt: now,
    });
    return publicRun((await ctx.db.get(args.runId)) as never);
  },
});

export const retry = mutationGeneric({
  args: {
    serverSecret: v.string(),
    runId: v.id("jobRuns"),
    requestedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    const previous = await ctx.db.get(args.runId);
    if (!previous || !["failed", "cancelled"].includes(previous.status))
      throw new Error("Only failed or cancelled runs can be retried");
    const now = Date.now();
    const runId = await ctx.db.insert("jobRuns", {
      jobName: previous.jobName,
      args: previous.args,
      apply: previous.apply,
      mode: "retry",
      status: "queued",
      lockKey: previous.lockKey,
      cursor: previous.cursor,
      progress: previous.progress,
      parentRunId: previous.parentRunId,
      pipelineStage: previous.pipelineStage,
      attempt: previous.attempt + 1,
      requestedBy: args.requestedBy,
      createdAt: now,
    });
    await ctx.scheduler.runAfter(0, runner, { runId });
    return publicRun((await ctx.db.get(runId)) as never);
  },
});

const scheduleFields = {
  serverSecret: v.string(),
  name: v.string(),
  jobName: v.string(),
  args: v.optional(v.record(v.string(), v.any())),
  apply: v.optional(v.boolean()),
  enabled: v.optional(v.boolean()),
  intervalMinutes: v.number(),
  nextRunAt: v.optional(v.number()),
};

export const createSchedule = mutationGeneric({
  args: scheduleFields,
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    canonicalJobName(args.jobName);
    if (args.intervalMinutes < 1)
      throw new Error("intervalMinutes must be at least 1");
    const now = Date.now();
    return await ctx.db.insert("jobSchedules", {
      name: args.name,
      jobName: args.jobName,
      args: args.args ?? {},
      apply: args.apply === true,
      enabled: args.enabled === true,
      intervalMinutes: args.intervalMinutes,
      nextRunAt: args.nextRunAt ?? now + args.intervalMinutes * 60_000,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updateSchedule = mutationGeneric({
  args: { ...scheduleFields, scheduleId: v.id("jobSchedules") },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    canonicalJobName(args.jobName);
    await ctx.db.patch(args.scheduleId, {
      name: args.name,
      jobName: args.jobName,
      args: args.args ?? {},
      apply: args.apply === true,
      enabled: args.enabled === true,
      intervalMinutes: args.intervalMinutes,
      nextRunAt: args.nextRunAt ?? Date.now() + args.intervalMinutes * 60_000,
      updatedAt: Date.now(),
    });
    return args.scheduleId;
  },
});

export const setScheduleEnabled = mutationGeneric({
  args: {
    serverSecret: v.string(),
    scheduleId: v.id("jobSchedules"),
    enabled: v.boolean(),
  },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    await ctx.db.patch(args.scheduleId, {
      enabled: args.enabled,
      updatedAt: Date.now(),
    });
  },
});

export const listSchedules = queryGeneric({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    return await ctx.db.query("jobSchedules").collect();
  },
});
