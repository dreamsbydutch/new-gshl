import assert from "node:assert/strict";
import test from "node:test";
import { repairReviewed2008ShotCredits } from "./reviewed-2008-shot-credit";
import type { OfficialShotCreditSources } from "./official-shot-credit-reconciliation";

function fixture(): OfficialShotCreditSources {
  const old = 8468535,
    recovered = 8459492,
    awayG = 8467913,
    homeG = 8469608;
  const roster = [
    {
      playerId: old,
      teamId: 9,
      sweaterNumber: 20,
      positionCode: "C",
      lastName: { default: "Vermette" },
    },
    {
      playerId: recovered,
      teamId: 14,
      sweaterNumber: 20,
      positionCode: "L",
      lastName: { default: "Prospal" },
    },
    {
      playerId: awayG,
      teamId: 9,
      sweaterNumber: 35,
      positionCode: "G",
      lastName: { default: "Auld" },
    },
    {
      playerId: homeG,
      teamId: 14,
      sweaterNumber: 31,
      positionCode: "G",
      lastName: { default: "Smith" },
    },
    ...Array.from({ length: 2 }, (_, i) => ({
      playerId: 100 + i,
      teamId: 9,
      sweaterNumber: 10 + i,
      positionCode: "C",
      lastName: { default: `Away${i}` },
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      playerId: 200 + i,
      teamId: 14,
      sweaterNumber: 10 + i,
      positionCode: "C",
      lastName: { default: `Home${i}` },
    })),
  ];
  const awayTeam = { id: 9, abbrev: "OTT", score: 1, sog: 1 },
    homeTeam = { id: 14, abbrev: "TBL", score: 0, sog: 1 };
  const goal = {
    eventId: 50,
    sortOrder: 1,
    typeDescKey: "goal",
    periodDescriptor: { number: 2, periodType: "REG" },
    timeInPeriod: "08:06",
    details: {
      scoringPlayerId: old,
      eventOwnerTeamId: 9,
      goalieInNetId: homeG,
      shotType: "wrist",
    },
  };
  const wrong = {
    ...goal,
    eventId: 11038907,
    sortOrder: 2,
    typeDescKey: "shot-on-goal",
    details: {
      shootingPlayerId: old,
      eventOwnerTeamId: 9,
      goalieInNetId: homeG,
      shotType: "wrist",
    },
  };
  const raw = {
    id: 2008020157,
    gameType: 2,
    gameState: "OFF",
    gameDate: "2008-10-30",
    awayTeam,
    homeTeam,
    rosterSpots: roster,
    plays: [goal, wrong],
  };
  const box = {
    id: raw.id,
    gameDate: raw.gameDate,
    homeTeam,
    awayTeam,
    playerByGameStats: {
      awayTeam: {
        forwards: [
          { playerId: old, sog: 1, goals: 1 },
          ...Array.from({ length: 2 }, (_, i) => ({
            playerId: 100 + i,
            sog: 0,
            goals: 0,
          })),
        ],
        defense: [],
        goalies: [{ playerId: awayG, shotsAgainst: 1, goalsAgainst: 0 }],
      },
      homeTeam: {
        forwards: [
          { playerId: recovered, sog: 1, goals: 0 },
          ...Array.from({ length: 2 }, (_, i) => ({
            playerId: 200 + i,
            sog: 0,
            goals: 0,
          })),
        ],
        defense: [],
        goalies: [{ playerId: homeG, shotsAgainst: 1, goalsAgainst: 1 }],
      },
    },
  };
  const row = (a: unknown[]) =>
      `<tr>${a.map((c) => `<td>${c}</td>`).join("")}</tr>`,
    identity = row(["Game 0157", "Thursday, October 30, 2008"]),
    header = row([
      "VISITOR 1 OTTAWA SENATORS",
      "Game",
      "HOME 0 TAMPA BAY LIGHTNING",
    ]),
    logos = '<img src="logocott.gif"><img src="logoctb.gif">',
    ice = ["10 C 11 C 20 C 35 G", "10 C 11 C 20 L 31 G"];
  const pl = `<title>Play By Play</title>${logos}<table>${identity}${header}${row([138, 2, "EV", "8:0611:54", "SHOT", "T.B ONGOAL - #20 PROSPAL, Wrist, Off. Zone, 41 ft.", ...ice])}${row([139, 2, "EV", "8:0611:54", "GOAL", "OTT #20 VERMETTE(1), Wrist, Off. Zone, 10 ft.", ...ice])}</table>`;
  const gs = `<title>Game Summary</title>${logos}<table>${identity}${header}${row([1, 2, "8:06", "EV", "OTT", "20 A.VERMETTE(1)", "", "", "", ""])}</table>`;
  return {
    rawPbpText: JSON.stringify(raw),
    effectivePbp: raw,
    playReportHtml: pl,
    gameSummaryHtml: gs,
    boxscoreText: JSON.stringify(box),
    providerArchive: {
      url: "https://peter-tanner.com/moneypuck/downloads/shots_2008.zip",
      sha256: "a".repeat(64),
    },
    providerRows: [
      {
        gameId: raw.id,
        ordinal: 138,
        period: 2,
        second: 486,
        kind: "SHOT",
        shooter: recovered,
        goalie: awayG,
        home: true,
        x: -52,
        y: -19,
        homeSkaters: 3,
        awaySkaters: 3,
        homeGoalie: true,
        awayGoalie: true,
        shotType: "wrist",
      },
      {
        gameId: raw.id,
        ordinal: 139,
        period: 2,
        second: 486,
        kind: "GOAL",
        shooter: old,
        goalie: homeG,
        home: false,
        x: 70,
        y: 2,
        homeSkaters: 3,
        awaySkaters: 3,
        homeGoalie: true,
        awayGoalie: true,
        shotType: "wrist",
      },
    ],
  };
}

test("exact wrong actor/team/goalie record is explicitly replaced, while all original evidence remains intact", () => {
  const f = fixture(),
    before = JSON.stringify(f),
    result = repairReviewed2008ShotCredits(f);
  assert.equal(JSON.stringify(f), before);
  assert.equal(result.proof.requiresHistoricalBridge, true);
  assert.equal(result.proof.geometrySupplied, false);
  assert.equal(result.pbp.plays[1]!.eventId, 1500000138);
  assert.deepEqual(result.pbp.plays[0], JSON.parse(f.rawPbpText).plays[0]);
  const d = result.pbp.plays[1]!.details as Record<string, unknown>;
  assert.equal(d.shootingPlayerId, 8459492);
  assert.equal(d.goalieInNetId, 8467913);
  assert.equal(d.eventOwnerTeamId, 14);
  assert.equal(d.xCoord, undefined);
  assert.equal(d.yCoord, undefined);
  assert.deepEqual(
    result.proof.originalRecord,
    JSON.parse(f.rawPbpText).plays[1],
  );
  assert.equal(result.proof.counts.length, 8);
});

test("wrong owner/goalie/archive actors, altered source IDs and unrelated excesses cannot be laundered by whole-game totals", () => {
  const mutate: Array<(f: OfficialShotCreditSources) => void> = [
    (f) => {
      f.providerRows = [
        { ...f.providerRows[0]!, home: false },
        f.providerRows[1]!,
      ];
    },
    (f) => {
      f.providerRows = [
        { ...f.providerRows[0]!, goalie: 8469608 },
        f.providerRows[1]!,
      ];
    },
    (f) => {
      f.providerRows = [
        { ...f.providerRows[0]!, shooter: 8468535 },
        f.providerRows[1]!,
      ];
    },
    (f) => {
      const p = JSON.parse(f.rawPbpText);
      p.plays[1].eventId = 99;
      f.rawPbpText = JSON.stringify(p);
      f.effectivePbp = p;
    },
    (f) => {
      const p = JSON.parse(f.rawPbpText);
      p.plays[0].details.eventOwnerTeamId = 14;
      f.rawPbpText = JSON.stringify(p);
      f.effectivePbp = p;
    },
    (f) => {
      const b = JSON.parse(f.boxscoreText);
      b.playerByGameStats.homeTeam.forwards[0].sog = 0;
      f.boxscoreText = JSON.stringify(b);
    },
    (f) => {
      f.gameSummaryHtml = f.gameSummaryHtml.replace(
        "20 A.VERMETTE(1)",
        "10 A.AWAY0(1)",
      );
    },
    (f) => {
      f.providerRows = [...f.providerRows, f.providerRows[0]!];
    },
  ];
  for (const change of mutate) {
    const f = fixture();
    change(f);
    assert.throws(() => repairReviewed2008ShotCredits(f));
  }
});

test("known native geometry, derived ID collisions and unreviewed pre-overlay changes fail closed", () => {
  const f = fixture(),
    p = JSON.parse(f.rawPbpText);
  p.plays[1].details.xCoord = 50;
  f.rawPbpText = JSON.stringify(p);
  f.effectivePbp = p;
  assert.throws(() => repairReviewed2008ShotCredits(f), /signature/);
  const c = fixture(),
    raw = JSON.parse(c.rawPbpText);
  raw.plays.push({
    ...raw.plays[0],
    eventId: 1500000138,
    typeDescKey: "stoppage",
    sortOrder: 3,
  });
  c.rawPbpText = JSON.stringify(raw);
  c.effectivePbp = raw;
  assert.throws(() => repairReviewed2008ShotCredits(c), /collision/);
  const changed = fixture();
  (changed.effectivePbp as Record<string, unknown>).gameState = "FINAL";
  assert.throws(() => repairReviewed2008ShotCredits(changed), /scope/);
});

test("a stats-free nonstarting backup remains unknown rather than fabricated official zero", () => {
  const f = fixture(),
    raw = JSON.parse(f.rawPbpText),
    box = JSON.parse(f.boxscoreText);
  raw.rosterSpots.push({
    playerId: 999,
    teamId: 14,
    sweaterNumber: 99,
    positionCode: "G",
    lastName: { default: "Backup" },
  });
  box.playerByGameStats.homeTeam.goalies.push({
    playerId: 999,
    starter: false,
  });
  f.rawPbpText = JSON.stringify(raw);
  f.effectivePbp = raw;
  f.boxscoreText = JSON.stringify(box);
  const result = repairReviewed2008ShotCredits(f),
    backup = result.proof.counts.find((p) => p.playerId === 999)!;
  assert.equal(backup.officialOnGoal, null);
  assert.equal(backup.officialGoals, null);
  assert.equal(backup.sourceStatus, "unconfirmed-backup-no-stats");
  box.playerByGameStats.homeTeam.goalies[1].starter = true;
  f.boxscoreText = JSON.stringify(box);
  assert.throws(() => repairReviewed2008ShotCredits(f), /count/);
});
