import assert from "node:assert/strict";
import test from "node:test";
import { recoverOfficialPrimaryEvents } from "./official-primary-event-recovery";
import type { OfficialShotCreditSources } from "./official-shot-credit-reconciliation";

function fixture(): OfficialShotCreditSources {
  const rosterSpots = [
    ...Array.from({ length: 5 }, (_, i) => ({
      playerId: 100 + i,
      teamId: 1,
      sweaterNumber: 9 + i,
      positionCode: "C",
      lastName: { default: `Away${i}` },
    })),
    ...Array.from({ length: 5 }, (_, i) => ({
      playerId: 200 + i,
      teamId: 2,
      sweaterNumber: 20 + i,
      positionCode: "C",
      lastName: { default: `Home${i}` },
    })),
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
      lastName: { default: "Keeper" },
    },
  ];
  const homeTeam = { id: 2, abbrev: "PHX", score: 0 },
    awayTeam = { id: 1, abbrev: "ANA", score: 0 };
  const shot = (id: number) => ({
    eventId: id,
    sortOrder: id,
    typeDescKey: "shot-on-goal",
    periodDescriptor: { number: 3, periodType: "REG" },
    timeInPeriod: "18:58",
    situationCode: "1551",
    details: {
      eventOwnerTeamId: 1,
      shootingPlayerId: 100,
      goalieInNetId: 21,
      xCoord: 65,
      yCoord: 15,
      shotType: "wrist",
      zoneCode: "O",
    },
  });
  const raw = {
    id: 2009020759,
    gameType: 2,
    gameState: "OFF",
    gameDate: "2010-01-22",
    homeTeam,
    awayTeam,
    rosterSpots,
    plays: [
      shot(50),
      shot(51),
      {
        eventId: 53,
        sortOrder: 1000,
        typeDescKey: "shot-on-goal",
        periodDescriptor: { number: 5, periodType: "SO" },
        timeInPeriod: "00:00",
        details: {
          eventOwnerTeamId: 1,
          shootingPlayerId: 100,
          goalieInNetId: 21,
        },
      },
    ],
  };
  const box = {
    id: raw.id,
    gameDate: raw.gameDate,
    homeTeam: { ...homeTeam, sog: 0 },
    awayTeam: { ...awayTeam, sog: 1 },
    playerByGameStats: {
      homeTeam: {
        forwards: Array.from({ length: 5 }, (_, i) => ({
          playerId: 200 + i,
          sog: 0,
          goals: 0,
          pim: 0,
        })),
        defense: [],
        goalies: [{ playerId: 21, shotsAgainst: 1, goalsAgainst: 0, pim: 0 }],
      },
      awayTeam: {
        forwards: Array.from({ length: 5 }, (_, i) => ({
          playerId: 100 + i,
          sog: i === 0 ? 1 : 0,
          goals: 0,
          pim: 0,
        })),
        defense: [],
        goalies: [{ playerId: 11, shotsAgainst: 0, goalsAgainst: 0, pim: 0 }],
      },
    },
  };
  const row = (cells: unknown[]) =>
      `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`,
    identity = row(["Game 0759", "Friday, January 22, 2010"]),
    header = row(["VISITOR 0 ANAHEIM DUCKS", "Game", "HOME 0 PHOENIX COYOTES"]),
    logos =
      '<img src="http://www.nhl.com/scores/htmlreports/images/logocana.gif"><img src="http://www.nhl.com/scores/htmlreports/images/logocphx.gif">';
  const ice = ["9 C 10 C 11 C 12 C 13 C 31 G", "20 C 21 C 22 C 23 C 24 C 40 G"];
  return {
    rawPbpText: JSON.stringify(raw),
    effectivePbp: raw,
    boxscoreText: JSON.stringify(box),
    playReportHtml: `<title>Play By Play</title>${logos}<table>${identity}${header}${row([1, 1, "EV", "0:0020:00", "PSTR", "Period Start", ...ice])}${row([2, 1, "EV", "0:0020:00", "FAC", "ANA won Neu. Zone - ANA #9 AWAY0 vs PHX #20 HOME0", ...ice])}${row([3, 3, "EV", "18:521:08", "SHOT", "ANA ONGOAL - #9 AWAY0, Wrist, Off. Zone, 29 ft.", ...ice])}</table>`,
    gameSummaryHtml: `<title>Game Summary</title>${logos}<table>${identity}${header}</table>`,
    providerRows: [
      {
        gameId: raw.id,
        ordinal: 3,
        period: 3,
        second: 1132,
        kind: "SHOT",
        shooter: 100,
        goalie: 21,
        home: false,
        x: 66,
        y: 14,
        homeSkaters: 5,
        awaySkaters: 5,
        homeGoalie: true,
        awayGoalie: true,
        shotType: "wrist",
      },
    ],
    providerArchive: {
      url: "https://peter-tanner.com/moneypuck/downloads/shots_2009.zip",
      sha256: "a".repeat(64),
    },
  };
}

test("complete primary chronology replaces corrupt records without deleting original evidence or guessing clocks", () => {
  const f = fixture(),
    before = JSON.stringify(f),
    result = recoverOfficialPrimaryEvents(f);
  assert.equal(JSON.stringify(f), before);
  assert.equal(result.proof.completeSourceContext, true);
  assert.deepEqual(
    result.proof.mapping.map((r) => r.ordinal),
    [1, 2, 3],
  );
  assert.equal(result.proof.excludedNativeRecords.length, 2);
  assert.equal(result.proof.originalNativeRecords.length, 3);
  assert.deepEqual(result.proof.preservedNativeShootout, [
    JSON.parse(f.rawPbpText).plays[2],
  ]);
  const shot = result.pbp.plays.find(
    (p) =>
      p.typeDescKey === "shot-on-goal" &&
      (p.periodDescriptor as { periodType: string }).periodType !== "SO",
  )!;
  assert.equal(shot.timeInPeriod, "18:52");
  assert.equal(shot.eventId, 1000000003);
  assert.equal((shot.details as Record<string, unknown>).xCoord, 66);
  assert.equal(result.proof.requiresOnGoalClassificationReview, false);
});

test("a uniquely correct native attempt retains its ID and valid geometry", () => {
  const f = fixture(),
    raw = JSON.parse(f.rawPbpText);
  raw.plays[0].timeInPeriod = "18:52";
  f.rawPbpText = JSON.stringify(raw);
  f.effectivePbp = raw;
  const result = recoverOfficialPrimaryEvents(f),
    shot = result.pbp.plays.find((p) => p.eventId === 50)!;
  assert.equal(shot.sortOrder, 3);
  assert.equal((shot.details as Record<string, unknown>).xCoord, 65);
  assert.equal(result.proof.geometryDisagreements.length, 1);
  assert.equal(result.proof.excludedNativeRecords.length, 1);
});

test("late primary penalties require independent GS and official individual PIM conservation", () => {
  const f = fixture(),
    box = JSON.parse(f.boxscoreText);
  box.playerByGameStats.homeTeam.forwards[0].pim = 2;
  f.boxscoreText = JSON.stringify(box);
  const row = (cells: unknown[]) =>
    `<tr>${cells.map((c) => `<td>${c}</td>`).join("")}</tr>`;
  f.playReportHtml = f.playReportHtml.replace(
    "</table>",
    row([
      4,
      3,
      "EV",
      "19:100:50",
      "PENL",
      "PHX #20 HOME0 Hooking(2 min), Def. Zone Drawn By: ANA #9 AWAY0",
      "9 C 10 C 11 C 12 C 13 C 31 G",
      "20 C 21 C 22 C 23 C 24 C 40 G",
    ]) + "</table>",
  );
  f.gameSummaryHtml = f.gameSummaryHtml.replace(
    "</table>",
    row([1, 3, "19:10", "20 H.HOME0", 2, "Hooking"]) + "</table>",
  );
  const result = recoverOfficialPrimaryEvents(f);
  assert.equal(result.proof.penalties.length, 1);
  const penalty = result.pbp.plays.find((p) => p.typeDescKey === "penalty")!;
  assert.equal(
    (penalty.details as Record<string, unknown>).committedByPlayerId,
    200,
  );
  const raw = JSON.parse(f.rawPbpText),
    nativePenalty = {
      eventId: 60,
      sortOrder: 60,
      typeDescKey: "penalty",
      periodDescriptor: { number: 3, periodType: "REG" },
      timeInPeriod: "19:10",
      details: {
        eventOwnerTeamId: 2,
        committedByPlayerId: 200,
        drawnByPlayerId: 100,
        duration: 2,
        typeCode: "MIN",
        descKey: "slashing",
      },
    };
  raw.plays.push(nativePenalty);
  f.rawPbpText = JSON.stringify(raw);
  f.effectivePbp = raw;
  const contradictory = recoverOfficialPrimaryEvents(f);
  assert.equal(
    contradictory.pbp.plays.find((p) => p.typeDescKey === "penalty")!.eventId,
    1000000004,
  );
  assert.equal(
    contradictory.proof.excludedNativeRecords.some((p) => p.eventId === 60),
    true,
  );
  nativePenalty.details.descKey = "hooking";
  f.rawPbpText = JSON.stringify(raw);
  assert.equal(
    recoverOfficialPrimaryEvents(f).pbp.plays.find(
      (p) => p.typeDescKey === "penalty",
    )!.eventId,
    60,
  );
  f.gameSummaryHtml = f.gameSummaryHtml
    .replace("<td>Hooking</td>", "<td>Hooking</td>")
    .replace("<td>19:10</td>", "<td>19:11</td>");
  assert.throws(() => recoverOfficialPrimaryEvents(f), /penalty ledger/);
});

test("missing/extra archive attempts, wrong identities and incomplete official counts fail closed", () => {
  const mutations: Array<(f: OfficialShotCreditSources) => void> = [
    (f) => {
      f.providerRows = [];
    },
    (f) => {
      f.providerRows = [...f.providerRows, ...f.providerRows];
    },
    (f) => {
      f.providerRows = [{ ...f.providerRows[0]!, second: 1138 }];
    },
    (f) => {
      f.providerRows = [{ ...f.providerRows[0]!, shooter: 101 }];
    },
    (f) => {
      f.providerRows = [{ ...f.providerRows[0]!, goalie: 11 }];
    },
    (f) => {
      f.playReportHtml = f.playReportHtml.replace("Game 0759", "Game 0760");
    },
    (f) => {
      const b = JSON.parse(f.boxscoreText);
      b.awayTeam.sog = 2;
      f.boxscoreText = JSON.stringify(b);
    },
    (f) => {
      const b = JSON.parse(f.boxscoreText);
      b.playerByGameStats.awayTeam.forwards[0].pim = 2;
      f.boxscoreText = JSON.stringify(b);
    },
  ];
  for (const change of mutations) {
    const f = fixture();
    change(f);
    assert.throws(() => recoverOfficialPrimaryEvents(f));
  }
});

test("native context contradictions are excluded rather than copied into a primary event", () => {
  for (const field of ["zoneCode", "shotType"]) {
    const f = fixture(),
      raw = JSON.parse(f.rawPbpText);
    raw.plays = [raw.plays[0]];
    raw.plays[0].timeInPeriod = "18:52";
    raw.plays[0].details[field] = field === "zoneCode" ? "D" : "slap";
    f.rawPbpText = JSON.stringify(raw);
    f.effectivePbp = raw;
    const result = recoverOfficialPrimaryEvents(f),
      shot = result.pbp.plays.find((p) => p.typeDescKey === "shot-on-goal")!;
    assert.equal(shot.eventId, 1000000003);
    assert.equal(result.proof.excludedNativeRecords.length, 1);
    assert.equal((shot.details as Record<string, unknown>).zoneCode, "O");
    assert.equal((shot.details as Record<string, unknown>).shotType, "wrist");
  }
});

test("source identity collisions, roster changes and reversed primary chronology fail closed", () => {
  const f = fixture(),
    raw = JSON.parse(f.rawPbpText);
  raw.plays[0].eventId = 1000000003;
  f.rawPbpText = JSON.stringify(raw);
  f.effectivePbp = raw;
  assert.throws(() => recoverOfficialPrimaryEvents(f), /collides/);
  const roster = fixture(),
    effective = structuredClone(roster.effectivePbp) as Record<string, unknown>;
  (effective.rosterSpots as Array<Record<string, unknown>>)[0]!.sweaterNumber =
    99;
  roster.effectivePbp = effective;
  assert.throws(() => recoverOfficialPrimaryEvents(roster), /roster changed/);
  const reversed = fixture();
  reversed.playReportHtml = reversed.playReportHtml.replace(
    "0:0020:00",
    "1:0019:00",
  );
  assert.throws(() => recoverOfficialPrimaryEvents(reversed), /chronology/);
});

test("shootout scoreboard bonus is separate from regular GOAL/G/GA conservation", () => {
  const f = fixture(),
    raw = JSON.parse(f.rawPbpText),
    box = JSON.parse(f.boxscoreText);
  raw.awayTeam.score = 1;
  box.awayTeam.score = 1;
  raw.plays[2].typeDescKey = "goal";
  f.rawPbpText = JSON.stringify(raw);
  f.effectivePbp = raw;
  f.boxscoreText = JSON.stringify(box);
  f.playReportHtml = f.playReportHtml.replace(
    "VISITOR 0 ANAHEIM",
    "VISITOR 1 ANAHEIM",
  );
  f.gameSummaryHtml = f.gameSummaryHtml.replace(
    "VISITOR 0 ANAHEIM",
    "VISITOR 1 ANAHEIM",
  );
  const result = recoverOfficialPrimaryEvents(f);
  assert.equal(
    result.proof.allCounts.every((p) => p.primaryGoals === 0),
    true,
  );
  assert.deepEqual(result.proof.preservedNativeShootout, [raw.plays[2]]);
});

test("0108 excludes a primary-absent phantom while preserving the real native geometry and full counts", () => {
  const f = fixture(),
    raw = JSON.parse(f.rawPbpText),
    box = JSON.parse(f.boxscoreText);
  raw.id = 2009020108;
  box.id = raw.id;
  raw.plays[0].eventId = 96;
  raw.plays[0].timeInPeriod = "18:52";
  raw.plays[1].eventId = 609;
  raw.plays[1].timeInPeriod = "18:51";
  f.rawPbpText = JSON.stringify(raw);
  f.effectivePbp = raw;
  f.boxscoreText = JSON.stringify(box);
  f.playReportHtml = f.playReportHtml.replace("Game 0759", "Game 0108");
  f.gameSummaryHtml = f.gameSummaryHtml.replace("Game 0759", "Game 0108");
  f.providerRows = f.providerRows.map((r) => ({ ...r, gameId: raw.id }));
  const before = JSON.stringify(f),
    r = recoverOfficialPrimaryEvents(f);
  assert.equal(JSON.stringify(f), before);
  assert.equal(
    r.pbp.plays.some((p) => p.eventId === 609),
    false,
  );
  assert.deepEqual(
    r.proof.excludedNativeRecords.find((p) => p.eventId === 609),
    raw.plays[1],
  );
  assert.equal(
    r.pbp.plays.filter(
      (p) =>
        p.typeDescKey === "shot-on-goal" &&
        (p.periodDescriptor as { periodType: string }).periodType !== "SO",
    ).length,
    1,
  );
  const real = r.pbp.plays.find((p) => p.eventId === 96)!;
  assert.equal((real.details as Record<string, unknown>).xCoord, 65);
  assert.equal((real.details as Record<string, unknown>).yCoord, 15);
  assert.equal(r.proof.requiresOnGoalClassificationReview, false);
  assert.ok(
    r.proof.allCounts.every(
      (p) =>
        p.primaryOnGoal === p.officialOnGoal &&
        p.primaryGoals === p.officialGoals &&
        p.primaryPim === p.officialPim,
    ),
  );
});
