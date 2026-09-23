import assert from "node:assert/strict";
import test from "node:test";

import type {
  PlayerStatColumn,
  PlayerStatColumnKey,
  PlayerStatRow,
} from "@gshl-types";
import {
  buildPlayerStatColumns,
  getPlayerStatCardColumns,
  renderPlayerStatCell,
} from "./matchup-details";

function player(
  posGroup: "F" | "D" | "G",
  values: Partial<PlayerStatRow> = {},
): PlayerStatRow {
  return {
    id: `${posGroup.toLowerCase()}-player`,
    posGroup,
    ...values,
  };
}

function columns(...keys: PlayerStatColumnKey[]): PlayerStatColumn[] {
  return keys.map((key) => ({ key, label: String(key) }));
}

void test("weekly status columns include zeroes and retain values for skaters and goalies", () => {
  for (const position of ["F", "G"] as const) {
    const row = player(position, {
      MG: 0,
      IR: 1,
      IRplus: "2",
      ADD: 1,
      MS: "3",
      BS: 4,
    });
    const result = buildPlayerStatColumns({
      players: [row],
      categories: ["G", "W"],
    });
    assert.deepEqual(
      result.map((column) => column.key),
      [
        "player",
        "pos",
        "nhlTeam",
        "GP",
        "G",
        "W",
        "MS",
        "BS",
        "ADD",
        "MG",
        "IR",
        "IRplus",
      ],
    );
    assert.equal(
      result.find((column) => column.key === "IRplus")?.label,
      "IR+",
    );
    assert.deepEqual(
      (["MG", "IR", "IRplus", "ADD", "MS", "BS"] as const).map((key) =>
        renderPlayerStatCell(row, key),
      ),
      ["0", "1", "2", "1", "3", "4"],
    );
  }
});

void test("goalies show dashes for every skater-only category, even with stored values", () => {
  for (const key of [
    "G",
    "A",
    "P",
    "PM",
    "PIM",
    "PPP",
    "SOG",
    "HIT",
    "BLK",
  ] as const) {
    assert.equal(renderPlayerStatCell(player("G", { [key]: 3 }), key), "-");
  }
});

void test("forwards and defensemen show dashes for every goalie-only category", () => {
  for (const position of ["F", "D"] as const) {
    for (const key of ["W", "GA", "GAA", "SV", "SA", "SVP", "SO"] as const) {
      assert.equal(
        renderPlayerStatCell(player(position, { [key]: 3 }), key),
        "-",
      );
    }
  }
});

void test("eligible zeroes, goalie precision, and shared stats retain their values", () => {
  assert.equal(renderPlayerStatCell(player("F", { G: 0 }), "G"), "0");
  assert.equal(renderPlayerStatCell(player("D"), "BLK"), "0");
  assert.equal(renderPlayerStatCell(player("G", { W: 0 }), "W"), "0");
  assert.equal(renderPlayerStatCell(player("G", { GAA: 2.5 }), "GAA"), "2.50");
  assert.equal(
    renderPlayerStatCell(player("G", { SVP: 0.925 }), "SVP"),
    "0.925",
  );
  for (const position of ["F", "D", "G"] as const) {
    assert.equal(renderPlayerStatCell(player(position, { GP: 2 }), "GP"), "2");
    assert.equal(
      renderPlayerStatCell(player(position, { Rating: 8.125 }), "Rating"),
      "8.125",
    );
  }
});

void test("selects compact skater stats in the season column order", () => {
  const result = getPlayerStatCardColumns(
    player("F"),
    columns("player", "W", "P", "G", "SVP", "A", "SOG"),
  );

  assert.deepEqual(
    result.map((column) => column.key),
    ["P", "G", "A", "SOG"],
  );
});

void test("selects only goalie categories for compact goalie cards", () => {
  const result = getPlayerStatCardColumns(
    player("G"),
    columns("player", "G", "W", "GAA", "SVP", "SO", "P"),
  );

  assert.deepEqual(
    result.map((column) => column.key),
    ["W", "GAA", "SVP", "SO"],
  );
});

void test("returns no compact columns when the requested limit is empty", () => {
  assert.deepEqual(
    getPlayerStatCardColumns(player("D"), columns("G", "A"), 0),
    [],
  );
});

void test("builds identity, available context, and deduplicated season columns", () => {
  const result = buildPlayerStatColumns({
    players: [player("F", { GP: "2", Rating: "8.125" })],
    categories: ["G", "SV%", "G"],
  });

  assert.deepEqual(
    result.map((column) => column.key),
    ["player", "pos", "nhlTeam", "GP", "Rating", "G", "SVP"],
  );
});
