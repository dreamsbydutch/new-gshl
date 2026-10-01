import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGameValueData,
  extractShotTrainingRows,
} from "./game-value-input";
import {
  reconcileGameLedger,
  parseProviderAppearances,
  parseOfficialStatAppearances,
  reconcileSeasonExposure,
} from "./game-reconciliation";
import { unzipCsv } from "../../integrations/nhl/game-value-source";

import { gameFixture, penaltyShotFixture } from "./game-value-fixtures";

test("confirmed zero-time appearances count without turning dressed backup goalies into appearances", () => {
  const f = gameFixture();
  const home = f.sources.box.playerByGameStats.homeTeam;
  const credited = {
    ...home.forwards[0]!,
    playerId: 99,
    toi: "0:00",
    officialAppearance: true,
  };
  home.forwards.push(credited);
  home.goalies.push({ ...home.goalies[0]!, playerId: 98, toi: "0:00" });
  const game = buildGameValueData(f.sources, f.shots);
  assert.equal(game.players.find((p) => p.id === 99)?.seconds, 0);
  assert.equal(
    game.players.some((p) => p.id === 98),
    false,
  );
  assert.equal(game.eligible, true);
});

test("historical zone evidence recovers period direction including neutral and defensive-zone shots", () => {
  const locations = [
    { period: 1, team: 1, x: -75, zone: "O" },
    { period: 1, team: 2, x: 60, zone: "O" },
    { period: 1, team: 1, x: 55, zone: "D" },
    { period: 1, team: 1, x: -10, zone: "N" },
    { period: 2, team: 1, x: 75, zone: "O" },
    { period: 2, team: 2, x: -60, zone: "O" },
    { period: 2, team: 1, x: -55, zone: "D" },
    { period: 2, team: 1, x: -10, zone: "N" },
  ];
  const pbp = {
    id: 2013020001,
    gameDate: "2013-10-01",
    homeTeam: { id: 1 },
    awayTeam: { id: 2 },
    plays: locations.map((p, i) => ({
      eventId: i + 1,
      sortOrder: i + 1,
      periodDescriptor: { number: p.period, periodType: "REG" },
      timeInPeriod: "01:00",
      situationCode: "1551",
      typeDescKey: "shot-on-goal",
      homeTeamDefendingSide: p.period === 1 ? "right" : "left",
      details: {
        eventOwnerTeamId: p.team,
        xCoord: p.x,
        yCoord: 5,
        zoneCode: p.zone,
        shotType: "wrist",
      },
    })),
  };
  const official = extractShotTrainingRows(pbp);
  const historical = extractShotTrainingRows({
    ...pbp,
    plays: pbp.plays.map((p) => ({ ...p, homeTeamDefendingSide: undefined })),
  });
  assert.equal(historical.length, 8);
  assert.deepEqual(
    historical.map((p) => p.features),
    official.map((p) => p.features),
  );
  assert.ok(
    historical.every((p) => p.orientationSource === "period-zone-consensus"),
  );
  assert.ok(historical[2]!.features[1]! > 1); // Retains the long defensive-zone distance.
  const ambiguous = extractShotTrainingRows({
    ...pbp,
    plays: pbp.plays
      .slice(0, 4)
      .filter((_, i) => i !== 2)
      .map((p) => ({
        ...p,
        homeTeamDefendingSide: undefined,
        details: { ...p.details, xCoord: Math.abs(p.details.xCoord) },
      })),
  });
  assert.equal(ambiguous.length, 2); // Conflicting directions cannot price the neutral-zone shot.
  assert.ok(ambiguous.every((p) => p.orientationSource === "event-zone"));
});

test("penalty shots use a distinct prior probability without assigning lineup time or contaminating ordinary xG training", () => {
  const f = penaltyShotFixture();
  assert.deepEqual(extractShotTrainingRows(f.sources.pbp), []);
  delete f.sources.pbp.plays.find((p) => p.eventId === 6)!.details.xCoord;
  const g = buildGameValueData(f.sources, f.shots, undefined, 0.3);
  assert.equal(g.eligible, true);
  assert.equal(g.shots.length, 1);
  assert.equal(g.shots[0]!.attribution, "penalty-shot");
  assert.equal(g.shots[0]!.penaltyDrawn, 2);
  assert.equal(g.shots[0]!.penaltyCommitted, 11);
  assert.equal(g.shots[0]!.xg, 0.3);
  assert.equal(g.modeledSeconds, 1200);
  assert.equal(
    g.stints.reduce((n, s) => n + s.homeXg + s.awayXg, 0),
    0,
  );
  assert.deepEqual(g.goalieReconciliation, []);
  assert.equal(buildGameValueData(f.sources, f.shots).shots.length, 0);
  f.sources.pbp.plays.find(
    (p) => p.eventId === 6,
  )!.periodDescriptor.periodType = "SO";
  assert.equal(
    buildGameValueData(f.sources, [], undefined, 0.3).shots.length,
    0,
  );
});

test("a lineup conflict retains verified shooter and goalie credit and isolates the affected interval", () => {
  const f = gameFixture();
  f.sources.pbp.plays.find((p) => p.eventId === 6)!.situationCode = "1451";
  const g = buildGameValueData(f.sources, f.shots);
  assert.equal(g.eligible, false);
  assert.equal(
    g.shots.find((s) => s.eventId === 6)!.attribution,
    "individual-only",
  );
  assert.equal(g.usableProcessSeconds, 1160);
  assert.equal(g.shotCoverageByPlayer[1]!.matched, 2);
  assert.equal(g.shotCoverageByPlayer[16]!.missingGoals, 0);
  assert.deepEqual(g.goalieReconciliation, []);
  f.sources.pbp.plays.find((p) => p.eventId === 6)!.details.scoringPlayerId =
    999;
  assert.equal(
    buildGameValueData(f.sources, f.shots).shots.some((s) => s.eventId === 6),
    false,
  );
});

test("failed penalty-shot attempts count as misses without inventing shots on goal or ordinary-play xG", () => {
  const f = penaltyShotFixture();
  const attempt = f.sources.pbp.plays.find((p) => p.eventId === 6)!;
  attempt.typeDescKey = "failed-shot-attempt";
  attempt.details.shootingPlayerId = 1;
  f.sources.box.playerByGameStats.awayTeam.goalies[0]!.goalsAgainst = 0;
  f.sources.box.playerByGameStats.awayTeam.goalies[0]!.shotsAgainst = 0;
  const g = buildGameValueData(f.sources, [], undefined, 0.3);
  assert.equal(g.eligible, true);
  assert.equal(g.shots.length, 1);
  assert.equal(g.shots[0]!.kind, "MISS");
  assert.equal(g.shots[0]!.attribution, "penalty-shot");
  assert.equal(g.shotCoverageByPlayer[1]!.matched, 1);
  assert.deepEqual(g.goalieReconciliation, []);
  assert.deepEqual(extractShotTrainingRows(f.sources.pbp), []);
  assert.equal(
    g.stints.reduce((n, s) => n + s.homeXg + s.awayXg, 0),
    0,
  );
});

test("official identities repair provider shooter attribution without duplicate shift exposure", () => {
  const f = gameFixture();
  f.sources.shifts.push({ ...f.sources.shifts[0]! });
  const g = buildGameValueData(f.sources, f.shots);
  assert.equal(g.eligible, true);
  assert.equal(g.modeledSeconds, 1200);
  assert.equal(g.shots[0]!.shooter, 1);
  assert.equal(g.corrections.length, 1);
  assert.equal(
    g.stints.reduce((s, x) => s + x.homeXg, 0),
    0.4,
  );
  assert.equal(g.penalties.length, 2); // Misconduct does not create power-play value.
  f.sources.pbp.plays.push({ ...f.sources.pbp.plays[1]! });
  assert.throws(
    () => buildGameValueData(f.sources, f.shots),
    /Duplicate official event/,
  );
  assert.throws(
    () => extractShotTrainingRows(f.sources.pbp),
    /Duplicate official event/,
  );
});
test("penalty context preserves missing manpower and removes an extra attacker", () => {
  const f = gameFixture();
  f.sources.pbp.plays.find((p) => p.eventId === 4)!.situationCode = "";
  f.sources.pbp.plays.find((p) => p.eventId === 5)!.situationCode = "0551";
  const g = buildGameValueData(f.sources, f.shots);
  assert.equal(g.penalties[0]!.homeBefore, null);
  assert.equal(g.penalties[1]!.awayBefore, 4);
  assert.equal(g.penalties[1]!.homeBefore, 5);
});

test("penalties after the final horn have no future exposure, while a tied game can continue", () => {
  const f = gameFixture();
  const p = f.sources.pbp.plays.find((p) => p.eventId === 4)!;
  p.periodDescriptor = { number: 3, periodType: "REG" };
  p.timeInPeriod = "20:00";
  p.sortOrder = 100;
  assert.equal(
    buildGameValueData(f.sources, f.shots).penalties.find(
      (e) => e.eventId === 4,
    )!.remainingSeconds,
    0,
  );
  f.sources.pbp.plays = f.sources.pbp.plays.filter(
    (p) => p.typeDescKey !== "goal",
  );
  assert.equal(
    buildGameValueData(f.sources, f.shots).penalties.find(
      (e) => e.eventId === 4,
    )!.remainingSeconds,
    null,
  );
});

test("missing goal probability quarantines the game instead of inventing a save", () => {
  const f = gameFixture();
  const g = buildGameValueData(f.sources, [f.shots[0]!]);
  assert.equal(g.eligible, false);
  assert.ok(
    g.issues.includes("Not every official goal has verified shot attribution"),
  );
});

test("three-on-three and empty-net exposure remain separate from ordinary even strength", () => {
  const overtime = gameFixture();
  overtime.sources.pbp.plays = overtime.sources.pbp.plays.filter((p) =>
    [1, 2, 7].includes(p.eventId),
  );
  for (const p of overtime.sources.pbp.plays) {
    p.periodDescriptor = { number: 4, periodType: "OT" };
    p.situationCode = "1331";
    if (p.eventId === 7) p.timeInPeriod = "05:00";
  }
  const retained = new Set([1, 2, 3, 6, 11, 12, 13, 16]);
  overtime.sources.shifts = overtime.sources.shifts.filter((s) =>
    retained.has(s.playerId),
  );
  for (const s of overtime.sources.shifts) {
    s.period = 4;
    s.endTime = "05:00";
  }
  for (const team of Object.values(overtime.sources.box.playerByGameStats)) {
    team.defense = [];
    for (const p of [...team.forwards, ...team.goalies]) p.toi = "05:00";
    for (const p of team.goalies) {
      p.goalsAgainst = 0;
      p.shotsAgainst = p.playerId === 16 ? 1 : 0;
    }
  }
  const ot = buildGameValueData(overtime.sources, [
    { ...overtime.shots[0]!, period: 4 },
  ]);
  assert.equal(ot.eligible, true);
  assert.equal(ot.modeledSeconds, 300);
  assert.ok(ot.stints.every((s) => s.situation === "3v3:GG"));

  const empty = gameFixture(),
    home = empty.sources.box.playerByGameStats.homeTeam;
  const extra = home.goalies.pop()!;
  extra.position = "C";
  home.forwards.push(extra);
  for (const p of empty.sources.pbp.plays) p.situationCode = "1560";
  const en = buildGameValueData(empty.sources, empty.shots);
  assert.equal(en.eligible, true);
  assert.ok(
    en.stints.every((s) => s.situation === "6v5:EG" && s.homeGoalie === null),
  );
});
test("goalie goal conflicts quarantine games while shot-classification differences remain explicit", () => {
  const f = gameFixture(),
    goalie = f.sources.box.playerByGameStats.awayTeam.goalies[0]!;
  goalie.shotsAgainst = 3;
  const shots = buildGameValueData(f.sources, f.shots);
  assert.equal(shots.eligible, true);
  assert.deepEqual(shots.goalieReconciliation, [
    {
      playerId: 16,
      verifiedShots: 2,
      officialShots: 3,
      verifiedGoals: 1,
      officialGoals: 1,
    },
  ]);
  goalie.goalsAgainst = 2;
  assert.equal(buildGameValueData(f.sources, f.shots).eligible, false);
});

test("local xG has explicit provenance and requires valid probabilities for official shots", () => {
  const f = gameFixture(),
    features = extractShotTrainingRows(f.sources.pbp);
  assert.equal(features.length, 2);
  assert.equal(features[1]!.goal, 1);
  const g = buildGameValueData(
    f.sources,
    [],
    new Map([
      [2, 0.12],
      [6, 0.25],
    ]),
  );
  assert.equal(g.eligible, true);
  assert.ok(g.shots.every((s) => s.probabilitySource === "nhl-event-xg-v1"));
  assert.throws(
    () =>
      buildGameValueData(
        f.sources,
        [],
        new Map([
          [2, NaN],
          [6, 0.25],
        ]),
      ),
    /Invalid event/,
  );
});
test("game ledger separates missing, extra and TOI conflicts and refuses duplicate identities", () => {
  const ledger = reconcileGameLedger(
    [
      { gameId: 1, seconds: 1200 },
      { gameId: 2, seconds: 1000 },
    ],
    [
      { gameId: 1, seconds: 900, rows: [] },
      { gameId: 3, seconds: 1000, rows: [] },
    ],
  );
  assert.deepEqual(ledger.missing, [2]);
  assert.deepEqual(ledger.extra, [3]);
  assert.equal(ledger.toiConflicts.length, 1);
  const csv =
    "playerId,season,gameId,situation,icetime\n1,2024,2024020001,all,1200\n1,2024,2024020001,all,1200";
  assert.throws(() => parseProviderAppearances(csv, 1, 20242025), /Duplicate/);
  assert.throws(
    () => unzipCsv(Buffer.from("not a zip"), "shots.csv"),
    /Invalid ZIP/,
  );
});

test("official statistics can confirm zero-time appearances without treating omitted TOI as zero", () => {
  const raw = {
    total: 2,
    data: [
      { playerId: 1, gameId: 2024020001, gamesPlayed: 1, timeOnIce: 0 },
      { playerId: 1, gameId: 2024020002, gamesPlayed: 0 },
    ],
  };
  const parsed = parseOfficialStatAppearances(raw, 1, 20242025, true);
  assert.deepEqual(parsed.appearances, [{ gameId: 2024020001, seconds: 0 }]);
  assert.deepEqual(parsed.nonAppearanceGameIds, [2024020002]);
  assert.throws(
    () =>
      parseOfficialStatAppearances(
        {
          total: 1,
          data: [{ playerId: 1, gameId: 2024020001, gamesPlayed: 1 }],
        },
        1,
        20242025,
        true,
      ),
    /Missing official/,
  );
});

test("season reconciliation catches stale totals and unexpected NHL identities", () => {
  const games = [
    { players: [{ id: 1, seconds: 1200 }] },
    { players: [{ id: 1, seconds: 900 }] },
  ];
  assert.equal(
    reconcileSeasonExposure(games, [{ playerId: 1, games: 2, minutes: 35 }])
      .matches,
    true,
  );
  assert.equal(
    reconcileSeasonExposure(games, [{ playerId: 1, games: 1, minutes: 20 }])
      .matches,
    false,
  );
  assert.deepEqual(reconcileSeasonExposure(games, []).extraPlayerIds, [1]);
});
