import assert from "node:assert/strict";
import test from "node:test";

import { normalizeJobRuns } from "./jobs";

void test("normalizes job rows before they reach admin components", () => {
  const runs = normalizeJobRuns([
    {
      id: "job-run-1",
      jobName: "season-stat-aggregation",
      requestedBy: "commissioner@example.com",
      apply: true,
      mode: "manual",
      status: "running",
      progress: { processed: 12, updated: 4 },
      createdAt: 100,
    },
    null,
  ]);

  assert.equal(runs.length, 1);
  assert.deepEqual(runs[0]?.progress, { processed: 12, updated: 4 });
  assert.equal(runs[0]?.apply, true);
});
