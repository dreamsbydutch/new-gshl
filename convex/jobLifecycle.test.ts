import assert from "node:assert/strict";
import { test } from "node:test";
import { startJob, cancelJob, retryJob } from "./frontend";
import { start, cancel, retry } from "./jobs";
import {
  prepare,
  finish,
  advancePipeline,
  tickSchedules,
  createExternalTask,
} from "./jobRunner";
import { ACTIVE_REFRESH_STAGES, buildLockKey } from "./jobCatalog";
import {
  mutationFixture,
  invokeMutation,
} from "../tools/testing/convexMutationFixture";

const request = { jobName: "standings-backfill", args: { seasonId: "season" } };

void test("both authorized entry paths reject competing starts and retries", async (t) => {
  const previous = process.env.CONVEX_SERVER_SECRET;
  process.env.CONVEX_SERVER_SECRET = "local-test-only";
  t.after(() => {
    if (previous === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = previous;
  });
  for (const [startFn, retryFn, credentials] of [
    [startJob, retryJob, {}],
    [start, retry, { serverSecret: "local-test-only" }],
  ] as const) {
    const f = mutationFixture();
    await invokeMutation(startFn, f.ctx, { ...request, ...credentials });
    const original = f.rows("jobRuns")[0]!;
    assert.equal(original.apply, false);
    assert.equal(f.rows("jobEvents").length, 1);
    assert.equal(f.scheduled.length, 1);
    await assert.rejects(
      invokeMutation(startFn, f.ctx, { ...request, ...credentials }),
      /active run/,
    );
    await f.ctx.db.patch(original._id as never, {
      status: "failed",
      cursor: "page-2",
      progress: { processed: 100 },
      parentRunId: "parent" as never,
      pipelineStage: 2,
    });
    await invokeMutation(retryFn, f.ctx, {
      runId: original._id,
      ...credentials,
    });
    const resumed = f.rows("jobRuns")[1]!;
    assert.equal(resumed.cursor, "page-2");
    assert.deepEqual(resumed.progress, { processed: 100 });
    assert.equal(resumed.parentRunId, "parent");
    assert.equal(resumed.pipelineStage, 2);
    assert.equal(resumed.attempt, 2);
    await assert.rejects(
      invokeMutation(retryFn, f.ctx, { runId: original._id, ...credentials }),
      /active run/,
    );
    assert.equal(f.rows("jobRuns").length, 2);
  }
});

void test("cancellation is idempotent and late completion preserves terminal results", async (t) => {
  const previous = process.env.CONVEX_SERVER_SECRET;
  process.env.CONVEX_SERVER_SECRET = "local-test-only";
  t.after(() => {
    if (previous === undefined) delete process.env.CONVEX_SERVER_SECRET;
    else process.env.CONVEX_SERVER_SECRET = previous;
  });
  for (const [cancelFn, credentials] of [
    [cancelJob, {}],
    [cancel, { serverSecret: "local-test-only" }],
  ] as const) {
    for (const status of [
      "queued",
      "waiting_external",
      "running",
      "cancelling",
      "succeeded",
      "failed",
      "cancelled",
    ]) {
      const f = mutationFixture();
      f.put("jobRuns", "run", { ...request, status, finishedAt: 12 });
      const args = { runId: "run", ...credentials };
      await invokeMutation(cancelFn, f.ctx, args);
      const expected = ["queued", "waiting_external"].includes(status)
        ? "cancelled"
        : status === "running"
          ? "cancelling"
          : status;
      assert.equal(f.get("run")?.status, expected);
      const events = f.rows("jobEvents").length;
      await invokeMutation(cancelFn, f.ctx, args);
      assert.equal(f.rows("jobEvents").length, events);
      await invokeMutation(finish, f.ctx, {
        runId: "run",
        status: "succeeded",
      });
      assert.equal(
        f.get("run")?.status,
        expected === "cancelling" ? "cancelled" : expected,
      );
      assert.equal(
        await invokeMutation(prepare, f.ctx, { runId: "run" }),
        null,
      );
    }
  }
});

void test("authorization remains at browser and operator entry paths", async () => {
  const f = mutationFixture();
  f.signIn(null);
  await assert.rejects(
    invokeMutation(startJob, f.ctx, request),
    /Unauthenticated/,
  );
  f.put("authUsers", "viewer", { status: "active", role: "viewer" });
  f.signIn("viewer");
  for (const fn of [startJob, cancelJob, retryJob]) {
    await assert.rejects(
      invokeMutation(fn, f.ctx, { ...request, runId: "run" }),
      /Forbidden/,
    );
  }
  for (const fn of [start, cancel, retry]) {
    await assert.rejects(
      invokeMutation(fn, f.ctx, {
        ...request,
        runId: "run",
        serverSecret: "invalid",
      }),
      /Unauthorized/,
    );
  }
  assert.equal(f.rows("jobRuns").length, 0);
  assert.equal(f.scheduled.length, 0);
});

void test("scheduled runs use admission and do not duplicate a busy scope", async () => {
  const f = mutationFixture();
  f.put("jobSchedules", "schedule", {
    ...request,
    enabled: true,
    nextRunAt: 0,
    intervalMinutes: 5,
    apply: false,
    name: "nightly",
  });
  await invokeMutation(tickSchedules, f.ctx, {});
  const run = f.rows("jobRuns")[0]!;
  assert.equal(run.mode, "scheduled");
  assert.equal(f.get("schedule")?.lastRunId, run._id);
  await f.ctx.db.patch("schedule" as never, { nextRunAt: 0 });
  await invokeMutation(tickSchedules, f.ctx, {});
  assert.equal(f.rows("jobRuns").length, 1);
  assert.equal(f.scheduled.length, 1);
});

void test("pipeline waits for a busy stage scope then creates one child", async () => {
  const f = mutationFixture();
  f.put("jobRuns", "parent", {
    jobName: "active-season-refresh",
    args: request.args,
    status: "running",
    apply: false,
  });
  f.put("jobRuns", "competing", {
    status: "running",
    lockKey: buildLockKey(ACTIVE_REFRESH_STAGES[0]!, request.args),
  });
  assert.deepEqual(
    await invokeMutation(advancePipeline, f.ctx, { runId: "parent" }),
    { state: "waiting" },
  );
  assert.equal(f.scheduled[0]?.delay, 60_000);
  assert.equal(f.rows("jobRuns").length, 2);
  await f.ctx.db.patch("competing" as never, { status: "succeeded" });
  await invokeMutation(advancePipeline, f.ctx, { runId: "parent" });
  const child = f.rows("jobRuns")[2]!;
  assert.equal(child.parentRunId, "parent");
  assert.equal(child.pipelineStage, 0);
  assert.equal(child.mode, "pipeline");
  await invokeMutation(advancePipeline, f.ctx, { runId: "parent" });
  assert.equal(f.rows("jobRuns").length, 3);
});

void test("external handoff cannot revive cancellation or terminal runs", async () => {
  for (const status of ["cancelling", "cancelled", "failed", "succeeded"]) {
    const f = mutationFixture();
    f.put("jobRuns", "run", { ...request, status });
    assert.equal(
      await invokeMutation(createExternalTask, f.ctx, {
        runId: "run",
        kind: "nhl-daily-stat-sync",
        payload: {},
      }),
      null,
    );
    assert.equal(
      f.get("run")?.status,
      status === "cancelling" ? "cancelled" : status,
    );
    assert.equal(f.rows("externalTasks").length, 0);
  }
});

void test("repeated external handoff reuses the task and restores the waiting state", async () => {
  const f = mutationFixture();
  f.put("jobRuns", "run", { ...request, status: "running" });
  const args = { runId: "run", kind: "nhl-daily-stat-sync", payload: {} };
  await invokeMutation(createExternalTask, f.ctx, args);
  assert.equal(f.get("run")?.status, "waiting_external");
  await invokeMutation(prepare, f.ctx, { runId: "run" });
  await invokeMutation(createExternalTask, f.ctx, args);
  assert.equal(f.get("run")?.status, "waiting_external");
  assert.equal(f.rows("externalTasks").length, 1);
});

void test("late pipeline advancement cannot enqueue children after termination", async () => {
  for (const status of ["cancelling", "cancelled", "failed", "succeeded"]) {
    const f = mutationFixture();
    f.put("jobRuns", "parent", {
      jobName: "active-season-refresh",
      args: request.args,
      status,
      apply: false,
    });
    await invokeMutation(advancePipeline, f.ctx, { runId: "parent" });
    assert.equal(f.rows("jobRuns").length, 1);
    assert.equal(f.scheduled.length, 0);
  }
});
