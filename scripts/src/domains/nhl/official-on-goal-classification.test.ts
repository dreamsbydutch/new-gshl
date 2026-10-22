import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { extractShotTrainingRows } from "./game-value-input";
import {
  parseOfficialOnGoalClassification,
  reviewedOnGoalClassificationGroups,
  validateReviewedOnGoalClassificationGroup,
  type OnGoalOfficialGameRow,
} from "./official-on-goal-classification";
import {
  summarizeOfficialOnGoalCoverage,
  summarizeOfficialSourceCoverage,
} from "./official-on-goal-coverage";
import type { NhlRatingSource } from "./season-rating-input";

const SHOOTER = 8462042,
  GOALIE = 8462152;
// Controlled source fixtures use scoped identities, not claims about the actual historical game.
function fixture() {
  const rosterSpots = [
    {
      playerId: SHOOTER,
      teamId: 1,
      sweaterNumber: 1,
      positionCode: "C",
      lastName: { default: "SHOOTER" },
    },
    {
      playerId: GOALIE,
      teamId: 2,
      sweaterNumber: 2,
      positionCode: "G",
      lastName: { default: "AWAY" },
    },
    {
      playerId: 3,
      teamId: 1,
      sweaterNumber: 3,
      positionCode: "G",
      lastName: { default: "HOME" },
    },
  ];
  const plays = ["shot-on-goal", "missed-shot", "goal"].map(
    (typeDescKey, i) => ({
      eventId: 11 + i,
      sortOrder: i + 1,
      typeDescKey,
      periodDescriptor: { number: 1, periodType: "REG" },
      timeInPeriod: `00:${(i + 1) * 10}`,
      situationCode: "1011",
      details: {
        eventOwnerTeamId: 1,
        shootingPlayerId: SHOOTER,
        scoringPlayerId: SHOOTER,
        goalieInNetId: GOALIE,
        xCoord: 80,
        yCoord: 2,
        shotType: "wrist",
      },
    }),
  );
  const raw = {
    id: 2009020213,
    gameDate: "2009-11-01",
    homeTeam: { id: 1, abbrev: "HOM", score: 1 },
    awayTeam: { id: 2, abbrev: "AWY", score: 0 },
    rosterSpots,
    plays,
  };
  const rows: OnGoalOfficialGameRow[] = rosterSpots.map((r) => ({
    gameId: raw.id,
    date: raw.gameDate,
    playerId: r.playerId,
    teamId: r.teamId,
    position: r.positionCode === "G" ? "G" : "F",
    gamesPlayed: 1,
    goals: r.playerId === 3 ? 0 : 1,
    onGoal: r.playerId === 3 ? 0 : 1,
  }));
  const box = {
    id: raw.id,
    gameDate: raw.gameDate,
    homeTeam: raw.homeTeam,
    awayTeam: raw.awayTeam,
    playerByGameStats: {
      homeTeam: {
        forwards: [{ playerId: SHOOTER, sog: 1, goals: 1, toi: "01:00" }],
        goalies: [
          { playerId: 3, shotsAgainst: 0, goalsAgainst: 0, toi: "01:00" },
        ],
      },
      awayTeam: {
        goalies: [
          { playerId: GOALIE, shotsAgainst: 1, goalsAgainst: 1, toi: "01:00" },
        ],
      },
    },
  };
  const tr = (v: string[]) =>
    `<tr>${v.map((x) => `<td>${x}</td>`).join("")}</tr>`;
  const html = `<title>Play By Play</title><table>${tr(["Sunday, November 1, 2009"])}${tr(["Game 0213"])}${["SHOT", "MISS", "GOAL"].map((k, i) => tr([String(i + 1), "1", "EV", `00:${(i + 1) * 10}`, k, "HOM #1 SHOOTER, Wrist", "2 G", "1 C 3 G"])).join("")}</table>`;
  const hashes = {
    pbpSha256: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
    htmlSha256: createHash("sha256").update(html).digest("hex"),
    boxSha256: "c".repeat(64),
    officialSummarySha256: "d".repeat(64),
  };
  const parse = () =>
    parseOfficialOnGoalClassification(
      html,
      raw,
      box,
      rows,
      [SHOOTER, GOALIE],
      hashes,
    );
  return { raw, rows, box, html, hashes, parse };
}

test("exact whole physical groups preserve goals, misses and native geometry without assigning the disputed SOG", () => {
  const f = fixture(),
    before = JSON.stringify(f),
    proof = f.parse();
  assert.equal(proof.groups.length, 2);
  for (const group of proof.groups) {
    assert.equal(group.officialOnGoalAttempts, 1);
    assert.equal(group.primaryLabeledOnGoalAttempts, 2);
    assert.deepEqual(
      group.events.map((e) => e.kind),
      ["SHOT", "MISS", "GOAL"],
    );
  }
  assert.deepEqual(
    proof.groups[0]!.events.map((e) => e.nativeGeometry.xCoord),
    [80, 80, 80],
  );
  assert.equal(JSON.stringify(f), before);
  for (const g of reviewedOnGoalClassificationGroups(proof))
    assert.doesNotThrow(() => validateReviewedOnGoalClassificationGroup(g));
});

test("primary identity, goalie, manpower and complete conflict population remain strict", () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => {
      f.raw.id = 2009020214;
    },
    (f: ReturnType<typeof fixture>) => {
      f.raw.plays[0]!.details.goalieInNetId = 3;
    },
    (f: ReturnType<typeof fixture>) => {
      f.raw.plays[0]!.situationCode = "1551";
    },
    (f: ReturnType<typeof fixture>) => {
      f.raw.plays[0]!.details.xCoord = NaN;
    },
    (f: ReturnType<typeof fixture>) => {
      f.box.playerByGameStats.homeTeam.forwards[0]!.goals = 0;
    },
    (f: ReturnType<typeof fixture>) => {
      f.raw.plays.pop();
    },
  ]) {
    const f = fixture();
    mutate(f);
    f.hashes.pbpSha256 = createHash("sha256")
      .update(JSON.stringify(f.raw))
      .digest("hex");
    assert.throws(f.parse);
  }
  const f = fixture();
  assert.throws(
    () =>
      parseOfficialOnGoalClassification(
        f.html,
        f.raw,
        f.box,
        f.rows,
        [SHOOTER],
        f.hashes,
      ),
    /complete conflict|scope/,
  );
  assert.throws(
    () =>
      parseOfficialOnGoalClassification(
        f.html.replace("November 1", "November 2"),
        f.raw,
        f.box,
        f.rows,
        [SHOOTER, GOALIE],
        f.hashes,
      ),
    /identity|hash differs/,
  );
  assert.throws(
    () =>
      parseOfficialOnGoalClassification(
        f.html.replace("00:20", "00:21"),
        f.raw,
        f.box,
        f.rows,
        [SHOOTER, GOALIE],
        f.hashes,
      ),
    /unique primary|hash differs/,
  );
});

test("reviewed group hash cannot authorize changed event identity or arbitrary excess", () => {
  const f = fixture(),
    g = reviewedOnGoalClassificationGroups(f.parse())[0]!;
  for (const mutate of [
    (x: typeof g) => {
      x.events[0]!.eventId++;
    },
    (x: typeof g) => {
      x.officialOnGoalAttempts = 0;
    },
    (x: typeof g) => {
      x.events.pop();
    },
  ]) {
    const bad = structuredClone(g);
    mutate(bad);
    assert.throws(() => validateReviewedOnGoalClassificationGroup(bad));
  }
});

test("a recomputed hash cannot expand the declared historical player scope", () => {
  const f = fixture(),
    group = reviewedOnGoalClassificationGroups(f.parse())[0]!;
  const forged = structuredClone(group);
  forged.playerId = 999;
  for (const event of forged.events) event.shooter = 999;
  const { groupSha256: discard, ...body } = forged;
  void discard;
  forged.groupSha256 = createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  assert.throws(
    () => validateReviewedOnGoalClassificationGroup(forged),
    /binding/,
  );
});

test("reviewed excess cannot cancel one unrelated missing official on-goal attempt", () => {
  const f = fixture(),
    group = reviewedOnGoalClassificationGroups(f.parse())[0]!;
  const game = {
    gameId: 2009020213,
    shots: group.events,
    shotCoverageByPlayer: {
      [SHOOTER]: {
        expected: 3,
        matched: 3,
        missingGoals: 0,
        expectedOnGoal: 2,
      },
    },
  };
  const ref = {
    playerId: SHOOTER,
    name: "Shooter",
    position: "F" as const,
    games: 2,
    minutes: 20,
    officialOnGoalAttempts: 2,
    reviewedOnGoalClassifications: [group],
  };
  const row = summarizeOfficialOnGoalCoverage(
    [game, { gameId: 2009020214, shots: [], shotCoverageByPlayer: {} }],
    [ref],
  ).players[0]!;
  assert.equal(row.reviewedClassificationExcess, 1);
  assert.equal(row.missingOnGoalAttempts, 1);
  assert.equal(row.effectiveExpectedAttempts, 4);
  assert.equal(row.individualCoverage, 0.75);
  const source: NhlRatingSource = {
    season: 20092010,
    gameType: 2,
    profile: "core",
    fetchedAt: "2010-07-01T00:00:00Z",
    skaters: {
      summary: [
        { seasonId: 20092010, playerId: SHOOTER, positionCode: "C", shots: 2 },
      ],
      timeonice: [],
      scoringRates: [],
      goalsForAgainst: [],
      powerplay: [],
      penaltykill: [],
    },
    goalies: [],
    edge: {},
    warnings: [],
  };
  const global = summarizeOfficialSourceCoverage(
    [
      {
        ...game,
        gameSeconds: 3600,
        usableProcessSeconds: 3600,
        officialShots: 3,
      },
    ],
    [ref],
    source,
    2,
    { officialGames: 1, officialSeasonExposureMatches: true },
  );
  assert.equal(global.onGoalAccounting.reviewedPrimaryLabelExcess, 1);
  assert.equal(global.onGoalAccounting.absentOnGoalAttemptsLowerBound, 1);
  assert.equal(global.coverage.officialShots, 4);
  assert.equal(
    global.sourceGates.atLeast98PercentIndividualShotsVerified,
    false,
  );

  assert.throws(
    () =>
      summarizeOfficialOnGoalCoverage(
        [game],
        [
          {
            ...ref,
            officialOnGoalAttempts: 1,
            reviewedOnGoalClassifications: [],
          },
        ],
      ),
    /exceed/,
  );
  const altered = structuredClone(game);
  altered.shots[0]!.eventId = 99;
  assert.throws(
    () => summarizeOfficialOnGoalCoverage([altered], [ref]),
    /entire verified/,
  );
  assert.throws(
    () =>
      summarizeOfficialOnGoalCoverage(
        [game],
        [{ ...ref, reviewedOnGoalClassifications: [group, group] }],
      ),
    /reuse/,
  );
});

test("unrelated missing native goal remains explicit while selected complete groups are reviewed", () => {
  const f = fixture();
  f.raw.rosterSpots.push({
    playerId: 4,
    teamId: 2,
    sweaterNumber: 4,
    positionCode: "C",
    lastName: { default: "OTHER" },
  });
  f.rows.push({
    gameId: f.raw.id,
    date: f.raw.gameDate,
    playerId: 4,
    teamId: 2,
    position: "F",
    gamesPlayed: 1,
    goals: 1,
    onGoal: 1,
  });
  f.rows.find((r) => r.playerId === 3)!.goals = 1;
  f.rows.find((r) => r.playerId === 3)!.onGoal = 1;
  f.raw.awayTeam.score = 1;
  f.box.playerByGameStats.homeTeam.goalies[0]!.goalsAgainst = 1;
  f.box.playerByGameStats.homeTeam.goalies[0]!.shotsAgainst = 1;
  const box = {
    ...f.box,
    playerByGameStats: {
      ...f.box.playerByGameStats,
      awayTeam: {
        ...f.box.playerByGameStats.awayTeam,
        forwards: [{ playerId: 4, sog: 1, goals: 1, toi: "01:00" }],
      },
    },
  };
  const extra =
    "<tr><td>4</td><td>1</td><td>EV</td><td>00:40</td><td>GOAL</td><td>AWY #4 OTHER, Wrist</td><td>4 C 2 G</td><td>1 C 3 G</td></tr>";
  const html = f.html.replace("</table>", extra + "</table>");
  const hashes = {
    ...f.hashes,
    pbpSha256: createHash("sha256").update(JSON.stringify(f.raw)).digest("hex"),
    htmlSha256: createHash("sha256").update(html).digest("hex"),
  };
  const proof = parseOfficialOnGoalClassification(
    html,
    f.raw,
    box,
    f.rows,
    [SHOOTER, GOALIE],
    hashes,
  );
  assert.deepEqual(
    proof.unrelatedMissingExposure.map((r) => [
      r.playerId,
      r.missingGoals,
      r.missingPrimaryOnGoalAttempts,
    ]),
    [
      [3, 1, 1],
      [4, 1, 1],
    ],
  );
  const coverage = summarizeOfficialOnGoalCoverage(
    [
      {
        gameId: f.raw.id,
        shots: proof.groups[0]!.events,
        shotCoverageByPlayer: {
          [SHOOTER]: {
            expected: 3,
            matched: 3,
            missingGoals: 0,
            expectedOnGoal: 2,
          },
        },
      },
    ],
    [
      {
        playerId: 4,
        name: "Unrelated missing scorer",
        position: "F",
        games: 1,
        minutes: 20,
        officialOnGoalAttempts: 1,
      },
    ],
  );
  assert.equal(coverage.players[0]!.individualCoverage, 0);
  assert.equal(coverage.players[0]!.missingOnGoalAttempts, 1);
  const missing = structuredClone(f.raw);
  missing.plays.shift();
  assert.throws(
    () =>
      parseOfficialOnGoalClassification(
        html,
        missing,
        box,
        f.rows,
        [SHOOTER, GOALIE],
        {
          ...hashes,
          pbpSha256: createHash("sha256")
            .update(JSON.stringify(missing))
            .digest("hex"),
        },
      ),
    /full physical/,
  );
});

test("unpriced group MISS remains in full source exposure with valued events only an exact subset", () => {
  const f = fixture(),
    group = reviewedOnGoalClassificationGroups(f.parse())[0]!;
  const game = {
    gameId: 2009020213,
    shots: group.events.filter((e) => e.kind !== "MISS"),
    shotCoverageByPlayer: {
      [SHOOTER]: {
        expected: 3,
        matched: 2,
        missingGoals: 0,
        expectedOnGoal: 2,
      },
    },
  };
  const ref = {
    playerId: SHOOTER,
    name: "Shooter",
    position: "F" as const,
    games: 1,
    minutes: 20,
    officialOnGoalAttempts: 1,
    reviewedOnGoalClassifications: [group],
  };
  const row = summarizeOfficialOnGoalCoverage([game], [ref]).players[0]!;
  assert.equal(row.effectiveExpectedAttempts, 3);
  assert.equal(row.matchedAttempts, 2);
  assert.equal(row.individualCoverage, 2 / 3);
  const bad = structuredClone(game);
  bad.shotCoverageByPlayer[SHOOTER].expected = 2;
  assert.throws(
    () => summarizeOfficialOnGoalCoverage([bad], [ref]),
    /entire verified/,
  );
});

test("bounded unordered pair never enriches or remaps distinct native geometries under either primary bijection", () => {
  const f = fixture();
  const rosterSpots = [
    ...Array.from({ length: 5 }, (_, i) => ({
      playerId: i === 1 ? 8474705 : i ? 10 + i : 8473526,
      teamId: 21,
      sweaterNumber: i === 1 ? 40 : i ? 10 + i : 88,
      positionCode: "C",
      firstName: { default: "AWAY" },
      lastName: { default: i ? "OTHER" : "MUELLER" },
    })),
    {
      playerId: 30,
      teamId: 21,
      sweaterNumber: 1,
      positionCode: "G",
      lastName: { default: "AWAYG" },
    },
    ...Array.from({ length: 5 }, (_, i) => ({
      playerId: 40 + i,
      teamId: 20,
      sweaterNumber: 40 + i,
      positionCode: "C",
      lastName: { default: "HOME" },
    })),
    {
      playerId: 8462147,
      teamId: 20,
      sweaterNumber: 34,
      positionCode: "G",
      lastName: { default: "KIPRUSOFF" },
    },
  ];
  const raw = {
    ...f.raw,
    id: 2011021166,
    gameDate: "2012-03-30",
    homeTeam: { id: 20, abbrev: "CGY", score: 0 },
    awayTeam: { id: 21, abbrev: "COL", score: 0 },
    rosterSpots,
    plays: [14, 15].map((id, i) => ({
      eventId: id,
      sortOrder: 28 + i * 2,
      typeDescKey: "shot-on-goal",
      periodDescriptor: { number: 1, periodType: "REG" },
      timeInPeriod: "02:06",
      situationCode: "1551",
      details: {
        eventOwnerTeamId: 21,
        shootingPlayerId: 8473526,
        goalieInNetId: 8462147,
        shotType: "backhand",
        xCoord: i ? -80 : -82,
        yCoord: i ? 3 : 8,
        zoneCode: "O",
      },
    })),
  };
  raw.plays.push({
    ...structuredClone(raw.plays[0]!),
    eventId: 16,
    sortOrder: 32,
    timeInPeriod: "03:00",
    details: {
      ...raw.plays[0]!.details,
      shootingPlayerId: 8474705,
      xCoord: -78,
      yCoord: 6,
    },
  });
  const rows: OnGoalOfficialGameRow[] = rosterSpots.map((r) => ({
    gameId: raw.id,
    date: raw.gameDate,
    playerId: r.playerId,
    teamId: r.teamId,
    position: r.positionCode === "G" ? "G" : "F",
    gamesPlayed: 1,
    goals: 0,
    onGoal: r.playerId === 8473526 ? 2 : r.playerId === 8462147 ? 1 : 0,
  }));
  const box = {
    id: raw.id,
    gameDate: raw.gameDate,
    homeTeam: raw.homeTeam,
    awayTeam: raw.awayTeam,
    playerByGameStats: Object.fromEntries(
      [
        ["homeTeam", 20],
        ["awayTeam", 21],
      ].map(([side, team]) => [
        side,
        {
          forwards: rows
            .filter((r) => r.teamId === team && r.position !== "G")
            .map((r) => ({
              playerId: r.playerId,
              sog: r.onGoal,
              goals: 0,
              toi: "01:00",
            })),
          goalies: rows
            .filter((r) => r.teamId === team && r.position === "G")
            .map((r) => ({
              playerId: r.playerId,
              shotsAgainst: r.onGoal,
              goalsAgainst: 0,
              toi: "01:00",
            })),
        },
      ]),
    ),
  };
  const tr = (n: number, distance: number) =>
    `<tr><td>${n}</td><td>1</td><td>EV</td><td>2:0617:54</td><td>SHOT</td><td>COL ONGOAL - #88 MUELLER, Backhand, Off. Zone, ${distance} ft.</td><td>88 C 40 C 12 C 13 C 14 C 1 G</td><td>40 C 41 C 42 C 43 C 44 C 34 G</td></tr>`;
  const nativeBefore = JSON.stringify(raw),
    features = extractShotTrainingRows(
      raw as Parameters<typeof extractShotTrainingRows>[0],
    );
  const outputs = [];
  for (const distances of [
    [11, 10],
    [10, 11],
  ]) {
    const html = `<title>Play By Play</title><table><tr><td>Friday, March 30, 2012</td></tr><tr><td>Game 1166</td></tr>${tr(14, distances[0]!)}${tr(15, distances[1]!)}<tr><td>17</td><td>1</td><td>EV</td><td>3:0017:00</td><td>SHOT</td><td>COL ONGOAL - #40 OTHER, Backhand, Off. Zone, 14 ft.</td><td>88 C 40 C 12 C 13 C 14 C 1 G</td><td>40 C 41 C 42 C 43 C 44 C 34 G</td></tr></table>`;
    const hashes = {
      ...f.hashes,
      pbpSha256: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
      htmlSha256: createHash("sha256").update(html).digest("hex"),
    };
    const proof = parseOfficialOnGoalClassification(
      html,
      raw,
      box,
      rows,
      [8462147, 8474705],
      hashes,
    );
    assert.equal(proof.unorderedPrimaryIdentityGroups.length, 1);
    assert.deepEqual(
      proof.unorderedPrimaryIdentityGroups[0]!.nativeEventIds,
      [14, 15],
    );
    assert.deepEqual(
      proof.groups[0]!.events.filter((e) => [14, 15].includes(e.eventId)).map(
        (e) => [e.eventId, e.nativeGeometry.xCoord, e.nativeGeometry.yCoord],
      ),
      [
        [14, -82, 8],
        [15, -80, 3],
      ],
    );
    assert.equal(
      proof.groups[0]!.events.some((e) => "primaryOrdinal" in e),
      false,
    );
    outputs.push(proof.groups[0]!.events);
    assert.equal(JSON.stringify(raw), nativeBefore);
    assert.deepEqual(
      extractShotTrainingRows(
        raw as Parameters<typeof extractShotTrainingRows>[0],
      ),
      features,
    );
  }
  assert.deepEqual(outputs[0], outputs[1]);
});

test("2008 reviewed scope retains exact selected IDs and unknown labels, without altering goals or source facts", () => {
  const f = fixture(),
    replace = <T>(value: T): T =>
      JSON.parse(JSON.stringify(value).replaceAll(String(SHOOTER), "8470041"));
  const raw = replace(f.raw),
    box = replace(f.box),
    rows = replace(f.rows);
  raw.id = 2008020084;
  box.id = raw.id;
  for (const row of rows) {
    row.gameId = raw.id;
    if (row.playerId === GOALIE) row.onGoal = 2;
  }
  box.playerByGameStats.awayTeam.goalies[0]!.shotsAgainst = 2;
  const html = f.html.replace("Game 0213", "Game 0084"),
    hashes = {
      ...f.hashes,
      pbpSha256: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
      htmlSha256: createHash("sha256").update(html).digest("hex"),
    },
    before = JSON.stringify({ raw, box, rows });
  const proof = parseOfficialOnGoalClassification(
    html,
    raw,
    box,
    rows,
    [8470041],
    hashes,
  );
  assert.equal(proof.groups.length, 1);
  assert.equal(proof.groups[0]!.officialGoals, 1);
  assert.equal(proof.groups[0]!.officialOnGoalAttempts, 1);
  assert.equal(proof.groups[0]!.primaryLabeledOnGoalAttempts, 2);
  assert.deepEqual(
    proof.groups[0]!.events.map((e) => e.kind),
    ["SHOT", "MISS", "GOAL"],
  );
  assert.equal(JSON.stringify({ raw, box, rows }), before);
  assert.throws(
    () =>
      parseOfficialOnGoalClassification(
        html,
        raw,
        box,
        rows,
        [8470041, GOALIE],
        hashes,
      ),
    /scope/,
  );
  const group = reviewedOnGoalClassificationGroups(proof)[0]!;
  assert.doesNotThrow(() => validateReviewedOnGoalClassificationGroup(group));
  assert.throws(() =>
    validateReviewedOnGoalClassificationGroup({ ...group, playerId: 999 }),
  );
  const forwardHtml = html.replaceAll("1 C 3 G", "1 L 3 G");
  const forwardProof = parseOfficialOnGoalClassification(
    forwardHtml,
    raw,
    box,
    rows,
    [8470041],
    {
      ...hashes,
      htmlSha256: createHash("sha256").update(forwardHtml).digest("hex"),
    },
  );
  assert.deepEqual(forwardProof.groups, proof.groups);
  for (const replacement of ["1 D 3 G", "1 G 3 G", "9 C 3 G"]) {
    const badHtml = html.replaceAll("1 C 3 G", replacement);
    assert.throws(() =>
      parseOfficialOnGoalClassification(badHtml, raw, box, rows, [8470041], {
        ...hashes,
        htmlSha256: createHash("sha256").update(badHtml).digest("hex"),
      }),
    );
  }
  const backup = { playerId: 4, starter: false };
  raw.rosterSpots.push({
    playerId: 4,
    teamId: 2,
    sweaterNumber: 4,
    positionCode: "G",
    lastName: { default: "BACKUP" },
  });
  const backupBox = {
    ...box,
    playerByGameStats: {
      ...box.playerByGameStats,
      awayTeam: {
        goalies: [...box.playerByGameStats.awayTeam.goalies, backup],
      },
    },
  };
  const backupHashes = {
    ...hashes,
    pbpSha256: createHash("sha256").update(JSON.stringify(raw)).digest("hex"),
  };
  const backupProof = parseOfficialOnGoalClassification(
    html.replace("Game 0084", "Match/Game 0084"),
    raw,
    backupBox,
    rows,
    [8470041],
    {
      ...backupHashes,
      htmlSha256: createHash("sha256")
        .update(html.replace("Game 0084", "Match/Game 0084"))
        .digest("hex"),
    },
  );
  assert.deepEqual(
    backupProof.unplayedFreshBoxGoalies?.[0]?.originalRecord,
    backup,
  );
  assert.equal(
    "shotsAgainst" in backupProof.unplayedFreshBoxGoalies![0]!.originalRecord,
    false,
  );
  assert.throws(() =>
    parseOfficialOnGoalClassification(
      html.replace("Game 0084", "Match/Game 0085"),
      raw,
      backupBox,
      rows,
      [8470041],
      {
        ...backupHashes,
        htmlSha256: createHash("sha256")
          .update(html.replace("Game 0084", "Match/Game 0085"))
          .digest("hex"),
      },
    ),
  );
  for (const invalid of [
    { ...backup, starter: true },
    { ...backup, toi: "00:01" },
    { ...backup, shotsAgainst: 1 },
  ]) {
    const invalidBox = {
      ...box,
      playerByGameStats: {
        ...box.playerByGameStats,
        awayTeam: {
          goalies: [...box.playerByGameStats.awayTeam.goalies, invalid],
        },
      },
    };
    assert.throws(() =>
      parseOfficialOnGoalClassification(
        html,
        raw,
        invalidBox,
        rows,
        [8470041],
        backupHashes,
      ),
    );
  }
  rows.find((r) => r.playerId === 8470041)!.goals = 0;
  assert.throws(() =>
    parseOfficialOnGoalClassification(html, raw, box, rows, [8470041], hashes),
  );
});
