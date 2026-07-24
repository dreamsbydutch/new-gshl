import assert from "node:assert/strict";
import test from "node:test";

import type { FranchiseCareerRow, NHLTeam, Player } from "@gshl-types";
import { SeasonType } from "../domain/constants";
import { buildAllTimeFranchiseRoster } from "./team-record-book";

function careerRow(
  playerId: string,
  posGroup: string,
  nhlPos: string[],
  stats: { P?: number; G?: number; A?: number; W?: number; SVP?: number } = {},
): FranchiseCareerRow {
  return {
    playerId,
    seasonType: SeasonType.REGULAR_SEASON,
    posGroup,
    nhlPos,
    nhlTeam: "",
    days: 0,
    GP: 40,
    GS: 0,
    G: stats.G ?? 0,
    A: stats.A ?? 0,
    P: stats.P ?? 0,
    PM: 0,
    PIM: 0,
    PPP: 0,
    SOG: 0,
    HIT: 0,
    BLK: 0,
    W: stats.W ?? 0,
    GA: 0,
    SV: 0,
    SA: 0,
    SO: 0,
    TOI: 0,
    GAA: null,
    SVP: stats.SVP ?? null,
  };
}

void test("builds a unique all-time lineup from the best positional splits", () => {
  const rows = [
    careerRow("center", "F", ["C"], { P: 100, G: 40, A: 60 }),
    careerRow("left-wing", "F", ["LW"], { P: 90, G: 35, A: 55 }),
    careerRow("right-wing", "F", ["RW"], { P: 80, G: 30, A: 50 }),
    careerRow("defense-one", "D", ["D"], { P: 75, G: 20, A: 55 }),
    careerRow("defense-two", "D", ["D"], { P: 70, G: 18, A: 52 }),
    careerRow("defense-three", "D", ["D"], { P: 60, G: 15, A: 45 }),
    careerRow("goalie-one", "G", ["G"], { W: 45, SVP: 0.92 }),
    careerRow("goalie-two", "G", ["G"], { W: 40, SVP: 0.95 }),
    {
      ...careerRow("center", "F", ["C"], { P: 999 }),
      seasonType: SeasonType.PLAYOFFS,
    },
  ];
  const playersById = new Map<string, Player>();
  const nhlTeamsByAbbr = new Map<string, NHLTeam>();

  const lineup = buildAllTimeFranchiseRoster(rows, playersById, nhlTeamsByAbbr);

  assert.deepEqual(
    lineup.map((entry) => [entry.slot, entry.playerId]),
    [
      ["C", "center"],
      ["LW", "left-wing"],
      ["RW", "right-wing"],
      ["D", "defense-one"],
      ["D", "defense-two"],
      ["G", "goalie-one"],
    ],
  );
  assert.equal(new Set(lineup.map((entry) => entry.playerId)).size, 6);
});
