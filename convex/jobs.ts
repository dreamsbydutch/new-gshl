/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion */
import { mutation, query } from "./_generated/server";
import { startJob, cancelJob, retryJob } from "./lib/jobLifecycle";
import { v } from "convex/values";
import {
  canonicalJobName,
  JOB_NAMES,
  JOB_STATUSES,
  jobStatusValidator,
} from "./jobCatalog";

function requireSecret(serverSecret: string) {
  const expected = process.env.CONVEX_SERVER_SECRET;
  if (!expected || serverSecret !== expected)
    throw new Error("Unauthorized server request");
}

function publicRun(row: Record<string, unknown> & { _id: string }) {
  return { ...row, id: row._id };
}

export const catalog = query({
  args: { serverSecret: v.string() },
  handler: (_ctx, args) => {
    requireSecret(args.serverSecret);
    return { jobs: JOB_NAMES, statuses: JOB_STATUSES };
  },
});

export const start = mutation({
  args: {
    serverSecret: v.string(),
    jobName: v.string(),
    args: v.optional(v.record(v.string(), v.any())),
    apply: v.optional(v.boolean()),
    requestedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    return publicRun(
      await startJob(ctx, {
        jobName: args.jobName,
        args: args.args ?? {},
        apply: args.apply === true,
        requestedBy: args.requestedBy,
      }),
    );
  },
});

export const list = query({
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
          .query("jobRuns")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(limit)
      : await ctx.db
          .query("jobRuns" as never)
          .order("desc")
          .take(limit);
    return rows.map((row) => publicRun(row as never));
  },
});

export const inspect = query({
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

export const cancel = mutation({
  args: { serverSecret: v.string(), runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    return publicRun(await cancelJob(ctx, args.runId));
  },
});

export const retry = mutation({
  args: {
    serverSecret: v.string(),
    runId: v.id("jobRuns"),
    requestedBy: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    return publicRun(await retryJob(ctx, args.runId, args.requestedBy));
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

export const createSchedule = mutation({
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

export const updateSchedule = mutation({
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

export const setScheduleEnabled = mutation({
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

export const listSchedules = query({
  args: { serverSecret: v.string() },
  handler: async (ctx, args) => {
    requireSecret(args.serverSecret);
    return await ctx.db.query("jobSchedules").collect();
  },
});
