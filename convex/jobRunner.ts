/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unnecessary-type-assertion, @typescript-eslint/no-base-to-string */
import {
  internalActionGeneric,
  internalMutationGeneric,
  makeFunctionReference,
  type FunctionReference,
} from "convex/server";
import { v } from "convex/values";
import {
  ACTIVE_REFRESH_STAGES,
  buildLockKey,
  canonicalJobName,
  isExternalJob,
} from "./jobCatalog";
import { calculateTeamAwards } from "./awardCalculations";

const mutationRef = (name: string) =>
  makeFunctionReference<"mutation">(name) as unknown as FunctionReference<
    "mutation",
    "internal",
    Record<string, unknown>,
    unknown
  >;
const actionRef = (name: string) =>
  makeFunctionReference<"action">(name) as unknown as FunctionReference<
    "action",
    "internal",
    Record<string, unknown>,
    unknown
  >;
const runner = actionRef("jobRunner:run");
const ACTIVE = new Set(["queued", "running", "waiting_external", "cancelling"]);
const BATCH_SIZE = 100;

type Progress = {
  processed: number;
  inserted: number;
  updated: number;
  deleted: number;
  unchanged: number;
  skipped: number;
};

const emptyProgress = (): Progress => ({
  processed: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  unchanged: 0,
  skipped: 0,
});

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const prepare = internalMutationGeneric({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return null;
    if (run.status === "cancelling") {
      await ctx.db.patch(args.runId, {
        status: "cancelled",
        finishedAt: Date.now(),
      });
      return null;
    }
    if (!["queued", "running", "waiting_external"].includes(run.status))
      return null;
    const now = Date.now();
    await ctx.db.patch(args.runId, {
      status: "running",
      startedAt: run.startedAt ?? now,
      heartbeatAt: now,
      error: undefined,
    });
    return { ...run, status: "running" };
  },
});

export const appendEvent = internalMutationGeneric({
  args: {
    runId: v.id("jobRuns"),
    level: v.union(
      v.literal("debug"),
      v.literal("info"),
      v.literal("warning"),
      v.literal("error"),
    ),
    message: v.string(),
    data: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("jobEvents", { ...args, createdAt: Date.now() });
    const events = await ctx.db
      .query("jobEvents")
      .withIndex("by_runId_createdAt", (q) => q.eq("runId", args.runId))
      .order("desc")
      .take(251);
    for (const event of events.slice(250)) await ctx.db.delete(event._id);
  },
});

export const finish = internalMutationGeneric({
  args: {
    runId: v.id("jobRuns"),
    status: v.union(
      v.literal("succeeded"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    result: v.optional(v.any()),
    error: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) return;
    const status = run.status === "cancelling" ? "cancelled" : args.status;
    await ctx.db.patch(args.runId, {
      status,
      result: args.result,
      error: args.error,
      finishedAt: Date.now(),
      heartbeatAt: Date.now(),
    });
    await ctx.db.insert("jobEvents", {
      runId: args.runId,
      level: status === "failed" ? "error" : "info",
      message:
        status === "failed" ? (args.error ?? "Job failed") : `Job ${status}`,
      createdAt: Date.now(),
    });
    if (run.parentRunId)
      await ctx.scheduler.runAfter(0, runner, { runId: run.parentRunId });
  },
});

function targetTable(jobName: string) {
  switch (jobName) {
    case "season-stat-aggregation":
      return "playerDayStatLines";
    case "player-rating-rebuild":
      return "playerTotalStatLines";
    case "team-rating-rebuild":
      return "teamSeasonStatLines";
    case "power-rating-rebuild":
      return "teamWeekStatLines";
    case "standings-backfill":
      return "matchups";
    case "lineup-recalculation":
      return "playerDayStatLines";
    default:
      return null;
  }
}

function lineupFlags(row: Record<string, unknown>) {
  const token = (value: unknown) =>
    String(value ?? "")
      .trim()
      .toUpperCase();
  if (token(row.posGroup) === "G" || token(row.GP) !== "1")
    return { MS: "", BS: "" };
  const dailyPos = token(row.dailyPos);
  const fullPos = token(row.fullPos);
  const bestPos = token(row.bestPos);
  const MS =
    ["BN", "IR", "IR+"].includes(dailyPos) &&
    ["LW", "C", "RW", "D", "UTIL"].includes(fullPos)
      ? "1"
      : "";
  const BS = fullPos === "BN" && bestPos !== "" && bestPos !== "BN" ? "1" : "";
  return { MS, BS };
}

export const processNativeBatch = internalMutationGeneric({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    if (run.status === "cancelling") return { cancelled: true, done: true };
    const table = targetTable(run.jobName);
    if (!table) throw new Error(`No native processor for ${run.jobName}`);
    const jobArgs = asRecord(run.args);
    const seasonId =
      typeof jobArgs.seasonId === "string" ? jobArgs.seasonId : undefined;
    const base = ctx.db.query(table as never);
    const scoped = seasonId
      ? base.withIndex("by_seasonId" as never, (q) =>
          q.eq("seasonId" as never, seasonId),
        )
      : base;
    const page = await scoped.paginate({
      cursor: run.cursor ?? null,
      numItems: BATCH_SIZE,
    });
    const progress = {
      ...emptyProgress(),
      ...asRecord(run.progress),
    } as Progress;
    let updated = 0;
    let unchanged = 0;
    for (const raw of page.page) {
      const row = raw as Record<string, unknown> & { _id: string };
      if (run.jobName === "lineup-recalculation") {
        const next = lineupFlags(row);
        const changed = row.MS !== next.MS || row.BS !== next.BS;
        if (changed && run.apply)
          await ctx.db.patch(row._id as never, next as never);
        if (changed) updated += 1;
        else unchanged += 1;
      } else {
        // Calculation migrations use this indexed scan as their bounded source
        // transaction. Until parity is approved, the scan reports rows without
        // mutating league tables, preserving the legacy commands for comparison.
        unchanged += 1;
      }
    }
    const nextProgress: Progress = {
      ...progress,
      processed: progress.processed + page.page.length,
      updated: progress.updated + updated,
      unchanged: progress.unchanged + unchanged,
    };
    await ctx.db.patch(args.runId, {
      cursor: page.isDone ? undefined : page.continueCursor,
      progress: nextProgress,
      heartbeatAt: Date.now(),
    });
    await ctx.db.insert("jobEvents", {
      runId: args.runId,
      level: "debug",
      message: `Processed ${page.page.length} ${table} rows`,
      data: {
        cursor: page.isDone ? null : page.continueCursor,
        progress: nextProgress,
      },
      createdAt: Date.now(),
    });
    return { done: page.isDone, cancelled: false, progress: nextProgress };
  },
});

export const processAwardsBackfill = internalMutationGeneric({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const run = await ctx.db.get(args.runId);
    if (!run) throw new Error("Run not found");
    if (run.status === "cancelling") return { cancelled: true };
    const jobArgs = asRecord(run.args);
    const requestedSeasonId =
      typeof jobArgs.seasonId === "string" ? jobArgs.seasonId : undefined;
    const allSeasons = await ctx.db.query("seasons" as never).collect();
    const seasons = requestedSeasonId
      ? allSeasons.filter(
          (season) =>
            String(season._id) === requestedSeasonId ||
            String(season.legacyId ?? "") === requestedSeasonId,
        )
      : allSeasons.filter((season) => {
          const endDate = String(season.endDate ?? "");
          return (
            endDate !== "" && endDate < new Date().toISOString().slice(0, 10)
          );
        });
    if (seasons.length === 0) {
      throw new Error(
        requestedSeasonId
          ? `Season ${requestedSeasonId} was not found`
          : "No completed seasons were found",
      );
    }

    const [franchises, conferences] = await Promise.all([
      ctx.db.query("franchises" as never).collect(),
      ctx.db.query("conferences" as never).collect(),
    ]);
    const totals = emptyProgress();
    const summaries: Array<Record<string, unknown>> = [];
    const now = new Date().toISOString();

    for (const season of seasons) {
      const seasonId = String(season._id);
      const [teamSeasonRows, teams, matchups, weeks, existingAwards] =
        await Promise.all([
          ctx.db
            .query("teamSeasonStatLines" as never)
            .withIndex("by_seasonId" as never, (q) =>
              q.eq("seasonId" as never, seasonId),
            )
            .collect(),
          ctx.db
            .query("teams" as never)
            .withIndex("by_seasonId" as never, (q) =>
              q.eq("seasonId" as never, seasonId),
            )
            .collect(),
          ctx.db
            .query("matchups" as never)
            .withIndex("by_seasonId" as never, (q) =>
              q.eq("seasonId" as never, seasonId),
            )
            .collect(),
          ctx.db
            .query("weeks" as never)
            .withIndex("by_seasonId" as never, (q) =>
              q.eq("seasonId" as never, seasonId),
            )
            .collect(),
          ctx.db
            .query("teamAwards" as never)
            .withIndex("by_seasonId" as never, (q) =>
              q.eq("seasonId" as never, seasonId),
            )
            .collect(),
        ]);
      const calculated = calculateTeamAwards({
        seasonId,
        seasonLegacyId:
          typeof season.legacyId === "string" ? season.legacyId : undefined,
        teamSeasonRows,
        teams,
        franchises,
        conferences,
        matchups,
        weeks,
      });
      const existingByKey = new Map(
        existingAwards.map((award) => [
          `${String(award.award)}|${String(award.ownerId ?? "")}`,
          award,
        ]),
      );
      const incomingKeys = new Set<string>();
      let inserted = 0;
      let updated = 0;
      let unchanged = 0;
      for (const award of calculated) {
        const key = `${award.award}|${award.ownerId}`;
        incomingKeys.add(key);
        const existing = existingByKey.get(key);
        if (!existing) {
          inserted += 1;
          if (run.apply) {
            await ctx.db.insert(
              "teamAwards" as never,
              {
                ...award,
                createdAt: now,
                updatedAt: now,
              } as never,
            );
          }
          continue;
        }
        const changed =
          JSON.stringify(existing.nomineeIds ?? []) !==
            JSON.stringify(award.nomineeIds) || existing.teamId !== undefined;
        if (!changed) {
          unchanged += 1;
          continue;
        }
        updated += 1;
        if (run.apply) {
          await ctx.db.patch(
            existing._id as never,
            {
              ownerId: award.ownerId,
              nomineeIds: award.nomineeIds,
              teamId: undefined,
              updatedAt: now,
            } as never,
          );
        }
      }
      const deletedRows = existingAwards.filter(
        (award) =>
          !incomingKeys.has(
            `${String(award.award)}|${String(award.ownerId ?? "")}`,
          ),
      );
      if (run.apply) {
        for (const award of deletedRows) {
          await ctx.db.delete(award._id as never);
        }
      }
      totals.processed += teamSeasonRows.length;
      totals.inserted += inserted;
      totals.updated += updated;
      totals.deleted += deletedRows.length;
      totals.unchanged += unchanged;
      summaries.push({
        seasonId,
        legacyId: season.legacyId,
        computed: calculated.length,
        inserted,
        updated,
        deleted: deletedRows.length,
        unchanged,
      });
    }
    await ctx.db.patch(args.runId, {
      progress: totals,
      heartbeatAt: Date.now(),
    });
    return {
      cancelled: false,
      apply: run.apply,
      counts: totals,
      seasons: summaries,
    };
  },
});

export const createExternalTask = internalMutationGeneric({
  args: { runId: v.id("jobRuns"), kind: v.string(), payload: v.any() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("externalTasks")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();
    if (existing) return existing;
    const now = Date.now();
    const taskId = await ctx.db.insert("externalTasks", {
      ...args,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.patch(args.runId, {
      status: "waiting_external",
      heartbeatAt: now,
    });
    return await ctx.db.get(taskId);
  },
});

export const getExternalResult = internalMutationGeneric({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const task = await ctx.db
      .query("externalTasks")
      .withIndex("by_runId", (q) => q.eq("runId", args.runId))
      .first();
    if (!task) return null;
    if (task.status === "failed")
      throw new Error(task.error ?? "External task failed");
    return task.status === "completed" ? task : null;
  },
});

export const saveArtifact = internalMutationGeneric({
  args: {
    runId: v.id("jobRuns"),
    storageId: v.id("_storage"),
    kind: v.string(),
    name: v.string(),
    contentType: v.optional(v.string()),
  },
  handler: async (ctx, args) =>
    await ctx.db.insert("jobArtifacts", { ...args, createdAt: Date.now() }),
});

export const advancePipeline = internalMutationGeneric({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const parent = await ctx.db.get(args.runId);
    if (!parent) throw new Error("Pipeline not found");
    if (parent.status === "cancelling") return { state: "cancelled" as const };
    const children = await ctx.db
      .query("jobRuns")
      .withIndex("by_parentRunId", (q) => q.eq("parentRunId", args.runId))
      .collect();
    const failed = children.find(
      (child) => child.status === "failed" || child.status === "cancelled",
    );
    if (failed)
      return {
        state: "failed" as const,
        childId: failed._id,
        error: failed.error,
      };
    const active = children.find((child) => ACTIVE.has(child.status));
    if (active) return { state: "waiting" as const, childId: active._id };
    const stage = children.length;
    if (stage >= ACTIVE_REFRESH_STAGES.length)
      return {
        state: "complete" as const,
        children: children.map((child) => child._id),
      };
    const jobName = ACTIVE_REFRESH_STAGES[stage]!;
    const jobArgs = asRecord(parent.args);
    const now = Date.now();
    const childId = await ctx.db.insert("jobRuns", {
      jobName,
      args: jobArgs,
      apply: parent.apply,
      mode: "pipeline",
      status: "queued",
      lockKey: buildLockKey(jobName, jobArgs),
      parentRunId: args.runId,
      pipelineStage: stage,
      attempt: 1,
      requestedBy: parent.requestedBy,
      createdAt: now,
      progress: emptyProgress(),
    });
    await ctx.scheduler.runAfter(0, runner, { runId: childId });
    return { state: "started" as const, childId };
  },
});

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3) {
  let last: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, init);
      if (response.ok) return response;
      if (response.status < 500 && response.status !== 429)
        throw new Error(`HTTP ${response.status}`);
      last = new Error(`HTTP ${response.status}`);
    } catch (error) {
      last = error;
    }
    if (attempt + 1 < attempts)
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
  }
  throw last;
}

export const run = internalActionGeneric({
  args: { runId: v.id("jobRuns") },
  handler: async (ctx, args) => {
    const run = (await ctx.runMutation(
      mutationRef("jobRunner:prepare"),
      args,
    )) as Record<string, unknown> | null;
    if (!run) return;
    try {
      const jobName = canonicalJobName(String(run.jobName));
      if (jobName === "active-season-refresh") {
        const state = (await ctx.runMutation(
          mutationRef("jobRunner:advancePipeline"),
          args,
        )) as { state: string; error?: string; children?: string[] };
        if (state.state === "complete")
          await ctx.runMutation(mutationRef("jobRunner:finish"), {
            ...args,
            status: "succeeded",
            result: { childRuns: state.children },
          });
        else if (state.state === "failed" || state.state === "cancelled")
          await ctx.runMutation(mutationRef("jobRunner:finish"), {
            ...args,
            status: state.state === "failed" ? "failed" : "cancelled",
            error: state.error,
          });
        return;
      }

      if (isExternalJob(jobName)) {
        const existing = (await ctx.runMutation(
          mutationRef("jobRunner:getExternalResult"),
          args,
        )) as Record<string, unknown> | null;
        if (existing) {
          const chunks = Array.isArray(existing.resultChunks)
            ? existing.resultChunks
            : [];
          await ctx.runMutation(mutationRef("jobRunner:finish"), {
            ...args,
            status: "succeeded",
            result: { source: "browser-worker", chunks: chunks.length },
          });
          return;
        }
        const jobArgs = asRecord(run.args);
        const url = typeof jobArgs.url === "string" ? jobArgs.url : undefined;
        if (url) {
          try {
            const response = await fetchWithRetry(url, {
              headers: {
                accept: "application/json,text/html",
                "user-agent": "GSHL-Convex-Jobs/1.0",
              },
            });
            const contentType =
              response.headers.get("content-type") ??
              "application/octet-stream";
            const blob = await response.blob();
            const storageId = await ctx.storage.store(blob);
            await ctx.runMutation(mutationRef("jobRunner:saveArtifact"), {
              ...args,
              storageId,
              kind: "source-snapshot",
              name: `${jobName}-${Date.now()}`,
              contentType,
            });
            await ctx.runMutation(mutationRef("jobRunner:finish"), {
              ...args,
              status: "succeeded",
              result: { source: "direct-http", bytes: blob.size, storageId },
            });
            return;
          } catch (error) {
            await ctx.runMutation(mutationRef("jobRunner:appendEvent"), {
              ...args,
              level: "warning",
              message: `Direct HTTP failed: ${errorMessage(error)}`,
            });
          }
        }
        await ctx.runMutation(mutationRef("jobRunner:createExternalTask"), {
          ...args,
          kind: jobName,
          payload: asRecord(run.args),
        });
        return;
      }

      if (jobName === "awards-backfill") {
        const result = (await ctx.runMutation(
          mutationRef("jobRunner:processAwardsBackfill"),
          args,
        )) as {
          cancelled: boolean;
          apply?: boolean;
          counts?: Progress;
          seasons?: Array<Record<string, unknown>>;
        };
        await ctx.runMutation(mutationRef("jobRunner:finish"), {
          ...args,
          status: result.cancelled ? "cancelled" : "succeeded",
          result: result.cancelled
            ? undefined
            : {
                apply: result.apply,
                counts: result.counts,
                seasons: result.seasons,
              },
        });
        return;
      }

      const batch = (await ctx.runMutation(
        mutationRef("jobRunner:processNativeBatch"),
        args,
      )) as { done: boolean; cancelled: boolean; progress?: Progress };
      if (batch.cancelled)
        await ctx.runMutation(mutationRef("jobRunner:finish"), {
          ...args,
          status: "cancelled",
        });
      else if (batch.done)
        await ctx.runMutation(mutationRef("jobRunner:finish"), {
          ...args,
          status: "succeeded",
          result: { apply: run.apply === true, counts: batch.progress },
        });
      else await ctx.scheduler.runAfter(0, runner, args);
    } catch (error) {
      await ctx.runMutation(mutationRef("jobRunner:finish"), {
        ...args,
        status: "failed",
        error: errorMessage(error),
      });
    }
  },
});

export const tickSchedules = internalMutationGeneric({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const due = await ctx.db
      .query("jobSchedules")
      .withIndex("by_enabled_nextRunAt", (q) => q.eq("enabled", true))
      .filter((q) => q.lte(q.field("nextRunAt"), now))
      .take(20);
    for (const schedule of due) {
      const jobName = canonicalJobName(schedule.jobName);
      const jobArgs = asRecord(schedule.args);
      const lockKey = buildLockKey(jobName, jobArgs);
      const conflicts = await ctx.db
        .query("jobRuns")
        .withIndex("by_lockKey_status", (q) => q.eq("lockKey", lockKey))
        .collect();
      if (!conflicts.some((row) => ACTIVE.has(row.status))) {
        const runId = await ctx.db.insert("jobRuns", {
          jobName,
          args: jobArgs,
          apply: schedule.apply,
          mode: "scheduled",
          status: "queued",
          lockKey,
          attempt: 1,
          requestedBy: `schedule:${schedule.name}`,
          createdAt: now,
          progress: emptyProgress(),
        });
        await ctx.scheduler.runAfter(0, runner, { runId });
        await ctx.db.patch(schedule._id, {
          lastRunAt: now,
          lastRunId: runId,
          nextRunAt: now + schedule.intervalMinutes * 60_000,
          updatedAt: now,
        });
      } else {
        await ctx.db.patch(schedule._id, {
          nextRunAt: now + schedule.intervalMinutes * 60_000,
          updatedAt: now,
        });
      }
    }
  },
});
