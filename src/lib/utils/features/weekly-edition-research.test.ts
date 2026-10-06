import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ownerParticipation,
  researchCandidates,
  selectResearchEvidence,
  weeklyStatComparisons,
  buildMatchupCategoryComparison,
} from "./weekly-edition-research";
import type {
  WeeklyEditionFactPacket,
  WeeklyEditionResearch,
} from "@gshl-types";

const seasons = [2020, 2021, 2022, 2023].map((year) => ({
  id: String(year),
  name: `Season ${year}`,
  year,
}));

void test("matchup scouting compares shared production, ranks ties equally and respects inverse goalie ratios", () => {
  const options = {
    homeTeamId: "a",
    awayTeamId: "b",
    homeTeamName: "Alpha",
    awayTeamName: "Beta",
    startDate: "2026-10-01",
    endDate: "2026-10-07",
    rows: [
      { gshlTeamId: "a", stats: { GP: 20, G: 0, HIT: 40, GAA: 2, SVP: 0.92 } },
      {
        gshlTeamId: "b",
        stats: { GP: "20", G: "0", HIT: 20, GAA: 3, SVP: 0.93 },
      },
      {
        gshlTeamId: "c",
        stats: { GP: 30, G: 10, HIT: 40, GAA: null, SVP: "" },
      },
      {
        gshlTeamId: "unplayed",
        stats: { GP: 0, G: 100, HIT: 100, GAA: 0, SVP: 1 },
      },
    ],
  };
  const original = structuredClone(options);
  const result = buildMatchupCategoryComparison(options)!;
  const goals = result.categories.find((row) => row.category === "G")!;
  assert.equal(goals.homeValue, 0);
  assert.equal(goals.homeRank, 2);
  assert.equal(goals.awayRank, 2);
  assert.equal(goals.rankedTeams, 3);
  assert.equal(
    result.categories.find((row) => row.category === "HIT")!.homeRank,
    1,
  );
  const gaa = result.categories.find((row) => row.category === "GAA")!;
  assert.equal(gaa.homeRank, 1);
  assert.equal(gaa.awayRank, 2);
  assert.equal(gaa.rankedTeams, 2);
  assert.equal(gaa.lowerIsBetter, true);
  assert.equal(
    result.categories.find((row) => row.category === "SVP")!.awayRank,
    1,
  );
  assert.match(result.note, /one completed week, not a forecast/);
  assert.deepEqual(options, original);
  assert.equal(
    buildMatchupCategoryComparison({ ...options, awayTeamId: "unplayed" }),
    undefined,
  );
  assert.equal(
    buildMatchupCategoryComparison({
      ...options,
      rows: options.rows.map((row) => ({ ...row, stats: { GP: 2 } })),
    }),
    undefined,
  );
});

void test("preseason scouting labels model estimates and omits empty rosters", () => {
  const comparison = buildMatchupCategoryComparison({
    basis: "preseason_projection",
    homeTeamId: "a",
    awayTeamId: "b",
    homeTeamName: "Alpha",
    awayTeamName: "Beta",
    startDate: "2026-09-27",
    endDate: "2026-09-27",
    rows: [
      {
        gshlTeamId: "a",
        rosterSize: 15,
        goalieQualification: 0.9,
        stats: { G: 12, GAA: 2 },
      },
      {
        gshlTeamId: "b",
        rosterSize: 15,
        goalieQualification: 0.8,
        stats: { G: 10, GAA: 3 },
      },
      { gshlTeamId: "empty", rosterSize: 0, stats: { G: 0, GAA: 0 } },
    ],
  })!;
  assert.equal(comparison.basis, "preseason_projection");
  assert.equal(comparison.homeGoalieQualification, 0.9);
  assert.equal(comparison.categories[0]!.homeRank, 1);
  assert.equal(comparison.categories[0]!.rankedTeams, 2);
  assert.match(comparison.note, /not recorded results/);
  assert.match(comparison.note, /modeled probability/);
});

void test("participation identifies gaps by league seasons and ignores future teams", () => {
  assert.deepEqual(
    ownerParticipation(seasons, new Set(["2020", "2023"]), "2022"),
    {
      seasons: [seasons[0]],
      absentSeasons: 1,
      status: "returning",
    },
  );
  assert.equal(
    ownerParticipation(seasons, new Set(["2021"]), "2022").status,
    "continuing",
  );
  assert.equal(
    ownerParticipation(seasons, new Set(["2023"]), "2022").status,
    "first_recorded_season",
  );
});

void test("research exposes a return and scheduled opponent without scripting the connection", () => {
  const research: WeeklyEditionResearch = {
    asOf: "2022-09-01",
    analysisSeasonId: "2022",
    coverage: [],
    limitations: [],
    recentCoverage: [],
    owners: [
      {
        ownerId: "one",
        name: "Returning Owner",
        teamId: "a",
        teamName: "Alpha",
        ...ownerParticipation(seasons, new Set(["2020"]), "2022"),
      },
      {
        ownerId: "two",
        name: "Leading Owner",
        teamId: "b",
        teamName: "Beta",
        ...ownerParticipation(seasons, new Set(["2021"]), "2022"),
        ranking: {
          ownerId: "two",
          gmName: "Leading Owner",
          rank: 1,
          rating: 950,
          rankChange: 0,
          overallWins: 100,
          overallLosses: 50,
          playoffAppearances: 5,
          cups: 2,
        },
      },
    ],
  };
  const packet: WeeklyEditionFactPacket = {
    version: 1,
    season: { id: "2022", name: "Season 2022", year: "2022" },
    week: {
      id: "w",
      number: 1,
      startDate: "2022-10-01",
      endDate: "2022-10-07",
    },
    issueType: "preseason",
    issueLabel: "Preseason",
    teams: [],
    matchups: [],
    stars: [],
    activity: [],
    powerMovers: [],
    missedStarts: [],
    editorialCandidates: [],
    nextMatchups: [
      {
        matchupId: "opening",
        homeTeamId: "a",
        awayTeamId: "b",
        homeTeamName: "Alpha",
        awayTeamName: "Beta",
        startDate: "2022-10-01",
      },
    ],
  };
  const candidates = researchCandidates(packet, research);
  assert.match(candidates[0]!.summary, /absent for 1/);
  assert.match(candidates[1]!.summary, /rank 1/);
  assert.deepEqual(candidates[2]!.relatedTeamIds, ["a", "b"]);
  assert.match(candidates[2]!.summary, /Scheduled, not a completed result/);
  assert.equal(candidates[2]!.importance, 66);
  const weekly = researchCandidates(
    { ...packet, issueType: "weekly" },
    research,
  );
  assert.equal(
    weekly[2]!.importance,
    45,
    "weekly recap evidence takes precedence over upcoming fixtures",
  );
  assert.equal(
    candidates.some((candidate) =>
      /greeted|rivalry|revenge/.test(candidate.summary),
    ),
    false,
  );
});

void test("comparisons keep valid zeroes, skip missing baselines, and qualify samples", () => {
  const rows = weeklyStatComparisons(
    [{ teamId: "a", name: "Alpha" }],
    [{ gshlTeamId: "a", stats: { G: 0, A: "", GP: 20, MS: 2 } }],
    [{ gshlTeamId: "a", stats: { G: "10", A: 4, GP: 35, MS: null } }],
    ["G", "A"],
  );
  assert.deepEqual(rows[0]!.metrics, [
    { key: "G", label: "G", value: 0, previousValue: 10 },
    { key: "GP", label: "GP", value: 20, previousValue: 35 },
  ]);
  assert.match(rows[0]!.summary, /different games played/);
  assert.equal(
    weeklyStatComparisons([{ teamId: "a", name: "Alpha" }], [], [], ["G"])
      .length,
    0,
  );
});

void test("evidence budget preserves less prominent subjects and is deterministic", () => {
  const base = weeklyStatComparisons(
    [{ teamId: "a", name: "Alpha" }],
    [{ gshlTeamId: "a", stats: { G: 2 } }],
    [{ gshlTeamId: "a", stats: { G: 1 } }],
    ["G"],
  )[0]!;
  const candidates = Array.from({ length: 30 }, (_, index) => ({
    ...base,
    id: `high:${index}`,
    importance: 99,
  }));
  candidates.push({ ...base, id: "quiet", teamId: "b", importance: 40 });
  const original = [...candidates];
  const selected = selectResearchEvidence(candidates, 5);
  assert.equal(selected.length, 5);
  assert.ok(selected.some((row) => row.id === "quiet"));
  assert.deepEqual(
    selectResearchEvidence([...candidates].reverse(), 5),
    selected,
  );
  assert.deepEqual(candidates, original);
});
