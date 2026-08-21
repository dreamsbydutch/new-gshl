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
