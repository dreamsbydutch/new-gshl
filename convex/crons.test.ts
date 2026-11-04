import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

for (const enabled of [undefined, "false", "true"]) {
  void test(`cron registration with automation ${enabled ?? "unset"}`, () => {
    const env = { ...process.env };
    delete env.GSHL_AUTOMATION_ENABLED;
    if (enabled !== undefined) env.GSHL_AUTOMATION_ENABLED = enabled;
    // A fresh process exercises deployment-time registration for each setting.
    const output = execFileSync(
      process.execPath,
      ["--import", "tsx", "--input-type=module"],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env,
        input:
          'import crons from "./convex/crons.ts"; console.log(crons.export());',
        encoding: "utf8",
      },
    );
    const jobs = JSON.parse(output) as Record<
      string,
      { schedule: Record<string, number | string> }
    >;
    assert.equal(Object.keys(jobs).length, enabled === "true" ? 6 : 0);
    if (enabled === "true") {
      assert.ok(jobs["publish due GSHL Weekly editions"]);
      assert.ok(jobs["deliver due notifications"]);
      assert.ok(jobs["resolve due UFA offer groups"]);
      for (const name of [
        "dispatch due job schedules",
        "resolve due UFA offer groups",
      ]) {
        assert.deepEqual(jobs[name]?.schedule, {
          minutes: 15,
          type: "interval",
        });
      }
    }
  });
}
