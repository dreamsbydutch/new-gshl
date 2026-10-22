import assert from "node:assert/strict";
import test from "node:test";
import { HockeyDataCache } from "./game-value-source";
import { collectOfficialPenaltyShotContext } from "./official-penalty-shot-context-source";
import { OfficialPenaltyShotResolutionError } from "../../domains/nhl/official-penalty-shot-report";
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
class FixtureCache extends HockeyDataCache {
  readonly writes: Array<{ key: string; data: unknown }> = [];
  readonly reads: string[] = [];
  constructor(readonly fixture: ReturnType<typeof nonscoringFixture>) {
    super("unused-fixture-cache", true);
  }
  override async bytes(url: string) {
    this.reads.push(url);
    if (url.endsWith("/play-by-play"))
      return Buffer.from(JSON.stringify(this.fixture.pbp));
    if (url.endsWith("/boxscore"))
      return Buffer.from(JSON.stringify(this.fixture.box));
    if (url.endsWith(".HTM")) return Buffer.from(this.fixture.html);
    throw Error("Unexpected fixture read: " + url);
  }
  override async derived<T>(_key: string): Promise<T | undefined> {
    return undefined;
  }
  override async saveDerived(key: string, data: unknown, _urls: string[]) {
    this.writes.push({ key, data });
  }
}
test("unique original terminal uses the existing supplement before paired context review", async () => {
  const f = nonscoringFixture();
  f.pbp.plays = f.pbp.plays.filter((p) => p.eventId !== 5);
  const cache = new FixtureCache(f),
    before = structuredClone(f);
  assert.equal(
    await collectOfficialPenaltyShotContext(cache, f.pbp.id, f.totals, []),
    null,
  );
  assert.deepEqual(cache.writes, [
    {
      key: `penalty-shots-${f.pbp.id}`,
      data: { gameId: f.pbp.id, eventIds: [6] },
    },
  ]);
  assert.equal(
    cache.reads.some((url) => url.endsWith("/boxscore")),
    false,
  );
  assert.deepEqual(f, before);
});
test("ambiguous paired native attempts continue through independently checked context evidence", async () => {
  const f = nonscoringFixture(),
    cache = new FixtureCache(f);
  const proof = await collectOfficialPenaltyShotContext(
    cache,
    f.pbp.id,
    f.totals,
    [],
  );
  assert.equal(
    proof?.version,
    "nhl-official-verified-nonscoring-penalty-shot-context-v3",
  );
  assert.deepEqual(proof?.ordinaryEventIds, [5]);
  assert.deepEqual(proof?.penaltyShotEventIds, [6]);
  assert.equal(cache.writes.length, 1);
  assert.equal(
    cache.writes[0]?.key,
    `official-penalty-shot-context-${f.pbp.id}`,
  );
  assert.equal(
    cache.reads.some((url) => url.endsWith("/boxscore")),
    true,
  );
});
test("invalid report scope, malformed label and invalid ledger never enter fallback or save evidence", async () => {
  for (const mutate of [
    (f: ReturnType<typeof nonscoringFixture>) => {
      f.html = f.html.replace("Game 0999", "Game 0998");
    },
    (f: ReturnType<typeof nonscoringFixture>) => {
      f.html = f.html.replace(
        "#1 PLAYER, Penalty Shot",
        "PLAYER, Penalty Shot",
      );
    },
    (f: ReturnType<typeof nonscoringFixture>) => {
      f.totals[0]!.penaltyShotAttempts = NaN;
    },
  ]) {
    const f = nonscoringFixture();
    mutate(f);
    const cache = new FixtureCache(f);
    await assert.rejects(
      () => collectOfficialPenaltyShotContext(cache, f.pbp.id, f.totals, []),
      (error) =>
        error instanceof Error &&
        !(error instanceof OfficialPenaltyShotResolutionError),
    );
    assert.deepEqual(cache.writes, []);
    assert.equal(
      cache.reads.some((url) => url.endsWith("/boxscore")),
      false,
    );
  }
});
