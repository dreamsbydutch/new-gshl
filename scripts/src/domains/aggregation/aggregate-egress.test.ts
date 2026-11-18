import assert from "node:assert/strict";
import test from "node:test";
import { readAggregatePreimages } from "./season-stat-aggregation";
import type { DatabaseRecord } from "../../integrations/data/records";

test("frequent comparisons read one week instead of the full season for all three outputs", async () => {
  for (const model of [
    "PlayerWeekStatLine",
    "TeamDayStatLine",
    "TeamWeekStatLine",
  ] as const) {
    const rows = Array.from({ length: 24 }, (_, i) => ({
      seasonId: "s",
      weekId: `w${i}`,
      GP: 1,
    }));
    let transferred = 0;
    const reads = {
      fetchAggregateRows: async <T>() => {
        transferred += rows.length;
        return rows as T[];
      },
      fetchWeekScopedModel: async <T>(
        _model: unknown,
        _season: string,
        weeks: readonly string[],
      ) => {
        const selected = rows.filter((row) => weeks.includes(row.weekId));
        transferred += selected.length;
        return selected as T[];
      },
    };
    const result = await readAggregatePreimages(
      model,
      "s",
      [rows[0]!, rows[0]!],
      false,
      reads,
    );
    assert.deepEqual(result, [rows[0]]);
    assert.equal(transferred, 1);
    transferred = 0;
    assert.equal(
      (await readAggregatePreimages(model, "s", [rows[0]!], true, reads))
        .length,
      24,
    );
    assert.equal(
      transferred,
      24,
      "destructive rebuild retains complete stale-row detection",
    );
  }
});

test("career and season totals retain complete preimages; incomplete scope falls back safely", async () => {
  const calls: unknown[][] = [];
  const reads = {
    fetchAggregateRows: async <T>(...args: unknown[]) => {
      calls.push(args);
      return [] as T[];
    },
    fetchWeekScopedModel: async <T>() => {
      throw Error("unexpected weekly read");
      return [] as T[];
    },
  };
  await readAggregatePreimages(
    "PlayerCareerTotalStatLine",
    "s",
    [],
    false,
    reads,
  );
  await readAggregatePreimages("PlayerTotalStatLine", "s", [], false, reads);
  await readAggregatePreimages(
    "TeamDayStatLine",
    "s",
    [{} as DatabaseRecord],
    false,
    reads,
  );
  assert.deepEqual(calls, [
    ["PlayerCareerTotalStatLine", undefined],
    ["PlayerTotalStatLine", "s"],
    ["TeamDayStatLine", "s"],
  ]);
});
