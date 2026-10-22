import assert from "node:assert/strict";
import test from "node:test";
import {
  replayUnavailableShiftProof,
  type UnavailableShiftProof,
} from "./unavailable-shift-proof";
import { gameFixture } from "./game-value-fixtures";
import {
  retainedBoundary2008Fixtures,
  retainedUnavailable2008Fixtures,
} from "./boundary-shift-fixtures";
import { parseOfficialShiftReport } from "./official-shift-report";
import {
  buildGameValueData,
  extractShotTrainingRows,
} from "./game-value-input";

function retainedUnavailableFixture(gameId: number) {
  const inputs = retainedUnavailable2008Fixtures().find(
    (f) => f.pbp.id === gameId,
  )!;
  const proof: UnavailableShiftProof = {
    version: "nhl-reviewed-unavailable-shifts-v1",
    gameId,
    parserBindingSha256: "a".repeat(64),
    derivedShiftsSha256: "b".repeat(64),
    derivedBoxSha256: "c".repeat(64),
    effectivePbpSha256: "d".repeat(64),
    evidence: [
      {
        role: "pbp",
        url: "https://example.test/retained-scope",
        sha256: "e".repeat(64),
      },
    ],
    review: {
      reason: "Exact retained report scope; native exposure remains unknown",
      evidenceSha256: "f".repeat(64),
    },
    outcomes:
      gameId === 2008020967
        ? {
            home: {
              status: "unavailable",
              error: "Malformed shift report player heading",
            },
            away: { status: "verified", intervals: 414 },
          }
        : {
            home: {
              status: "unavailable",
              error:
                gameId === 2008020259
                  ? "Wrong shift report date"
                  : "Official shift report contains no verified shifts",
            },
            away: {
              status: "unavailable",
              error:
                gameId === 2008020259
                  ? "Wrong shift report date"
                  : "Official shift report contains no verified shifts",
            },
          },
  };
  return {
    proof,
    inputs: {
      ...inputs,
      schedule: {
        total: 1,
        data: [
          {
            id: gameId,
            season: 20082009,
            gameType: 2,
            gameStateId: 7,
            gameDate: inputs.pbp.gameDate,
            homeTeamId: inputs.pbp.homeTeam.id,
            visitingTeamId: inputs.pbp.awayTeam.id,
          },
        ],
      },
      shiftPages: [{ total: 0, data: [] }],
    },
  };
}

test("exact empty, wrong-date and anonymous-positive 2008 reports retain official inputs and any verified side", () => {
  for (const id of [2008020259, 2008020409, 2008020967, 2008021077]) {
    const { proof, inputs } = retainedUnavailableFixture(id),
      before = JSON.stringify(inputs);
    const result = replayUnavailableShiftProof(proof, inputs);
    assert.equal(JSON.stringify(inputs), before);
    assert.equal(result.pbp, inputs.pbp);
    assert.equal(result.box, inputs.box);
    if (id === 2008020967) {
      assert.equal(result.shifts.length, 414);
      assert.deepEqual(
        result.shifts,
        parseOfficialShiftReport(inputs.reports.away, inputs.pbp, false, []),
      );
      assert.deepEqual(result.shiftAvailability.verifiedShiftSides, ["away"]);
    } else assert.equal(result.shifts.length, 0);
    const presence = buildGameValueData(
      result,
      [],
      new Map(
        extractShotTrainingRows(inputs.pbp).map((row) => [row.eventId, 0]),
      ),
    );
    assert.equal(presence.usableProcessSeconds, 0);
    assert.equal(presence.eligible, false);
    assert(presence.players.length > 0);
    assert(presence.players.reduce((n, p) => n + p.seconds, 0) > 0);
  }
});

test("new bounded unavailable cases reject changed report bodies, anonymous-zero fabrication, wrong identities and API alternatives", () => {
  for (const id of [2008020259, 2008020409, 2008020967, 2008021077]) {
    for (const change of [
      (f: ReturnType<typeof retainedUnavailableFixture>) => {
        f.inputs.reports.home += " ";
      },
      (f: ReturnType<typeof retainedUnavailableFixture>) => {
        f.inputs.reports.away += " ";
      },
      (f: ReturnType<typeof retainedUnavailableFixture>) => {
        f.inputs.pbp.gameDate = "2008-01-01";
      },
      (f: ReturnType<typeof retainedUnavailableFixture>) => {
        f.inputs.apiShifts.push({ gameId: id });
      },
    ]) {
      const f = retainedUnavailableFixture(id);
      change(f);
      assert.throws(() => replayUnavailableShiftProof(f.proof, f.inputs));
    }
  }
  const f = retainedUnavailableFixture(2008020967);
  f.inputs.reports.home = f.inputs.reports.home.replace("00:03", "00:00");
  assert.throws(
    () => replayUnavailableShiftProof(f.proof, f.inputs),
    /source changed/,
  );
});

function phantom0160Fixture() {
  const f = retainedBoundary2008Fixtures().find(
    (f) => f.pbp.id === 2008020160,
  )!;
  const home = parseOfficialShiftReport(f.reports.home, f.pbp, true, []);
  const proof: UnavailableShiftProof = {
    version: "nhl-reviewed-unavailable-shifts-v1",
    gameId: f.pbp.id,
    parserBindingSha256: "a".repeat(64),
    derivedShiftsSha256: "b".repeat(64),
    derivedBoxSha256: "c".repeat(64),
    effectivePbpSha256: "d".repeat(64),
    evidence: [
      { role: "pbp", url: "https://example.test/0160", sha256: "e".repeat(64) },
    ],
    review: {
      reason:
        "Exact positive five-second Burns report actor absent canonical roster and official appearance cohort; preserve verified home side.",
      evidenceSha256: "f".repeat(64),
    },
    outcomes: {
      home: { status: "verified", intervals: home.length },
      away: {
        status: "unavailable",
        error: "Unverified shift-report jersey 8",
      },
    },
  };
  const inputs = {
    ...f,
    schedule: {
      total: 1,
      data: [
        {
          id: f.pbp.id,
          season: 20082009,
          gameType: 2,
          gameStateId: 7,
          gameDate: f.pbp.gameDate,
          homeTeamId: 27,
          visitingTeamId: 30,
        },
      ],
    },
    shiftPages: [{ total: 0, data: [] }],
  };
  return { proof, inputs, home };
}
test("exact 0160 positive phantom actor preserves the verified side and native exposure as unknown", () => {
  const { proof, inputs, home } = phantom0160Fixture(),
    before = JSON.stringify(inputs);
  assert.throws(
    () => parseOfficialShiftReport(inputs.reports.away, inputs.pbp, false, []),
    /Unverified shift-report jersey 8/,
  );
  const result = replayUnavailableShiftProof(proof, inputs);
  assert.equal(JSON.stringify(inputs), before);
  assert.deepEqual(result.shifts, home);
  assert.deepEqual(result.shiftAvailability.verifiedShiftSides, ["home"]);
  assert.deepEqual(result.shiftAvailability.unavailableShiftSides, ["away"]);
  assert.equal(result.pbp, inputs.pbp);
  assert.equal(result.box, inputs.box);
  const presence = buildGameValueData(
    result,
    [],
    new Map(extractShotTrainingRows(inputs.pbp).map((row) => [row.eventId, 0])),
  );
  assert.equal(presence.usableProcessSeconds, 0);
  assert.equal(presence.eligible, false);
  assert.ok(presence.players.length > 0);
});
test("0160 cannot hide a recovered actor, changed positive source row, API alternative or wrong season", () => {
  const base = phantom0160Fixture();
  for (const change of [
    (f: typeof base) => {
      f.inputs.reports.away = f.inputs.reports.away.replace("00:05", "00:00");
    },
    (f: typeof base) => {
      f.inputs.pbp.rosterSpots.push({
        playerId: 8470613,
        teamId: 30,
        sweaterNumber: 8,
        positionCode: "D",
        lastName: { default: "Burns" },
      });
    },
    (f: typeof base) => {
      f.inputs.box.playerByGameStats.awayTeam!.defense!.push({
        playerId: 8470613,
        toi: "00:05",
      });
    },
    (f: typeof base) => {
      f.inputs.schedule.data[0]!.season = 20092010;
    },
    (f: typeof base) => {
      f.proof.gameId = 2008020161;
    },
    (f: typeof base) => {
      f.inputs.reports.home = "malformed";
    },
  ]) {
    const f = structuredClone(base);
    change(f);
    assert.throws(() => replayUnavailableShiftProof(f.proof, f.inputs));
  }
});

function fixture() {
  const f = gameFixture(),
    id = 2009020002;
  const pbp = {
    ...f.sources.pbp,
    id,
    gameDate: "2009-10-01",
    rosterSpots: [
      {
        playerId: 1,
        teamId: 1,
        sweaterNumber: 88,
        lastName: { default: "Pastrnak" },
      },
      {
        playerId: 11,
        teamId: 2,
        sweaterNumber: 88,
        lastName: { default: "Pastrnak" },
      },
    ],
  };
  const html = (home: boolean, bad = true) =>
    `<title>Time On Ice Report ${home ? "Home" : "Away"} Team</title><table><tr><td>Game 2</td><td>Thursday, October 1, 2009</td></tr></table><table><tr><td class="playerHeading">88 PASTRNAK, DAVID</td></tr><tr><td>1</td><td>1</td><td>0:00 / 20:00</td><td>0:45 / 19:15</td><td>${bad ? "00:55" : "00:45"}</td><td></td></tr></table>`;
  const proof: UnavailableShiftProof = {
    version: "nhl-reviewed-unavailable-shifts-v1",
    gameId: id,
    parserBindingSha256: "a".repeat(64),
    derivedShiftsSha256: "b".repeat(64),
    derivedBoxSha256: "c".repeat(64),
    effectivePbpSha256: "d".repeat(64),
    evidence: [
      { role: "pbp", url: "https://example.test", sha256: "e".repeat(64) },
    ],
    outcomes: {
      home: {
        status: "unavailable",
        error: "Invalid official report shift interval",
      },
      away: {
        status: "unavailable",
        error: "Invalid official report shift interval",
      },
    },
    review: {
      reason:
        "Both raw official TOI reports have impossible shift clocks; no API alternative.",
      evidenceSha256: "f".repeat(64),
    },
  };
  const inputs = {
    pbp,
    box: { ...f.sources.box, id, gameDate: pbp.gameDate },
    apiShifts: [],
    reports: { home: html(true), away: html(false) },
    schedule: {
      total: 1,
      data: [
        {
          id,
          season: 20092010,
          gameType: 2,
          gameStateId: 7,
          gameDate: pbp.gameDate,
          homeTeamId: 1,
          visitingTeamId: 2,
        },
      ],
    },
    shiftPages: [{ total: 0, data: [] }],
  };
  return { proof, inputs, html };
}

test("downloaded but unusable shifts preserve official denominators and physically supported individual events", () => {
  const { proof, inputs } = fixture(),
    before = JSON.stringify(inputs);
  const sources = replayUnavailableShiftProof(proof, inputs);
  const rows = extractShotTrainingRows(inputs.pbp);
  const presence = new Map(rows.map((r) => [r.eventId, 0]));
  const game = buildGameValueData(sources, [], presence, 0.3);
  assert.equal(game.eligible, false);
  assert.equal(game.usableProcessSeconds, 0);
  assert.equal(game.stints.length, 0);
  assert.equal(game.players.length, 12);
  assert.equal(
    game.players.reduce((n, p) => n + p.seconds, 0),
    14400,
  );
  assert.equal(game.officialShots, 2);
  assert.equal(game.shots.length, rows.length);
  assert.ok(game.shots.length > 0);
  assert.ok(game.shots.every((s) => s.attribution === "individual-only"));
  assert.deepEqual(sources.shiftAvailability.unavailableShiftSides, [
    "home",
    "away",
  ]);
  assert.equal(JSON.stringify(inputs), before);
});
test("verified side is retained, but cannot fabricate a combined lineup", () => {
  const { proof, inputs, html } = fixture();
  proof.outcomes.home = { status: "verified", intervals: 1 };
  inputs.reports.home = html(true, false);
  const sources = replayUnavailableShiftProof(proof, inputs);
  assert.equal(sources.shifts.length, 1);
  assert.deepEqual(sources.shiftAvailability.verifiedShiftSides, ["home"]);
  const game = buildGameValueData(
    sources,
    [],
    new Map(extractShotTrainingRows(inputs.pbp).map((r) => [r.eventId, 0])),
    0.3,
  );
  assert.equal(game.usableProcessSeconds, 0);
  assert.equal(game.stints.length, 0);
  proof.outcomes.away = { status: "verified", intervals: 1 };
  inputs.reports.away = html(false, false);
  assert.throws(
    () => replayUnavailableShiftProof(proof, inputs),
    /recovered game/,
  );
});
test("recovered report, unexpected parser failure and nonempty API alternative reject", () => {
  const a = fixture();
  a.inputs.reports.home = a.html(true, false);
  assert.throws(
    () => replayUnavailableShiftProof(a.proof, a.inputs),
    /resolved/,
  );
  const b = fixture();
  b.inputs.reports.home = b.inputs.reports.home.replace(
    "Home Team",
    "Away Team",
  );
  assert.throws(() => replayUnavailableShiftProof(b.proof, b.inputs), /side/);
  const c = fixture();
  c.inputs.apiShifts.push({} as never);
  assert.throws(
    () => replayUnavailableShiftProof(c.proof, c.inputs),
    /alternative/,
  );
  const d = fixture();
  d.inputs.shiftPages = [
    { total: 1, data: [{ id: 1, gameId: d.proof.gameId }] },
  ] as never;
  assert.throws(
    () => replayUnavailableShiftProof(d.proof, d.inputs),
    /alternative/,
  );
});
test("no generic error allowlist, new games, incomplete downloads or dropped schedule games", () => {
  const a = fixture();
  a.proof.gameId = 2009020003;
  assert.throws(() => replayUnavailableShiftProof(a.proof, a.inputs), /scope/);
  const b = fixture();
  b.proof.outcomes.home = {
    status: "unavailable",
    error: "Wrong shift report date",
  };
  assert.throws(
    () => replayUnavailableShiftProof(b.proof, b.inputs),
    /Unreviewed/,
  );
  const c = fixture();
  c.inputs.shiftPages = [{ total: 1, data: [] }];
  assert.throws(
    () => replayUnavailableShiftProof(c.proof, c.inputs),
    /Incomplete/,
  );
  const d = fixture();
  d.inputs.schedule.total = 2;
  assert.throws(
    () => replayUnavailableShiftProof(d.proof, d.inputs),
    /schedule/,
  );
  const e = fixture();
  e.proof.review.reason = "";
  assert.throws(() => replayUnavailableShiftProof(e.proof, e.inputs), /review/);
});
