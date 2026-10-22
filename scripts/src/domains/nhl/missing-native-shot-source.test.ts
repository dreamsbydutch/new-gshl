import assert from "node:assert/strict";
import test from "node:test";
import { bridgeMissingNativeShotSource } from "./missing-native-shot-source";
import type { HistoricalRawShot } from "./historical-shot-source-bridge";
function fixture() {
  const home = { id: 13, abbrev: "FLA", score: 5 },
    away = { id: 14, abbrev: "TBL", score: 2 };
  const rosterSpots = [
    {
      playerId: 101,
      teamId: 13,
      sweaterNumber: 11,
      positionCode: "C",
      lastName: { default: "Home" },
    },
    {
      playerId: 201,
      teamId: 14,
      sweaterNumber: 21,
      positionCode: "C",
      lastName: { default: "Away" },
    },
    {
      playerId: 901,
      teamId: 13,
      sweaterNumber: 30,
      positionCode: "G",
      lastName: { default: "Keeper" },
    },
    {
      playerId: 902,
      teamId: 14,
      sweaterNumber: 40,
      positionCode: "G",
      lastName: { default: "Goalie" },
    },
  ];
  const plays: Array<{
      eventId: number;
      sortOrder: number;
      typeDescKey: string;
      periodDescriptor: { number: number; periodType: string };
      timeInPeriod: string;
      details: Record<string, unknown>;
    }> = [],
    rows: HistoricalRawShot[] = [];
  const clock = (s: number) =>
      `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
    reportRows: string[] = [];
  const report = (
    ordinal: number,
    second: number,
    kind: string,
    description: string,
  ) =>
    reportRows.push(
      `<tr>${[ordinal, 1, "EV", clock(second) + clock(1200 - second), kind, description, "21 C 40 G", "11 C 30 G"].map((s) => `<td>${s}</td>`).join("")}</tr>`,
    );
  const shot = (
    ordinal: number,
    second: number,
    isHome: boolean,
    kind: "SHOT" | "GOAL",
  ) =>
    rows.push({
      gameId: 2009020714,
      ordinal,
      period: 1,
      second,
      kind,
      shooter: isHome ? 101 : 201,
      goalie: isHome ? 902 : 901,
      home: isHome,
      x: 60,
      y: 5,
      homeSkaters: 1,
      awaySkaters: 1,
      homeGoalie: true,
      awayGoalie: true,
      shotType: "wrist",
    });
  for (let i = 0; i < 7; i++) {
    const isHome = i < 5,
      id = 147802 + i,
      second = 100 + i;
    plays.push({
      eventId: id,
      sortOrder: 900 + i,
      typeDescKey: "goal",
      periodDescriptor: { number: 1, periodType: "REG" },
      timeInPeriod: clock(second),
      details: {
        eventOwnerTeamId: isHome ? 13 : 14,
        scoringPlayerId: isHome ? 101 : 201,
        goalieInNetId: isHome ? 902 : 901,
        originalCounter: i,
      },
    });
    report(
      i + 1,
      second,
      "GOAL",
      `${isHome ? "FLA #11 HOME" : "T.B #21 AWAY"}, Wrist, Off. Zone, 30 ft.`,
    );
    shot(i + 1, second, isHome, "GOAL");
  }
  for (const [i, id] of [174, 360, 922, 1684, 1846, 2084, 2629].entries()) {
    const second = 200 + i;
    plays.push({
      eventId: id,
      sortOrder: 1000 + i,
      typeDescKey: "penalty",
      periodDescriptor: { number: 1, periodType: "REG" },
      timeInPeriod: clock(second),
      details: {
        eventOwnerTeamId: 13,
        committedByPlayerId: 101,
        duration: 2,
        typeCode: "MIN",
      },
    });
    report(20 + i, second, "PENL", "FLA #11 HOME Slashing(2 min), Def. Zone");
  }
  for (let i = 0; i < 65; i++) {
    const home = i < 18,
      ordinal = 100 + i,
      second = 500 + i;
    report(
      ordinal,
      second,
      "SHOT",
      `${home ? "FLA ONGOAL - #11 HOME" : "T.B ONGOAL - #21 AWAY"}, Wrist, Off. Zone, 30 ft.`,
    );
    shot(ordinal, second, home, "SHOT");
  }
  const raw = {
    id: 2009020714,
    gameType: 2,
    gameState: "OFF",
    gameDate: "2010-01-16",
    homeTeam: home,
    awayTeam: away,
    rosterSpots,
    plays,
  };
  const box = {
    id: raw.id,
    gameDate: raw.gameDate,
    homeTeam: { ...home, sog: 23 },
    awayTeam: { ...away, sog: 49 },
    playerByGameStats: {
      homeTeam: {
        forwards: [{ playerId: 101, sog: 23, goals: 5 }],
        defense: [],
        goalies: [{ playerId: 901, shotsAgainst: 49, goalsAgainst: 2 }],
      },
      awayTeam: {
        forwards: [{ playerId: 201, sog: 49, goals: 2 }],
        defense: [],
        goalies: [{ playerId: 902, shotsAgainst: 23, goalsAgainst: 5 }],
      },
    },
  };
  const html = `<title>Play By Play</title><table><tr><td>Game 0714</td><td>Saturday, January 16, 2010</td></tr>${reportRows.join("")}</table>`;
  const provenance = {
    providerUrl: "https://peter-tanner.com/moneypuck/downloads/shots_2009.zip",
    providerSha256: "a".repeat(64),
    officialPlayReportUrl:
      "https://www.nhl.com/scores/htmlreports/20092010/PL020714.HTM",
    officialPlayReportSha256: "b".repeat(64),
    officialPbpSha256: "c".repeat(64),
  };
  return {
    raw,
    rows,
    html,
    box,
    provenance,
    boxProof: {
      url: "https://api-web.nhle.com/v1/gamecenter/2009020714/boxscore",
      sha256: "d".repeat(64),
    },
  };
}
const run = (f: ReturnType<typeof fixture>) =>
  bridgeMissingNativeShotSource(
    f.raw,
    f.rows,
    f.html,
    f.box,
    f.provenance,
    f.boxProof,
  );
test("only the reviewed missing65 official SOG restore with full independent counts and explicit source lineage", () => {
  const f = fixture(),
    before = JSON.stringify(f),
    r = run(f),
    lineage = r.audit.reviewedMissingOnGoal;
  assert.equal(JSON.stringify(f), before);
  assert.equal(lineage.originalNativeEventCount, 14);
  assert.equal(lineage.reportDerivedOnGoalEventIds.length, 65);
  assert.equal(
    r.pbp.plays.filter((p) => p.typeDescKey === "shot-on-goal").length,
    65,
  );
  assert.equal(r.pbp.plays.filter((p) => p.typeDescKey === "goal").length, 7);
  for (const native of f.raw.plays) {
    const kept = r.pbp.plays.find((p) => p.eventId === native.eventId)!;
    assert.equal(kept.typeDescKey, native.typeDescKey);
    assert.equal(kept.timeInPeriod, native.timeInPeriod);
    for (const [k, v] of Object.entries(native.details))
      assert.deepEqual(kept.details?.[k], v);
  }
  for (const id of lineage.reportDerivedOnGoalEventIds) {
    const shot = r.pbp.plays.find((p) => p.eventId === id)!;
    assert.equal(
      shot.details?.nhlOfficialDerivedEvent,
      "reviewed-missing-native-on-goal-v1",
    );
    assert.equal(shot.details?.xCoord, 60);
  }
  assert.equal(r.audit.providerProbabilitiesUsed, false);
  assert.ok(lineage.derivedIdentitySource.includes("never native"));
  assert.equal(lineage.teamCounts.length, 2);
  assert.equal(lineage.playerCounts.length, 2);
  assert.equal(lineage.goalieCounts.length, 2);
});
test("scope, original population, official identity, counts and source collisions fail closed", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.raw.id = 2009020718;
    },
    (f: ReturnType<typeof fixture>) => {
      f.raw.gameDate = "2010-01-17";
    },
    (f: ReturnType<typeof fixture>) => {
      f.raw.plays.pop();
    },
    (f: ReturnType<typeof fixture>) => {
      f.raw.plays[0]!.eventId = 999;
    },
    (f: ReturnType<typeof fixture>) => {
      f.html = f.html.replace("Game 0714", "Game 0718");
    },
    (f: ReturnType<typeof fixture>) => {
      f.html = f.html.replace("ONGOAL - #11 HOME", "ONGOAL - #11 OTHER");
    },
    (f: ReturnType<typeof fixture>) => {
      f.html = f.html.replace("<td>100</td>", "<td>101</td>");
    },
    (f: ReturnType<typeof fixture>) => {
      f.box.homeTeam.sog = 22;
    },
    (f: ReturnType<typeof fixture>) => {
      f.box.playerByGameStats.homeTeam.forwards[0]!.sog = 22;
    },
    (f: ReturnType<typeof fixture>) => {
      f.box.playerByGameStats.awayTeam.goalies[0]!.shotsAgainst = 22;
    },
    (f: ReturnType<typeof fixture>) => {
      f.boxProof.sha256 = "invalid";
    },
    (f: ReturnType<typeof fixture>) => {
      f.raw.rosterSpots.push({ ...f.raw.rosterSpots[0]!, playerId: 999 });
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => run(f));
  }
});
test("unverified provider actor, clock, duplicate and manpower cannot turn restored official SOG into credited events", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.rows[7]!.goalie = 999;
    },
    (f: ReturnType<typeof fixture>) => {
      f.rows[7]!.second += 1;
    },
    (f: ReturnType<typeof fixture>) => {
      f.rows[7]!.homeSkaters = 2;
    },
    (f: ReturnType<typeof fixture>) => {
      f.rows.push({ ...f.rows[7]! });
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => run(f));
  }
});
