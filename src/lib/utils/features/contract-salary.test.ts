import assert from "node:assert/strict";
import test from "node:test";

import { normalizePlayerNhlSalaryRows } from "./contract-salary";

void test("keeps only safe salary fields from an untyped query result", () => {
  assert.deepEqual(
    normalizePlayerNhlSalaryRows([
      { playerId: "player-1", seasonId: "season-1", salary: "4500000" },
      { playerId: "player-2", seasonId: "season-2", salary: {} },
      null,
    ]),
    [
      {
        playerId: "player-1",
        seasonId: "season-1",
        salary: "4500000",
      },
      { playerId: "player-2", seasonId: "season-2", salary: null },
    ],
  );
});
