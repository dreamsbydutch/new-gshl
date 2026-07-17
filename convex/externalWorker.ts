/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/prefer-optional-chain */
import { makeFunctionReference, mutationGeneric } from "convex/server";
import { v } from "convex/values";

function requireWorkerSecret(secret: string) {
  const expected = process.env.BROWSER_WORKER_SECRET;
  if (!expected || secret !== expected)
    throw new Error("Unauthorized worker request");
}

const runner = makeFunctionReference<"action", { runId: string }>(
  "jobRunner:run",
);

export const lease = mutationGeneric({
  args: {
    workerSecret: v.string(),
    workerId: v.string(),
    leaseMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireWorkerSecret(args.workerSecret);
    const now = Date.now();
    const candidates = await ctx.db
      .query("externalTasks")
      .withIndex("by_status_createdAt", (q) => q.eq("status", "pending"))
      .take(20);
    let task = candidates[0];
    if (!task) {
      const leased = await ctx.db
        .query("externalTasks")
        .withIndex("by_status_createdAt", (q) => q.eq("status", "leased"))
        .take(20);
      task = leased.find((item) => (item.leaseExpiresAt ?? 0) <= now);
    }
    if (!task) return null;
    await ctx.db.patch(task._id, {
      status: "leased",
      leaseOwner: args.workerId,
      leaseExpiresAt:
        now + Math.max(30_000, Math.min(args.leaseMs ?? 120_000, 600_000)),
      heartbeatAt: now,
      updatedAt: now,
    });
    return await ctx.db.get(task._id);
  },
});

export const heartbeat = mutationGeneric({
  args: {
    workerSecret: v.string(),
    taskId: v.id("externalTasks"),
    workerId: v.string(),
    leaseMs: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    requireWorkerSecret(args.workerSecret);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.status !== "leased" || task.leaseOwner !== args.workerId)
      throw new Error("Task lease is not owned by this worker");
    const now = Date.now();
    await ctx.db.patch(args.taskId, {
      heartbeatAt: now,
      leaseExpiresAt:
        now + Math.max(30_000, Math.min(args.leaseMs ?? 120_000, 600_000)),
      updatedAt: now,
    });
  },
});

export const complete = mutationGeneric({
  args: {
    workerSecret: v.string(),
    taskId: v.id("externalTasks"),
    workerId: v.string(),
    chunks: v.array(v.any()),
  },
  handler: async (ctx, args) => {
    requireWorkerSecret(args.workerSecret);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.status !== "leased" || task.leaseOwner !== args.workerId)
      throw new Error("Task lease is not owned by this worker");
    if (args.chunks.length > 100)
      throw new Error("Return at most 100 bounded result chunks");
    await ctx.db.patch(args.taskId, {
      status: "completed",
      resultChunks: args.chunks,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, runner, { runId: task.runId });
  },
});

export const fail = mutationGeneric({
  args: {
    workerSecret: v.string(),
    taskId: v.id("externalTasks"),
    workerId: v.string(),
    error: v.string(),
  },
  handler: async (ctx, args) => {
    requireWorkerSecret(args.workerSecret);
    const task = await ctx.db.get(args.taskId);
    if (!task || task.leaseOwner !== args.workerId)
      throw new Error("Task lease is not owned by this worker");
    await ctx.db.patch(args.taskId, {
      status: "failed",
      error: args.error.slice(0, 4000),
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, runner, { runId: task.runId });
  },
});
