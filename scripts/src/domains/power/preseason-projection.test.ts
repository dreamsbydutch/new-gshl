import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPreseasonProjections,
  projectPreseasonPlayers,
  seasonCategories,
  type PreseasonInput,
} from "../../runtime/preseason-projection";
import { runPowerRankingsFixture } from "./power-engine";
import type { DatabaseRecord } from "../../integrations/data/records";

function fixture(): {
  [Key in keyof PreseasonInput]: Key extends "season"
    ? DatabaseRecord
    : DatabaseRecord[];
} {
  const season = {
    id: "next",
    year: "2027",
    categories: ["G", "A", "P", "PPP", "SOG", "HIT", "BLK", "W", "GAA", "SVP"],
    rosterSpots: ["C", "D", "G", "BN"],
  };
  const rosters = ["a", "b"].flatMap((team) =>
    ["C", "D", "G"].map((pos) => ({
      playerId: `${team}-${pos}`,
      gshlTeamId: team,
      nhlPos: [pos],
      posGroup: pos === "C" ? "F" : pos,
    })),
  );
  return {
    season,
    seasons: [{ id: "prior", year: "2026" }, season],
    teams: [
      { id: "a", seasonId: "next" },
      { id: "b", seasonId: "next" },
    ],
    rosters,
    playerNhlRows: rosters.map((player) => ({
      ...player,
      seasonId: "prior",
      GP: 82,
      G: player.gshlTeamId === "a" ? 40 : 20,
      A: 40,
      P: 80,
      PPP: 20,
      SOG: 200,
      HIT: 100,
      BLK: 100,
      W: 40,
      SA: 2000,
      SV: 1820,
      GA: 180,
      TOI: 4000,
      PM: 10,
    })),
  };
}

void test("uses configured categories, including historical and future plus/minus", () => {
  assert.deepEqual(seasonCategories({ categories: '["G", "+/-", "SV%"]' }), [
    "G",
    "PM",
    "SVP",
  ]);
  const data = fixture();
  const before = buildPreseasonProjections(data);
  data.playerNhlRows[0]!.PM = -10000;
  assert.deepEqual(
    buildPreseasonProjections(data).map((row) => row.rating),
    before.map((row) => row.rating),
  );
  data.season.categories = ["PM"];
  assert.equal(buildPreseasonProjections(data)[0]!.teamId, "b");
  assert.throws(
    () => seasonCategories({ categories: ["unknown"] }),
    /Unsupported/,
  );
});

void test("current/future NHL results cannot alter the projection", () => {
  const data = fixture();
  const before = buildPreseasonProjections(data);
  data.playerNhlRows.push({
    ...data.playerNhlRows[0],
    seasonId: "next",
    G: 1000,
    GP: 82,
  });
  assert.deepEqual(buildPreseasonProjections(data), before);
});

void test("small samples regress more and unproven players are retained", () => {
  const data = fixture();
  data.playerNhlRows[0] = { ...data.playerNhlRows[0], GP: 2, G: 2 };
  data.playerNhlRows[3] = { ...data.playerNhlRows[3], GP: 82, G: 82 };
  data.playerNhlRows.push({
    seasonId: "prior",
    playerId: "league-average",
    nhlPos: ["C"],
    GP: 82,
    G: 10,
  });
  data.rosters.push({ playerId: "rookie", gshlTeamId: "a", nhlPos: ["C"] });
  const players = projectPreseasonPlayers(data);
  assert.ok(players.get("a-C")!.rates.G! < players.get("b-C")!.rates.G!);
  assert.ok(players.get("rookie")!.rates.G! > 0);
  assert.equal(
    buildPreseasonProjections(data).find((row) => row.teamId === "a")!
      .unprovenPlayers,
    1,
  );
});

void test("goalie ratios use shots and minutes, and no goalie cannot qualify", () => {
  const data = fixture();
  const player = projectPreseasonPlayers(data).get("a-G")!;
  assert.ok(Math.abs(player.rates.SVP! - 0.91) < 1e-12);
  assert.ok(Math.abs(player.rates.GAA! - 2.7) < 1e-12);
  data.rosters = data.rosters.filter((row) => row.playerId !== "b-G");
  const result = buildPreseasonProjections(data);
  const missing = result.find((row) => row.teamId === "b")!;
  assert.equal(missing.projectedStarts, 0);
  assert.equal(missing.goalieQualification, 0);
  assert.equal(missing.categoryStrength.GAA, -2.5);
});

void test("lineup eligibility matters and inputs remain immutable", () => {
  const data = fixture();
  data.season.rosterSpots = ["D"];
  const saved = structuredClone(data);
  const output = buildPreseasonProjections(data);
  assert.deepEqual(data, saved);
  assert.deepEqual(buildPreseasonProjections(data), output);
  data.rosters = data.rosters.filter((row) => row.playerId !== "a-D");
  assert.equal(
    buildPreseasonProjections(data).find((row) => row.teamId === "a")!
      .projectedWeeklyStats.G ?? 0,
    0,
  );
});

void test("all 14 full teams receive finite projections without any games", () => {
  const data = fixture();
  data.teams = Array.from({ length: 14 }, (_, index) => ({
    id: `team-${index}`,
  }));
  data.rosters = data.teams.flatMap((team) =>
    Array.from({ length: 15 }, (_, index) => ({
      playerId: `${String(team.id)}-${index}`,
      gshlTeamId: team.id,
      nhlPos: [index === 14 ? "G" : index < 3 ? "D" : "C"],
    })),
  );
  const result = buildPreseasonProjections(data);
  assert.equal(result.length, 14);
  assert.ok(
    result.every((row) => Number.isFinite(row.rating) && row.rosterSize === 15),
  );
});

void test("draft rosters seed Week 1 before stat rows exist and rated-week play cannot leak", async () => {
  const input = fixture();
  const data = {
    seasons: input.seasons,
    teams: input.teams,
    franchises: [],
    playerNhlRows: input.playerNhlRows,
    draftPicks: input.rosters.map((row) => ({ ...row, seasonId: "next" })),
    weeks: [
      {
        id: "w1",
        seasonId: "next",
        startDate: "2026-10-01",
        endDate: "2026-10-07",
        isActive: true,
        weekNum: 1,
        weekType: "RS",
      },
    ],
  };
  const result = await runPowerRankingsFixture("next", data, {
    todayDate: "2026-10-02",
  });
  const projection = buildPreseasonProjections(input);
  for (const row of result.weekUpdates ?? []) {
    assert.equal(
      row.powerRating,
      projection.find((team) => team.teamId === row.gshlTeamId)!.rating,
    );
  }
  const withResults = await runPowerRankingsFixture(
    "next",
    {
      ...data,
      playerWeeks: [
        {
          seasonId: "next",
          weekId: "w1",
          playerId: "b-C",
          GP: 99,
          Rating: 125,
        },
      ],
    },
    { todayDate: "2026-10-02" },
  );
  assert.deepEqual(
    structuredClone(withResults.weekUpdates),
    structuredClone(result.weekUpdates),
  );
});

void test("preseason weight falls to zero after four completed weeks", async () => {
  const input = fixture();
  const weeks = Array.from({ length: 5 }, (_, index) => ({
    id: `w${index + 1}`,
    seasonId: "next",
    weekNum: index + 1,
    weekType: "RS",
    startDate: `2026-10-${String(1 + 7 * index).padStart(2, "0")}`,
    endDate:
      index === 4
        ? "2026-11-04"
        : `2026-10-${String(7 + 7 * index).padStart(2, "0")}`,
    isActive: index === 4,
  }));
  const result = await runPowerRankingsFixture(
    "next",
    {
      seasons: input.seasons,
      teams: input.teams,
      franchises: [],
      weeks,
      playerNhlRows: input.playerNhlRows,
      draftPicks: input.rosters.map((row) => ({ ...row, seasonId: "next" })),
      teamWeeks: weeks.slice(0, 4).flatMap((week) =>
        input.teams.map((team) => ({
          seasonId: "next",
          weekId: week.id,
          gshlTeamId: team.id,
          GP: 20,
          G: team.id === "b" ? 20 : 2,
          A: 10,
          P: 20,
          PPP: 5,
          SOG: 80,
          HIT: 25,
          BLK: 20,
          W: 2,
          GAA: 3,
          SVP: 0.9,
        })),
      ),
    },
    { todayDate: "2026-10-30" },
  );
  const preseason = buildPreseasonProjections(input);
  for (const row of result.weekUpdates ?? []) {
    const completed = Number(String(row.weekId).slice(1)) - 1;
    const weight = Math.max(0, 1 - completed / 4);
    const prior = preseason.find(
      (team) => team.teamId === row.gshlTeamId,
    )!.score;
    const regular =
      0.25 * Number(row.powerStatScore) +
      0.3 * Number(row.powerStatEwma) +
      0.1 * Number(row.powerGmScore);
    assert.ok(
      Math.abs(
        Number(row.powerComposite) - (weight * prior + (1 - weight) * regular),
      ) < 1e-10,
    );
  }
});
