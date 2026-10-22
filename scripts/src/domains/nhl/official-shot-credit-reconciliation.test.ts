import assert from "node:assert/strict";
import test from "node:test";
import {
  reconcileOfficialShotCredits,
  type OfficialShotCreditSources,
} from "./official-shot-credit-reconciliation";

function fixture(): OfficialShotCreditSources {
  const rosterSpots = [
    {
      playerId: 8457981,
      teamId: 1,
      sweaterNumber: 8,
      positionCode: "R",
      lastName: { default: "Selanne" },
    },
    {
      playerId: 8471676,
      teamId: 1,
      sweaterNumber: 9,
      positionCode: "R",
      lastName: { default: "Ryan" },
    },
    {
      playerId: 11,
      teamId: 1,
      sweaterNumber: 31,
      positionCode: "G",
      lastName: { default: "Visitor" },
    },
    {
      playerId: 21,
      teamId: 2,
      sweaterNumber: 40,
      positionCode: "G",
      lastName: { default: "Home" },
    },
  ];
  for (let i = 0; i < 3; i++)
    rosterSpots.push({
      playerId: 100 + i,
      teamId: 1,
      sweaterNumber: 10 + i,
      positionCode: "C",
      lastName: { default: `Away${i}` },
    });
  for (let i = 0; i < 5; i++)
    rosterSpots.push({
      playerId: 200 + i,
      teamId: 2,
      sweaterNumber: 1 + i,
      positionCode: "C",
      lastName: { default: `Home${i}` },
    });
  const homeTeam = { id: 2, abbrev: "PHX", score: 0 },
    awayTeam = { id: 1, abbrev: "ANA", score: 0 };
  const pbp = {
    id: 2009020961,
    gameType: 2,
    gameState: "OFF",
    gameDate: "2010-03-06",
    homeTeam,
    awayTeam,
    rosterSpots,
    plays: [
      {
        eventId: 1108,
        sortOrder: 252,
        typeDescKey: "shot-on-goal",
        periodDescriptor: { number: 3, periodType: "REG" },
        timeInPeriod: "16:42",
        situationCode: "1551",
        details: {
          shootingPlayerId: 8457981,
          goalieInNetId: 21,
          eventOwnerTeamId: 1,
          xCoord: 60,
          yCoord: 5,
          shotType: "wrist",
          zoneCode: "O",
          preservedCounter: 77,
        },
      },
      {
        eventId: 1109,
        sortOrder: 253,
        typeDescKey: "stoppage",
        periodDescriptor: { number: 3, periodType: "REG" },
        timeInPeriod: "16:43",
        details: { reason: "GOALIE STOPPED" },
      },
    ],
  };
  const box = {
    id: pbp.id,
    gameDate: pbp.gameDate,
    homeTeam: { ...homeTeam, sog: 0 },
    awayTeam: { ...awayTeam, sog: 1 },
    playerByGameStats: {
      homeTeam: {
        forwards: Array.from({ length: 5 }, (_, i) => ({
          playerId: 200 + i,
          sog: 0,
          goals: 0,
        })),
        defense: [],
        goalies: [{ playerId: 21, shotsAgainst: 1, goalsAgainst: 0 }],
      },
      awayTeam: {
        forwards: [
          { playerId: 8457981, sog: 0, goals: 0 },
          { playerId: 8471676, sog: 1, goals: 0 },
          ...Array.from({ length: 3 }, (_, i) => ({
            playerId: 100 + i,
            sog: 0,
            goals: 0,
          })),
        ],
        defense: [],
        goalies: [{ playerId: 11, shotsAgainst: 0, goalsAgainst: 0 }],
      },
    },
  };
  const identity =
    "<tr><td>Game 0961</td><td>Saturday, March 6, 2010</td></tr>";
  const playReportHtml = `<title>Play By Play</title><table>${identity}<tr>${[252, 3, "EV", "16:423:18", "SHOT", "ANA ONGOAL - #9 RYAN, Wrist, Off. Zone, 30 ft.", "8 R 9 R 10 C 11 C 12 C 31 G", "1 C 2 C 3 C 4 C 5 C 40 G"].map((s) => `<td>${s}</td>`).join("")}</tr></table>`;
  return {
    rawPbpText: JSON.stringify(pbp),
    effectivePbp: pbp,
    playReportHtml,
    gameSummaryHtml: `<title>Game Summary</title><img src="http://www.nhl.com/scores/htmlreports/images/logocana.gif"><img src="http://www.nhl.com/scores/htmlreports/images/logocphx.gif"><table>${identity}<tr><td>VISITOR 0 ANAHEIM DUCKS</td><td>Game Summary</td><td>HOME 0 PHOENIX COYOTES</td></tr></table>`,
    boxscoreText: JSON.stringify(box),
    providerArchive: {
      url: "https://peter-tanner.com/moneypuck/downloads/shots_2009.zip",
      sha256: "a".repeat(64),
    },
    providerRows: [
      {
        gameId: pbp.id,
        ordinal: 252,
        period: 3,
        second: 1002,
        kind: "SHOT",
        shooter: 8471676,
        goalie: 21,
        home: false,
        x: 60,
        y: 5,
        homeSkaters: 5,
        awaySkaters: 5,
        homeGoalie: true,
        awayGoalie: true,
        shotType: "wrist",
      },
    ],
  };
}

test("only the uniquely report/roster/archive-confirmed actor changes, with whole official counts", () => {
  const f = fixture(),
    before = JSON.stringify(f),
    result = reconcileOfficialShotCredits(f);
  assert.equal(JSON.stringify(f), before);
  const expected = JSON.parse(f.rawPbpText);
  expected.plays[0].details.shootingPlayerId = 8471676;
  assert.deepEqual(result.pbp, expected);
  assert.equal(result.proof.corrections.length, 1);
  assert.equal(result.proof.counts.length, 12);
  assert.notEqual(
    result.proof.preOverlayEffectivePbpSha256,
    result.proof.outputSha256,
  );
  assert.equal(
    result.proof.originalRawPbpSha256,
    result.proof.preOverlayEffectivePbpSha256,
  );
});

test("wrong scope, source identity, ambiguous report, altered facts and nonconserved population reject", () => {
  const mutations: Array<(f: OfficialShotCreditSources) => void> = [
    (f) => {
      const p = JSON.parse(f.rawPbpText);
      p.id = 2009020962;
      f.rawPbpText = JSON.stringify(p);
    },
    (f) => {
      f.playReportHtml = f.playReportHtml.replace("Game 0961", "Game 0962");
    },
    (f) => {
      f.gameSummaryHtml = f.gameSummaryHtml.replace("March 6", "March 7");
    },
    (f) => {
      f.gameSummaryHtml = f.gameSummaryHtml.replace("logocana", "logoctor");
    },
    (f) => {
      f.playReportHtml = f.playReportHtml.replace("#9 RYAN", "#9 OTHER");
    },
    (f) => {
      f.playReportHtml = f.playReportHtml.replace(
        "</table>",
        f.playReportHtml.match(/<tr><td>252[\s\S]+?<\/tr>/)![0] + "</table>",
      );
    },
    (f) => {
      f.providerRows = [{ ...f.providerRows[0]!, x: Infinity }];
    },
    (f) => {
      f.providerRows = [{ ...f.providerRows[0]!, goalie: 99 }];
    },
    (f) => {
      f.providerRows = [...f.providerRows, ...f.providerRows];
    },
    (f) => {
      const b = JSON.parse(f.boxscoreText);
      b.awayTeam.sog = 2;
      f.boxscoreText = JSON.stringify(b);
    },
    (f) => {
      const b = JSON.parse(f.boxscoreText);
      b.playerByGameStats.awayTeam.forwards[1].sog = 0;
      f.boxscoreText = JSON.stringify(b);
    },
    (f) => {
      const b = JSON.parse(f.boxscoreText);
      b.playerByGameStats.homeTeam.goalies[0].shotsAgainst = 0;
      f.boxscoreText = JSON.stringify(b);
    },
    (f) => {
      f.providerArchive.sha256 = "invalid";
    },
  ];
  for (const change of mutations) {
    const f = fixture();
    change(f);
    assert.throws(() => reconcileOfficialShotCredits(f));
  }
});

test("native geometry is preserved when archive coordinates differ or native geometry is absent", () => {
  const f = fixture();
  f.providerRows = [{ ...f.providerRows[0]!, x: 61, y: 4 }];
  const result = reconcileOfficialShotCredits(f);
  assert.deepEqual(result.proof.corrections[0]!.geometry, {
    nativeX: 60,
    nativeY: 5,
    providerX: 61,
    providerY: 4,
    agrees: false,
    policy:
      "Native geometry preserved exactly; no provider geometry substitution or new probability",
  });
  const raw = JSON.parse(f.rawPbpText);
  delete raw.plays[0].details.xCoord;
  delete raw.plays[0].details.yCoord;
  f.rawPbpText = JSON.stringify(raw);
  f.effectivePbp = raw;
  const missing = reconcileOfficialShotCredits(f);
  assert.equal(
    "xCoord" in (missing.pbp.plays as typeof raw.plays)[0].details,
    false,
  );
  assert.equal(
    "yCoord" in (missing.pbp.plays as typeof raw.plays)[0].details,
    false,
  );
});

test("GS overtime scoring is independently conserved and a changed goal clock rejects", () => {
  const f = fixture(),
    raw = JSON.parse(f.rawPbpText),
    box = JSON.parse(f.boxscoreText);
  raw.homeTeam.score = 1;
  box.homeTeam.score = 1;
  box.homeTeam.sog = 1;
  box.playerByGameStats.homeTeam.forwards[0].sog = 1;
  box.playerByGameStats.homeTeam.forwards[0].goals = 1;
  box.playerByGameStats.awayTeam.goalies[0].shotsAgainst = 1;
  box.playerByGameStats.awayTeam.goalies[0].goalsAgainst = 1;
  raw.plays.push({
    eventId: 1200,
    sortOrder: 300,
    typeDescKey: "goal",
    periodDescriptor: { number: 4, periodType: "OT" },
    timeInPeriod: "04:17",
    details: { eventOwnerTeamId: 2, scoringPlayerId: 200, goalieInNetId: 11 },
  });
  f.rawPbpText = JSON.stringify(raw);
  f.effectivePbp = raw;
  f.boxscoreText = JSON.stringify(box);
  f.gameSummaryHtml = f.gameSummaryHtml
    .replace("HOME 0", "HOME 1")
    .replace(
      "</table>",
      `<tr>${[1, "OT", "4:17", "EV", "PHX", "1 H.HOME0(1)", "", "", "8, 9, 31", "1, 40"].map((x) => `<td>${x}</td>`).join("")}</tr></table>`,
    );
  assert.doesNotThrow(() => reconcileOfficialShotCredits(f));
  f.gameSummaryHtml = f.gameSummaryHtml.replace("4:17", "4:18");
  assert.throws(() => reconcileOfficialShotCredits(f), /scoring ledger/);
});

test("paired unrelated owner-team swaps cannot hide behind conserved marginal counts", () => {
  const f = fixture(),
    raw = JSON.parse(f.rawPbpText),
    box = JSON.parse(f.boxscoreText);
  raw.plays.push(
    {
      eventId: 1200,
      sortOrder: 300,
      typeDescKey: "shot-on-goal",
      periodDescriptor: { number: 3, periodType: "REG" },
      timeInPeriod: "17:00",
      details: {
        eventOwnerTeamId: 2,
        shootingPlayerId: 200,
        goalieInNetId: 11,
      },
    },
    {
      eventId: 1201,
      sortOrder: 301,
      typeDescKey: "shot-on-goal",
      periodDescriptor: { number: 3, periodType: "REG" },
      timeInPeriod: "17:01",
      details: {
        eventOwnerTeamId: 1,
        shootingPlayerId: 100,
        goalieInNetId: 21,
      },
    },
  );
  box.homeTeam.sog = 1;
  box.awayTeam.sog = 2;
  box.playerByGameStats.homeTeam.forwards[0].sog = 1;
  box.playerByGameStats.awayTeam.forwards[2].sog = 1;
  box.playerByGameStats.homeTeam.goalies[0].shotsAgainst = 2;
  box.playerByGameStats.awayTeam.goalies[0].shotsAgainst = 1;
  f.rawPbpText = JSON.stringify(raw);
  f.effectivePbp = structuredClone(raw);
  f.boxscoreText = JSON.stringify(box);
  assert.doesNotThrow(() => reconcileOfficialShotCredits(f));
  raw.plays[2].details.eventOwnerTeamId = 1;
  raw.plays[3].details.eventOwnerTeamId = 2;
  f.rawPbpText = JSON.stringify(raw);
  f.effectivePbp = raw;
  assert.throws(() => reconcileOfficialShotCredits(f), /population/);
});
