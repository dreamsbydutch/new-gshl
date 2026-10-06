import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import test from "node:test";
import { backupSupersededYahooDays } from "./superseded-roster-backup";

test("verifies the complete recovery backup and rejects unsafe backup locations", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gshl-yahoo-review-"));
  try {
    const workspaceRoot = join(directory, "workspace");
    await mkdir(workspaceRoot);
    const input = {
      workspaceRoot,
      backupDirectory: join(directory, "independent"),
      scope: {
        target: "development",
        leagueId: "44541",
        seasonId: "season",
        date: "2026-10-03",
      },
      rows: [
        { id: "old-day", playerId: "player", GP: "1", G: "2", dailyPos: "C" },
      ],
      replacementRoster: [{ playerId: "replacement", dailyPos: "RW" }],
    };
    const result = await backupSupersededYahooDays(input);
    assert.equal(result.rows, 1);
    for (const path of [result.path]) {
      const text = await readFile(path, "utf8");
      assert.equal(
        createHash("sha256").update(text).digest("hex"),
        result.sha256,
      );
      const saved = JSON.parse(text);
      assert.deepEqual(saved.rows, input.rows);
      assert.deepEqual(saved.replacementRoster, input.replacementRoster);
      assert.equal(saved.date, input.scope.date);
    }
    for (const backupDirectory of [
      workspaceRoot,
      join(workspaceRoot, "backup"),
      join(directory, "OneDrive", "backup"),
    ])
      await assert.rejects(
        backupSupersededYahooDays({ ...input, backupDirectory }),
        /outside the workspace/,
      );
    await assert.rejects(
      backupSupersededYahooDays({
        ...input,
        rows: [input.rows[0]!, input.rows[0]!],
      }),
      /distinct/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
