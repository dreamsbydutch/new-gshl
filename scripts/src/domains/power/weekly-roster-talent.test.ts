import assert from "node:assert/strict";
import test from "node:test";
import {
  buildWeeklyTalentSnapshots,
  type WeeklyTalentInput,
} from "../../runtime/weekly-roster-talent";

function fixture(): WeeklyTalentInput {
  const season = {
    id: "now",
    year: 2026,
    categories: ["G", "BLK"],
    rosterSpots: ["C", "D", "G", "BN"],
  };
  const players = ["a", "b", "c"].flatMap((team) =>
    ["C", "D", "G"].map((pos) => ({
      playerId: `${team}-${pos}`,
      gshlTeamId: team,
      nhlPos: [pos],
      posGroup: pos === "C" ? "F" : pos,
      GP: 82,
      G: pos === "C" ? 30 : 5,
      A: 20,
      BLK: pos === "D" ? 150 : 20,
      W: 35,
      SV: 1500,
      SA: 1650,
      GA: 150,
      TOI: 3300,
    })),
  );
  return {
    season,
    seasons: [{ id: "prior", year: 2025 }, season],
    teams: ["a", "b", "c"].map((id) => ({ id, seasonId: "now" })),
    weeks: [
      {
        id: "old",
        seasonId: "prior",
        startDate: "2025-10-01",
        endDate: "2025-10-07",
      },
      {
        id: "w1",
        seasonId: "now",
        startDate: "2026-10-01",
        endDate: "2026-10-07",
      },
      {
        id: "w2",
        seasonId: "now",
        startDate: "2026-10-08",
        endDate: "2026-10-14",
      },
    ],
    playerNhlRows: players.map((row) => ({ ...row, seasonId: "prior" })),
    playerDays: players.map((row) => ({
      playerId: row.playerId,
      gshlTeamId: row.gshlTeamId,
      nhlPos: row.nhlPos,
      posGroup: row.posGroup,
      seasonId: "now",
      weekId: "w1",
      date: "2026-10-01",
      dailyPos: "BN",
      GP: 0,
    })),
    draftPicks: [],
    teamWeeks: [10, 20, 30, 40, 50].map((G) => ({
      seasonId: "prior",
      weekId: "old",
      GP: 30,
      G,
      BLK: G * 3,
      W: 2,
      GAA: 3,
      SVP: 0.91,
    })),
  };
}
function snapshot(input: WeeklyTalentInput, teamId = "a", weekId = "w2") {
  return buildWeeklyTalentSnapshots(input).find(
    (row) => row.teamId === teamId && row.weekId === weekId,
  )!;
}

test("missing roster evidence is unrated and cannot create a spurious talent signal", () => {
  const input = fixture();
  input.playerDays = input.playerDays.filter((row) => row.gshlTeamId !== "a");
  const result = snapshot(input);
  assert.equal(result.rating, null);
  assert.equal(result.score, 0);
  assert.equal(result.rosterSize, 0);
});

test("talent ignores rating units, owner reputation and future performance; inputs are immutable", () => {
  const input = fixture(),
    before = structuredClone(input),
    baseline = buildWeeklyTalentSnapshots(input);
  input.playerNhlRows.forEach((row) => {
    row.overallRating = 9999;
    row.Rating = -9999;
  });
  input.playerDays.push(
    ...input.playerDays.map((row) => ({
      ...row,
      date: "2026-10-08",
      GP: 1,
      G: 99999,
    })),
  );
  assert.deepEqual(
    buildWeeklyTalentSnapshots(input).filter((row) => row.weekId === "w1"),
    baseline.filter((row) => row.weekId === "w1"),
  );
  assert.equal(
    snapshot(input).projectedWeeklyStats.G,
    snapshot(before).projectedWeeklyStats.G,
  );
  const immutable = structuredClone(input);
  buildWeeklyTalentSnapshots(input);
  assert.deepEqual(input, immutable);
});

test("raw bench appearances update ability but active-week and unfinalized results do not", () => {
  const input = fixture(),
    baseline = snapshot(input);
  for (let d = 2; d <= 7; d++)
    input.playerDays.push(
      ...input.playerDays.slice(0, 9).map((row) => ({
        ...row,
        date: `2026-10-0${d}`,
        GP: row.playerId === "a-C" ? 1 : 0,
        G: row.playerId === "a-C" ? 3 : 0,
        lineupAccountingFinalized: true,
      })),
    );
  assert.ok(
    snapshot(input).projectedWeeklyStats.G! > baseline.projectedWeeklyStats.G!,
  );
  assert.equal(
    snapshot(input, "a", "w1").projectedWeeklyStats.G,
    snapshot(fixture(), "a", "w1").projectedWeeklyStats.G,
  );
  input.playerDays.slice(9).forEach((row) => {
    row.lineupAccountingFinalized = false;
  });
  assert.equal(
    snapshot(input).projectedWeeklyStats.G,
    baseline.projectedWeeklyStats.G,
  );
});

test("adding usable bench depth increases production; deleting it cannot improve the average", () => {
  const input = fixture(),
    before = snapshot(input);
  const bench = { ...input.playerNhlRows[0], playerId: "bench", G: 10 };
  input.playerNhlRows.push(bench);
  input.playerDays.push({ ...input.playerDays[0], playerId: "bench" });
  const after = snapshot(input);
  assert.ok(after.projectedWeeklyStats.G! > before.projectedWeeklyStats.G!);
  assert.ok(after.expectedCategoryPoints >= before.expectedCategoryPoints);
  assert.equal(after.reference, "historical");
});

test("lineup slots and current IR status limit contribution", () => {
  const input = fixture(),
    baseline = snapshot(input);
  input.season.rosterSpots = ["D", "G"];
  assert.ok(
    snapshot(input).projectedWeeklyStats.G! < baseline.projectedWeeklyStats.G!,
  );
  input.season.rosterSpots = ["C", "D", "G"];
  input.playerDays[0]!.dailyPos = "IR+";
  const injured = snapshot(input);
  assert.equal(injured.unavailablePlayers, 1);
  assert.ok(injured.projectedWeeklyStats.G! < baseline.projectedWeeklyStats.G!);
});

test("missing history retains conservative position priors and reports coverage", () => {
  const input = fixture();
  input.playerNhlRows = input.playerNhlRows.filter(
    (row) => row.playerId !== "a-C",
  );
  const result = snapshot(input);
  assert.equal(result.rosterSize, 3);
  assert.equal(result.unprovenPlayers, 1);
  assert.ok(result.projectedWeeklyStats.G! > 0);
  assert.ok(Number.isFinite(result.rating));
});

test("off days do not reduce availability; verified missed NHL games do", () => {
  const input = fixture();
  for (let d = 2; d <= 7; d++)
    input.playerDays.push(
      ...input.playerDays
        .slice(0, 9)
        .map((row) => ({ ...row, date: `2026-10-0${d}`, GP: 0 })),
    );
  const off = snapshot(input);
  assert.equal(
    off.projectedAppearances,
    snapshot(fixture()).projectedAppearances,
  );
  input.playerDays.slice(9).forEach((row) => {
    row.MG = 1;
  });
  assert.ok(snapshot(input).projectedAppearances < off.projectedAppearances);
});

test("traded player evidence is deduplicated and current membership replaces old snapshots", () => {
  const input = fixture();
  const played = { ...input.playerDays[0], date: "2026-10-02", GP: 1, G: 4 };
  input.playerDays.push(played);
  const before = snapshot(input);
  input.playerDays.push({ ...played, gshlTeamId: "b" });
  assert.equal(
    snapshot(input).projectedWeeklyStats.G,
    before.projectedWeeklyStats.G,
  );
  // A new full snapshot removes the traded player rather than unioning old membership.
  input.playerDays.push(
    ...input.playerDays
      .filter(
        (row) =>
          row.date === "2026-10-01" &&
          row.gshlTeamId === "a" &&
          row.playerId !== "a-C",
      )
      .map((row) => ({ ...row, date: "2026-10-08" })),
  );
  assert.equal(snapshot(input).rosterSize, 2);
});

test("goalie ratios pool shots and minutes; qualification limits goalie category points", () => {
  const input = fixture();
  input.season.categories = ["W", "GAA", "SVP"];
  const result = snapshot(input);
  assert.ok(Math.abs(result.projectedWeeklyStats.SVP! - 1500 / 1650) < 1e-10);
  assert.ok(
    Math.abs(result.projectedWeeklyStats.GAA! - (60 * 150) / 3300) < 1e-10,
  );
  assert.ok(result.goalieQualification > 0 && result.goalieQualification < 1);
  input.playerDays = input.playerDays.filter((row) => row.playerId !== "a-G");
  const absent = snapshot(input);
  assert.equal(absent.goalieQualification, 0);
  assert.equal(absent.expectedCategoryPoints, 0);
});

test("reference uses preceding seasons only and normalizes extended weeks", () => {
  const input = fixture(),
    before = snapshot(input);
  input.teamWeeks.push({
    seasonId: "now",
    weekId: "w1",
    GP: 99,
    G: 99999,
    BLK: 99999,
  });
  assert.deepEqual(snapshot(input), before);
  input.weeks[0]!.endDate = "2025-10-14";
  input.teamWeeks
    .filter((row) => row.seasonId === "prior")
    .forEach((row) => {
      row.G = Number(row.G) * 2;
      row.BLK = Number(row.BLK) * 2;
    });
  assert.deepEqual(snapshot(input), before);
});
