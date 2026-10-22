import assert from "node:assert/strict";
import test from "node:test";
import {
  parseOfficialPenaltyShotContext,
  applyOfficialPenaltyShotContext,
} from "./official-penalty-shot-context";
import { penaltyShotGameMatches } from "./official-penalty-shot-report";
import {
  extractShotTrainingRows,
  buildGameValueData,
} from "./game-value-input";
function fixture() {
  const shooter = 8459587,
    goalie = 8468524,
    offender = 8468695,
    winner = 8456966,
    loser = 8470612;
  const p = (
    eventId: number,
    sortOrder: number,
    timeInPeriod: string,
    typeDescKey: string,
    details: Record<string, unknown>,
  ) => ({
    eventId,
    sortOrder,
    timeInPeriod,
    typeDescKey,
    periodDescriptor: { number: 3, periodType: "REG" },
    situationCode: "1551",
    details,
  });
  const raw = {
    id: 2009020519,
    gameType: 2,
    gameState: "OFF",
    gameDate: "2009-12-19",
    homeTeam: { id: 24, abbrev: "ANA", score: 0 },
    awayTeam: { id: 27, abbrev: "PHX", score: 0 },
    rosterSpots: [
      {
        playerId: shooter,
        teamId: 24,
        sweaterNumber: 22,
        positionCode: "C",
        lastName: { default: "Marchant" },
      },
      {
        playerId: goalie,
        teamId: 27,
        sweaterNumber: 30,
        positionCode: "G",
        lastName: { default: "Bryzgalov" },
      },
      {
        playerId: offender,
        teamId: 27,
        sweaterNumber: 15,
        positionCode: "C",
        lastName: { default: "Lombardi" },
      },
      {
        playerId: winner,
        teamId: 27,
        sweaterNumber: 20,
        positionCode: "C",
        lastName: { default: "Lang" },
      },
      {
        playerId: loser,
        teamId: 24,
        sweaterNumber: 15,
        positionCode: "C",
        lastName: { default: "Getzlaf" },
      },
    ],
    plays: [
      p(669, 562, "17:20", "missed-shot", {
        shootingPlayerId: shooter,
        goalieInNetId: goalie,
        eventOwnerTeamId: 24,
        shotType: "backhand",
        xCoord: 73,
        yCoord: 0,
        zoneCode: "O",
      }),
      p(474, 563, "17:21", "penalty", {
        typeCode: "PS",
        descKey: "ps-hooking-on-breakaway",
        duration: 0,
        committedByPlayerId: offender,
        drawnByPlayerId: shooter,
        eventOwnerTeamId: 27,
      }),
      p(671, 567, "17:21", "faceoff", {
        winningPlayerId: winner,
        losingPlayerId: loser,
        eventOwnerTeamId: 27,
      }),
    ],
  };
  const sk = (playerId: number, sog = 0) => ({
      playerId,
      sog,
      goals: 0,
      toi: "20:00",
      name: { default: "Official player" },
    }),
    g = (shotsAgainst: number) => ({
      playerId: goalie,
      shotsAgainst,
      goalsAgainst: 0,
      toi: "20:00",
      name: { default: "Bryzgalov" },
    });
  const box = {
    id: raw.id,
    gameDate: raw.gameDate,
    homeTeam: { id: 24, sog: 1, score: 0 },
    awayTeam: { id: 27, sog: 0, score: 0 },
    playerByGameStats: {
      homeTeam: {
        forwards: [sk(shooter, 1), sk(loser)],
        defense: [],
        goalies: [],
      },
      awayTeam: {
        forwards: [sk(offender), sk(winner)],
        defense: [],
        goalies: [g(1)],
      },
    },
  };
  const row = (
    ordinal: number,
    kind: string,
    description: string,
    away: string,
    home: string,
  ) =>
    `<tr>${[String(ordinal), "3", "EV", "17:212:39", kind, description, away, home].map((s) => `<td>${s}</td>`).join("")}</tr>`;
  const html = `<title>Play By Play</title><table><tr><td>Game 0519</td><td>Saturday, December 19, 2009</td></tr>${row(313, "PENL", "PHX #15 LOMBARDI PS - Hooking on breakaway(0 min), Def. Zone Drawn By: ANA #22 MARCHANT", "15 C 30 G", "22 C")}${row(314, "SHOT", "ANA ONGOAL - #22 MARCHANT, Penalty Shot, Snap, Off. Zone, 19 ft.", "30 G", "22 C")}${row(315, "FAC", "PHX won Def. Zone - PHX #20 LANG vs ANA #15 GETZLAF", "20 C 30 G", "15 C 22 C")}</table>`;
  const totals = [
    {
      gameId: raw.id,
      gameDate: raw.gameDate,
      playerId: shooter,
      teamAbbrev: "ANA",
      opponentTeamAbbrev: "PHX",
      penaltyShotAttempts: 1,
      penaltyShotsGoals: 0,
      penaltyShotsFailed: 1,
    },
  ];
  const hashes = {
    pbpSha256: "a".repeat(64),
    htmlSha256: "b".repeat(64),
    boxSha256: "c".repeat(64),
    scopedPenaltyLedgerSha256: "d".repeat(64),
  };
  return { raw, box, html, totals, hashes };
}
test("exact missing terminal PS restores one official saved attempt, no ordinary geometry or extra chance", () => {
  const f = fixture(),
    before = JSON.stringify(f),
    proof = parseOfficialPenaltyShotContext(
      f.html,
      f.raw,
      f.box,
      f.totals,
      f.hashes,
    ),
    fixed = applyOfficialPenaltyShotContext(f.raw, proof, f.hashes.pbpSha256);
  assert.equal(
    proof.version,
    "nhl-official-missing-native-saved-penalty-shot-v4",
  );
  assert.deepEqual(proof.penaltyShotEventIds, [2000000314]);
  assert.equal(fixed.plays.length, f.raw.plays.length + 1);
  assert.equal(fixed.plays[1]!.eventId, 474);
  assert.equal(fixed.plays[2]!.eventId, 2000000314);
  assert.equal(fixed.plays[3]!.eventId, 671);
  assert.equal("xCoord" in fixed.plays[2]!.details, false);
  assert.equal("yCoord" in fixed.plays[2]!.details, false);
  assert.equal("zoneCode" in fixed.plays[2]!.details, false);
  assert.equal(fixed.plays[2]!.details.nhlReportPenaltyShot, true);
  assert.deepEqual(
    fixed.plays.filter((p) => p.eventId !== 2000000314),
    f.raw.plays,
  );
  assert.equal(penaltyShotGameMatches(fixed, f.totals), true);
  const ordinary = extractShotTrainingRows(f.raw);
  assert.equal(ordinary.length, 1);
  assert.deepEqual(extractShotTrainingRows(fixed), ordinary);
  const parsed = buildGameValueData(
      { pbp: fixed, box: f.box, shifts: [] },
      [],
      new Map(ordinary.map((r) => [r.eventId, 0])),
      0.31,
    ),
    terminal = parsed.shots.filter((s) => s.attribution === "penalty-shot");
  assert.equal(terminal.length, 1);
  assert.equal(terminal[0]!.xg, 0.31);
  assert.equal(terminal[0]!.kind, "SHOT");
  assert.equal(JSON.stringify(f), before);
});
test("no loose matching on report identity, shooter, goalie, award, clock, resumption or ledger", () => {
  for (const [from, to] of [
    ["Game 0519", "Game 0520"],
    ["December 19", "December 20"],
    ["#22 MARCHANT, Penalty Shot", "#22 OTHER, Penalty Shot"],
    ["30 G</td><td>22 C", "31 G</td><td>22 C"],
    ["PS - Hooking", "Hooking"],
    ["<td>314</td>", "<td>316</td>"],
    ["vs ANA #15 GETZLAF", "vs ANA #15 OTHER"],
  ]) {
    const f = fixture();
    assert.throws(
      () =>
        parseOfficialPenaltyShotContext(
          f.html.replaceAll(from, to),
          f.raw,
          f.box,
          f.totals,
          f.hashes,
        ),
      Error,
      from,
    );
  }
  const f = fixture();
  f.raw.plays[1]!.details.drawnByPlayerId = 999;
  assert.throws(
    () =>
      parseOfficialPenaltyShotContext(f.html, f.raw, f.box, f.totals, f.hashes),
    /award/,
  );
  const b = fixture();
  b.raw.plays[2]!.timeInPeriod = "17:22";
  assert.throws(
    () =>
      parseOfficialPenaltyShotContext(b.html, b.raw, b.box, b.totals, b.hashes),
    /faceoff/,
  );
  const c = fixture();
  c.totals[0]!.penaltyShotsGoals = 1;
  assert.throws(
    () =>
      parseOfficialPenaltyShotContext(c.html, c.raw, c.box, c.totals, c.hashes),
    /scope/,
  );
});
test("existing/colliding attempts and any additional official workload discrepancy reject", () => {
  const f = fixture(),
    proof = parseOfficialPenaltyShotContext(
      f.html,
      f.raw,
      f.box,
      f.totals,
      f.hashes,
    ),
    fixed = applyOfficialPenaltyShotContext(f.raw, proof, f.hashes.pbpSha256);
  assert.throws(
    () =>
      parseOfficialPenaltyShotContext(f.html, fixed, f.box, f.totals, f.hashes),
    /collision|absent/,
  );
  const c = fixture();
  c.raw.plays[0]!.eventId = 2000000314;
  assert.throws(
    () =>
      parseOfficialPenaltyShotContext(c.html, c.raw, c.box, c.totals, c.hashes),
    /collision/,
  );
  const d = fixture();
  d.raw.plays[0]!.sortOrder = 564;
  assert.throws(
    () =>
      parseOfficialPenaltyShotContext(d.html, d.raw, d.box, d.totals, d.hashes),
    /collision/,
  );
  const e = fixture();
  e.box.playerByGameStats.awayTeam.goalies[0]!.shotsAgainst = 2;
  assert.throws(
    () =>
      parseOfficialPenaltyShotContext(e.html, e.raw, e.box, e.totals, e.hashes),
    /conservation/,
  );
  const g = fixture();
  g.box.playerByGameStats.homeTeam.forwards[1]!.sog = 1;
  assert.throws(
    () =>
      parseOfficialPenaltyShotContext(g.html, g.raw, g.box, g.totals, g.hashes),
    /conservation/,
  );
  const h = fixture();
  h.box.homeTeam.sog = 2;
  assert.throws(
    () =>
      parseOfficialPenaltyShotContext(h.html, h.raw, h.box, h.totals, h.hashes),
    /conservation/,
  );
  const changed = structuredClone(proof);
  changed.missingNative!.shotType = "wrist" as "snap";
  assert.throws(
    () => applyOfficialPenaltyShotContext(f.raw, changed, f.hashes.pbpSha256),
    /identity/,
  );
  assert.throws(
    () => applyOfficialPenaltyShotContext(f.raw, proof, "e".repeat(64)),
    /hash/,
  );
});
