import assert from "node:assert/strict";
import test from "node:test";
import { accountingKey, buildAccountingTotals } from "./lineup-accounting";

void test("accounting counters include bench/IR and combine postseason and career periods", () => {
  const base = {
    seasonId: "s",
    weekId: "w",
    gshlTeamId: "t",
    playerId: "p",
    date: "2025-01-01",
    seasonType: "LT",
    dailyPos: "IR",
    MS: "1",
    BS: "",
    MG: "1",
  };
  const totals = buildAccountingTotals([
    base,
    { ...base, date: "2025-01-02", dailyPos: "BN", MS: "", BS: "1", MG: "" },
  ]);
  for (const [table, buckets] of totals)
    assert.deepEqual(
      buckets.get(accountingKey(table, { ...base, seasonType: "PO" })),
      { MS: 1, BS: table === "teamDayStatLines" ? 0 : 1, MG: 1 },
    );
  assert.throws(() => buildAccountingTotals([{ ...base, MS: "2" }]));
  assert.throws(() =>
    accountingKey("teamWeekStatLines", { ...base, weekId: undefined }),
  );
});
