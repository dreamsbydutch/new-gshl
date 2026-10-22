import assert from "node:assert/strict";
import test from "node:test";
import { penaltyShotFixture } from "./game-value-fixtures";
import {
  parseOfficialPenaltyShotContext,
  applyOfficialPenaltyShotContext,
} from "./official-penalty-shot-context";
import { penaltyShotGameMatches } from "./official-penalty-shot-report";
import { extractShotTrainingRows } from "./game-value-input";
function nonscoringFixture(miss = false) {
  const rosterSpots = [
    ...[1, 2, 3, 4].map((playerId) => ({
      playerId,
      teamId: 1,
      sweaterNumber: playerId,
      positionCode: "C",
      lastName: { default: playerId === 1 ? "Player" : "Other" },
    })),
    {
      playerId: 9,
      teamId: 1,
      sweaterNumber: 9,
      positionCode: "G",
      lastName: { default: "OwnGoalie" },
    },
    ...[11, 12, 13, 14].map((playerId) => ({
      playerId,
      teamId: 2,
      sweaterNumber: playerId,
      positionCode: "D",
      lastName: { default: "Other" },
    })),
    {
      playerId: 16,
      teamId: 2,
      sweaterNumber: 16,
      positionCode: "G",
      lastName: { default: "Goalie" },
    },
  ];
  const details = {
      shootingPlayerId: 1,
      goalieInNetId: 16,
      eventOwnerTeamId: 1,
      shotType: "wrist",
    },
    clock = {
      periodDescriptor: { number: 1, periodType: "REG" },
      timeInPeriod: "00:40",
    };
  const ordinary = {
      eventId: 5,
      sortOrder: 5,
      typeDescKey: miss ? "missed-shot" : "shot-on-goal",
      situationCode: "1441",
      ...clock,
      details: { ...details },
    },
    terminal = {
      eventId: 6,
      sortOrder: 6,
      typeDescKey: ordinary.typeDescKey,
      situationCode: "1010",
      ...clock,
      details: { ...details },
    };
  const pbp = {
    id: 2024020999,
    gameDate: "2025-01-01",
    homeTeam: { id: 1 },
    awayTeam: { id: 2 },
    rosterSpots,
    plays: [
      ordinary,
      terminal,
      {
        eventId: 7,
        sortOrder: 7,
        typeDescKey: "faceoff",
        situationCode: "1441",
        ...clock,
        details: {},
      },
    ],
  };
  const shots = miss ? 0 : 2,
    box = {
      id: pbp.id,
      homeTeam: { id: 1, sog: shots },
      awayTeam: { id: 2, sog: 0 },
      playerByGameStats: {
        homeTeam: {
          forwards: [{ playerId: 1, sog: shots }],
          goalies: [{ playerId: 9, shotsAgainst: 0 }],
        },
        awayTeam: { goalies: [{ playerId: 16, shotsAgainst: shots }] },
      },
    };
  const kind = miss ? "MISS" : "SHOT",
    html = `<title>Play By Play</title><table><tr><td>Game 0999</td><td>Wednesday, January 1, 2025</td></tr><tr><td>9</td><td>1</td><td>EV</td><td>0:4019:20</td><td>${kind}</td><td>HOM #1 PLAYER, Wrist, Off. Zone</td><td>11 D 12 D 13 D 14 D 16 G</td><td>1 C 2 C 3 C 4 C 9 G</td></tr><tr><td>10</td><td>1</td><td>EV</td><td>0:4019:20</td><td>${kind}</td><td>HOM #1 PLAYER, Penalty Shot, Wrist, Off. Zone</td><td>16 G</td><td>1 C</td></tr><tr><td>11</td><td>1</td><td>EV</td><td>0:4019:20</td><td>FAC</td><td>Faceoff</td><td></td><td></td></tr></table>`;
  const totals = [
      {
        gameId: pbp.id,
        playerId: 1,
        penaltyShotAttempts: 1,
        penaltyShotsGoals: 0,
      },
    ],
    hashes = {
      pbpSha256: "a".repeat(64),
      htmlSha256: "b".repeat(64),
      boxSha256: "c".repeat(64),
      scopedPenaltyLedgerSha256: "d".repeat(64),
    };
  return { pbp, box, html, totals, hashes };
}
test("saved and missed isolated PS preserve independently verified full-team normal attempt byte-for-byte", () => {
  for (const missed of [false, true]) {
    const f = nonscoringFixture(missed),
      before = structuredClone(f),
      proof = parseOfficialPenaltyShotContext(
        f.html,
        f.pbp,
        f.box,
        f.totals,
        f.hashes,
      ),
      result = applyOfficialPenaltyShotContext(
        f.pbp,
        proof,
        f.hashes.pbpSha256,
      );
    assert.equal(
      proof.version,
      "nhl-official-verified-nonscoring-penalty-shot-context-v3",
    );
    assert.deepEqual(proof.ordinaryEventIds, [5]);
    assert.deepEqual(proof.unclassifiedEventIds, []);
    assert.deepEqual(result.plays[0], before.pbp.plays[0]);
    assert.notEqual(result.plays[1], f.pbp.plays[1]);
    assert.equal(penaltyShotGameMatches(result, f.totals), true);
    assert.deepEqual(f, before);
  }
});
test("nonscoring proof rejects partial/mismatched/illegal lineups, actor ambiguity, ordering, source scope and conservation", () => {
  const changes: Array<(f: ReturnType<typeof nonscoringFixture>) => void> = [
    (f) => {
      f.html = f.html.replace("11 D 12 D 13 D 14 D 16 G", "16 G");
    },
    (f) => {
      f.html = f.html.replace(
        "11 D 12 D 13 D 14 D 16 G",
        "11 D 11 D 13 D 14 D 16 G",
      );
    },
    (f) => {
      f.pbp.plays[0]!.situationCode = "1551";
    },
    (f) => {
      f.pbp.plays[0]!.situationCode = "1661";
    },
    (f) => {
      f.pbp.plays[1]!.situationCode = "1441";
    },
    (f) => {
      f.pbp.plays[0]!.details = {
        ...f.pbp.plays[0]!.details,
        goalieInNetId: 9,
      };
    },
    (f) => {
      f.pbp.plays[0]!.sortOrder = 8;
    },
    (f) => {
      f.pbp.plays[0]!.sortOrder = NaN;
    },
    (f) => {
      f.pbp.plays[1]!.sortOrder = Infinity;
    },
    (f) => {
      f.pbp.plays[0]!.sortOrder = 5.1;
    },
    (f) => {
      f.pbp.plays[2]!.sortOrder = 5.5;
    },
    (f) => {
      f.pbp.plays.push({ ...f.pbp.plays[0]!, eventId: 8, sortOrder: 5.5 });
    },
    (f) => {
      f.html = f.html.replace("Game 0999", "Game 0998");
    },
    (f) => {
      f.html = f.html.replace(
        "Wednesday, January 1, 2025",
        "Thursday, January 2, 2025",
      );
    },
    (f) => {
      f.box.homeTeam.sog = 1;
    },
    (f) => {
      f.box.playerByGameStats.awayTeam.goalies[0]!.shotsAgainst = 1;
    },
    (f) => {
      f.box.playerByGameStats.homeTeam.forwards[0]!.sog = 1;
    },
    (f) => {
      f.html = f.html.replace(
        "HOM #1 PLAYER, Wrist",
        "HOM #1 PLAYER, Backhand",
      );
    },
  ];
  for (const change of changes) {
    const f = nonscoringFixture();
    change(f);
    assert.throws(() =>
      parseOfficialPenaltyShotContext(f.html, f.pbp, f.box, f.totals, f.hashes),
    );
  }
  const missing = nonscoringFixture(true);
  Reflect.set(missing.box.playerByGameStats.homeTeam.forwards[0]!, "sog", null);
  assert.throws(
    () =>
      parseOfficialPenaltyShotContext(
        missing.html,
        missing.pbp,
        missing.box,
        missing.totals,
        missing.hashes,
      ),
    /numeric/,
  );
});
function fixture() {
  const f = penaltyShotFixture(),
    goal = f.sources.pbp.plays.find((p) => p.eventId === 6)!;
  f.sources.pbp.plays.find((p) => p.eventId === 3)!.details.drawnByPlayerId = 1;
  const context = {
    ...goal,
    eventId: 5,
    sortOrder: 5,
    typeDescKey: "shot-on-goal",
    details: { ...goal.details, shootingPlayerId: 1 },
  };
  Reflect.deleteProperty(context.details, "scoringPlayerId");
  f.sources.pbp.plays.push(context);
  const pbp = {
    ...f.sources.pbp,
    rosterSpots: [
      {
        playerId: 1,
        teamId: 1,
        sweaterNumber: 1,
        positionCode: "C",
        lastName: { default: "Player" },
      },
      {
        playerId: 16,
        teamId: 2,
        sweaterNumber: 16,
        positionCode: "G",
        lastName: { default: "Goalie" },
      },
    ],
  };
  const box = {
    ...f.sources.box,
    playerByGameStats: {
      ...f.sources.box.playerByGameStats,
      homeTeam: {
        ...f.sources.box.playerByGameStats.homeTeam,
        forwards: [
          { ...f.sources.box.playerByGameStats.homeTeam.forwards[0]!, sog: 2 },
        ],
      },
      awayTeam: {
        ...f.sources.box.playerByGameStats.awayTeam,
        goalies: [
          {
            ...f.sources.box.playerByGameStats.awayTeam.goalies[0]!,
            shotsAgainst: 2,
          },
        ],
      },
    },
  };
  const html = `<title>Play By Play</title><table><tr><td>Game 0999</td><td>Wednesday, January 1, 2025</td></tr><tr><td>9</td><td>1</td><td>EV</td><td>0:4019:20</td><td>SHOT</td><td>HOM ONGOAL - #1 PLAYER, Wrist, Off. Zone</td><td>16 G</td><td>1 C</td></tr><tr><td>10</td><td>1</td><td>EV</td><td>0:4019:20</td><td>GOAL</td><td>HOM #1 PLAYER(1), Penalty Shot, Wrist, Off. Zone</td><td>16 G</td><td>1 C</td></tr></table>`;
  const totals = [
      {
        gameId: pbp.id,
        playerId: 1,
        penaltyShotAttempts: 1,
        penaltyShotsGoals: 1,
      },
    ],
    hashes = {
      pbpSha256: "a".repeat(64),
      htmlSha256: "b".repeat(64),
      boxSha256: "c".repeat(64),
      scopedPenaltyLedgerSha256: "d".repeat(64),
    };
  return { pbp, box, html, totals, hashes };
}
test("independently labeled PS goal takes one attempt while uncertain recorded SOG is retained without fabricated credit", () => {
  const f = fixture(),
    before = JSON.stringify(f),
    proof = parseOfficialPenaltyShotContext(
      f.html,
      f.pbp,
      f.box,
      f.totals,
      f.hashes,
    ),
    result = applyOfficialPenaltyShotContext(f.pbp, proof, f.hashes.pbpSha256);
  assert.equal(JSON.stringify(f), before);
  assert.deepEqual(proof.penaltyShotEventIds, [6]);
  assert.deepEqual(proof.unclassifiedEventIds, [5]);
  assert.equal(
    proof.version,
    "nhl-official-unclassified-penalty-shot-context-v1",
  );
  assert.equal(Object.hasOwn(proof, "contextProofClass"), false);
  assert.equal(result.plays.length, f.pbp.plays.length);
  assert.equal(penaltyShotGameMatches(result, f.totals), true);
  assert.equal(
    (
      result.plays.find((p) => p.eventId === 5)!.details as Record<
        string,
        unknown
      >
    ).nhlReportUnclassifiedPenaltyShotContext,
    true,
  );
  assert.throws(
    () => applyOfficialPenaltyShotContext(f.pbp, proof, "e".repeat(64)),
    /identity/,
  );
});

function nonisolatedFixture() {
  const f = fixture();
  f.pbp.plays.find((p) => p.eventId === 5)!.situationCode = "1551";
  for (const [id, position] of [
    [2, "C"],
    [3, "L"],
    [4, "R"],
    [5, "D"],
    [6, "G"],
  ] as const)
    f.pbp.rosterSpots.push({
      playerId: id,
      teamId: 1,
      sweaterNumber: id,
      positionCode: position,
      lastName: { default: `Player${id}` },
    });
  f.html = f.html.replace("<td>1 C</td>", "<td>1 C 2 C 3 L 4 R 5 D 6 G</td>");
  return f;
}
test("a full rostered offense against only the verified goalie is a separate unpriced context proof, not ordinary play", () => {
  const f = nonisolatedFixture(),
    before = JSON.stringify(f);
  const proof = parseOfficialPenaltyShotContext(
    f.html,
    f.pbp,
    f.box,
    f.totals,
    f.hashes,
  );
  assert.equal(
    proof.version,
    "nhl-official-unclassified-penalty-shot-context-v2",
  );
  assert.equal(proof.contextProofClass, "full-offense-versus-goalie-only");
  assert.deepEqual(proof.penaltyShotEventIds, [6]);
  assert.deepEqual(proof.unclassifiedEventIds, [5]);
  const result = applyOfficialPenaltyShotContext(
    f.pbp,
    proof,
    f.hashes.pbpSha256,
  );
  assert.equal(penaltyShotGameMatches(result, f.totals), true);
  assert.equal(
    extractShotTrainingRows(result).some(
      (r) => r.eventId === 5 || r.eventId === 6,
    ),
    false,
  );
  assert.equal(
    result.plays.find((p) => p.eventId === 5)!.situationCode,
    "1551",
  );
  assert.equal(JSON.stringify(f), before);
});
test("the second proof class rejects defending skaters, incomplete or duplicate offense identities and unsupported manpower", () => {
  for (const change of [
    (f: ReturnType<typeof nonisolatedFixture>) => {
      f.html = f.html.replace("<td>16 G</td>", "<td>16 G 17 D</td>");
    },
    (f: ReturnType<typeof nonisolatedFixture>) => {
      f.html = f.html.replace("2 C 3 L", "2 C 999 L");
    },
    (f: ReturnType<typeof nonisolatedFixture>) => {
      f.html = f.html.replace("2 C 3 L", "2 C 2 C");
    },
    (f: ReturnType<typeof nonisolatedFixture>) => {
      f.html = f.html.replace("5 D 6 G", "5 D");
    },
    (f: ReturnType<typeof nonisolatedFixture>) => {
      f.html = f.html.replace("5 D 6 G", "5 D 6 D");
    },
    (f: ReturnType<typeof nonisolatedFixture>) => {
      f.pbp.plays.find((p) => p.eventId === 5)!.situationCode = "1451";
    },
  ]) {
    const f = nonisolatedFixture();
    change(f);
    assert.throws(() =>
      parseOfficialPenaltyShotContext(f.html, f.pbp, f.box, f.totals, f.hashes),
    );
  }
});
test("context repair rejects unknown shot-count conservation, nonisolated report, wrong ledger and wrong report scope", () => {
  for (const change of [
    (f: ReturnType<typeof fixture>) => {
      f.box.playerByGameStats.homeTeam.forwards[0]!.sog = 1;
    },
    (f: ReturnType<typeof fixture>) => {
      f.html = f.html.replaceAll("<td>1 C</td>", "<td>1 C 2 C</td>");
    },
    (f: ReturnType<typeof fixture>) => {
      f.totals[0]!.penaltyShotsGoals = 0;
    },
    (f: ReturnType<typeof fixture>) => {
      f.html = f.html.replace("Game 0999", "Game 0998");
    },
  ]) {
    const f = fixture();
    change(f);
    assert.throws(() =>
      parseOfficialPenaltyShotContext(f.html, f.pbp, f.box, f.totals, f.hashes),
    );
  }
});
