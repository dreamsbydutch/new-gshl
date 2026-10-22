import assert from "node:assert/strict";
import test from "node:test";
import { planHistoricalNhlMetadata } from "./historical-native-backfill";

function fixture() {
  return {
    season: 20122013,
    games: [
      {
        id: 2012020001,
        season: 20122013,
        gameType: 2,
        gameStateId: 7,
        gameDate: "2013-01-19",
      },
      {
        id: 2012020720,
        season: 20122013,
        gameType: 2,
        gameStateId: 7,
        gameDate: "2013-04-28",
      },
    ],
    officialTeams: [{ id: 27, triCode: "PHX", fullName: "Phoenix Coyotes" }],
    requiredTeams: [{ nhlTeamAbbr: "PHX", officialTeamId: 27 }],
    seasons: [] as Record<string, unknown>[],
    teams: [] as Record<string, unknown>[],
  };
}
test("shortened season uses completed calendar and distinct historical club, without fantasy configuration", () => {
  const f = fixture(),
    before = structuredClone(f),
    p = planHistoricalNhlMetadata(f);
  assert.equal(p.seasonOperation.document.startDate, "2013-01-19");
  assert.equal(p.seasonOperation.document.endDate, "2013-04-28");
  assert.equal(p.seasonOperation.document.nhlOnly, true);
  assert.deepEqual(p.seasonOperation.document.categories, []);
  assert.deepEqual(p.teams[0]?.document, {
    abbr: "PHX",
    name: "Phoenix Coyotes",
    logoUrl: "",
  });
  assert.deepEqual(f, before);
  f.seasons.push({ ...p.seasonOperation.document, _id: "old" });
  f.teams.push({ _id: "phx", abbr: "PHX" });
  assert.equal(planHistoricalNhlMetadata(f).seasonOperation.action, "existing");
  assert.equal(planHistoricalNhlMetadata(f).teams[0]?.existingId, "phx");
});
test("wrong scope, fantasy collision, impossible dates, unfinished/duplicate games, and franchise guesses reject", () => {
  for (const mode of [
    "scope",
    "fantasy",
    "date",
    "unfinished",
    "duplicate",
    "club",
    "directory",
    "duplicate-club",
  ]) {
    const f = fixture();
    if (mode === "scope") f.season = 20132014;
    if (mode === "fantasy") f.seasons.push({ year: "2013", nhlOnly: false });
    if (mode === "date") f.games[0]!.gameDate = "2013-02-31";
    if (mode === "unfinished") f.games[0]!.gameStateId = 3;
    if (mode === "duplicate") f.games.push({ ...f.games[0]! });
    if (mode === "club") f.requiredTeams[0]!.nhlTeamAbbr = "ARI";
    if (mode === "directory") f.officialTeams.push({ ...f.officialTeams[0]! });
    if (mode === "duplicate-club")
      f.teams.push({ _id: "a", abbr: "PHX" }, { _id: "b", abbr: "PHX" });
    assert.throws(() => planHistoricalNhlMetadata(f), { name: "Error" }, mode);
  }
});
