import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGameValueData,
  extractShotTrainingRows,
} from "./game-value-input";
import {
  bridgeHistoricalShotSource,
  parseHistoricalRawShots,
  type HistoricalRawShot,
} from "./historical-shot-source-bridge";
const game = {
  id: 2008020001,
  gameDate: "2008-10-04",
  homeTeam: { id: 14, abbrev: "TBL" },
  awayTeam: { id: 3, abbrev: "NYR" },
  rosterSpots: [
    {
      playerId: 11,
      teamId: 3,
      sweaterNumber: 11,
      positionCode: "C",
      lastName: { default: "Away" },
    },
    {
      playerId: 30,
      teamId: 3,
      sweaterNumber: 30,
      positionCode: "G",
      lastName: { default: "Goalie" },
    },
    {
      playerId: 21,
      teamId: 14,
      sweaterNumber: 21,
      positionCode: "C",
      lastName: { default: "Home" },
    },
    {
      playerId: 40,
      teamId: 14,
      sweaterNumber: 40,
      positionCode: "G",
      lastName: { default: "Keeper" },
    },
  ],
  plays: [
    {
      eventId: 12345,
      sortOrder: 1,
      periodDescriptor: { number: 1, periodType: "REG" },
      timeInPeriod: "01:00",
      typeDescKey: "shot-on-goal",
      details: { eventOwnerTeamId: 3, shootingPlayerId: 11, goalieInNetId: 40 },
    },
  ],
};
const html = `<title>Play By Play</title><table><tr><td>Match/Game 0001</td><td>Saturday, October 4, 2008</td></tr><tr><td>13</td><td>1</td><td>EV</td><td>1:0019:00</td><td>SHOT</td><td>NYR ONGOAL - #11 AWAY, Wrist, Off. Zone, 30 ft.</td><td>11 C 30 G</td><td>21 C 40 G</td></tr><tr><td>14</td><td>1</td><td>EV</td><td>1:0218:58</td><td>MISS</td><td>NYR #11 AWAY, Wrist, Off. Zone, 30 ft.</td><td>11 C 30 G</td><td>21 C 40 G</td></tr></table>`;
const provenance = {
  providerUrl: "https://peter-tanner.com/moneypuck/downloads/shots_2008.zip",
  providerSha256: "a".repeat(64),
  officialPlayReportUrl:
    "https://www.nhl.com/scores/htmlreports/20082009/PL020001.HTM",
  officialPlayReportSha256: "b".repeat(64),
  officialPbpSha256: "c".repeat(64),
};
const shot: HistoricalRawShot = {
  gameId: game.id,
  ordinal: 13,
  period: 1,
  second: 60,
  kind: "SHOT",
  shooter: 11,
  goalie: 40,
  home: false,
  x: 60,
  y: 5,
  homeSkaters: 1,
  awaySkaters: 1,
  homeGoalie: true,
  awayGoalie: true,
  shotType: "wrist",
};
test("archive origin remains unknown while native shot identities and MISS denominators survive", () => {
  const before = structuredClone(game);
  const result = bridgeHistoricalShotSource(
    game,
    [
      { ...shot, x: 0, y: 0 },
      { ...shot, ordinal: 14, second: 62, kind: "MISS", x: 0, y: 0 },
    ],
    html,
    provenance,
  );
  assert.deepEqual(game, before);
  assert.equal(result.pbp.plays.length, 2);
  assert.equal(result.pbp.plays[0]!.eventId, 12345);
  assert(
    result.pbp.plays.every(
      (p) => p.details?.xCoord === undefined && p.details?.yCoord === undefined,
    ),
  );
  assert.equal(extractShotTrainingRows(result.pbp).length, 0);
  assert.equal(
    result.audit.rejected.filter((r) => r.reason.includes("origin")).length,
    2,
  );
});
test("archive origin never overrides independently valid native coordinates", () => {
  const native = {
    ...game,
    plays: [
      {
        ...game.plays[0]!,
        details: { ...game.plays[0]!.details, xCoord: 71, yCoord: -2 },
      },
    ],
  };
  const result = bridgeHistoricalShotSource(
    native,
    [{ ...shot, x: 0, y: 0 }],
    html,
    provenance,
  );
  assert.equal(result.pbp.plays[0]!.details!.xCoord, 71);
  assert.equal(result.pbp.plays[0]!.details!.yCoord, -2);
  assert.equal(extractShotTrainingRows(result.pbp).length, 1);
});
test("complete invalid native geometry is never silently replaced by archive origin", () => {
  const native = {
    ...game,
    plays: [
      {
        ...game.plays[0]!,
        details: { ...game.plays[0]!.details, xCoord: 0, yCoord: 0 },
      },
    ],
  };
  assert.throws(
    () =>
      bridgeHistoricalShotSource(
        native,
        [{ ...shot, x: 0, y: 0 }],
        html,
        provenance,
      ),
    /separate source review/,
  );
  assert.equal(native.plays[0]!.details.xCoord, 0);
});
test("invalid complete native coordinates fail before any enrichment rejection can leak priced rows", () => {
  for (const [xCoord, yCoord] of [
    [0, 0],
    [101, 5],
    [60, 44],
  ]) {
    const native = {
      ...game,
      plays: [
        {
          ...game.plays[0]!,
          situationCode: "1111",
          homeTeamDefendingSide: "left",
          details: { ...game.plays[0]!.details, xCoord, yCoord },
        },
      ],
    };
    // This establishes the actual downstream hazard, including native context.
    assert.equal(extractShotTrainingRows(native).length, 1);
    const before = structuredClone(native);
    for (const rows of [
      [shot],
      [{ ...shot, x: 0, y: 0 }],
      [{ ...shot, goalie: 30 }],
      [],
    ]) {
      assert.throws(
        () => bridgeHistoricalShotSource(native, rows, html, provenance),
        /invalid geometry requires separate source review/,
      );
      assert.deepEqual(native, before);
    }
  }
});
test("partial or nonnumeric native coordinates remain unchanged and cannot yield ordinary rows", () => {
  const cases: Record<string, unknown>[] = [
    { xCoord: 101 },
    { yCoord: 44 },
    { xCoord: 10 },
    { xCoord: "bad", yCoord: 5 },
  ];
  for (const coordinates of cases) {
    const native = {
      ...game,
      plays: [
        {
          ...game.plays[0]!,
          situationCode: "1111",
          homeTeamDefendingSide: "left",
          details: { ...game.plays[0]!.details, ...coordinates },
        },
      ],
    };
    const before = structuredClone(native),
      result = bridgeHistoricalShotSource(native, [shot], html, provenance);
    assert.deepEqual(native, before);
    assert.equal(extractShotTrainingRows(result.pbp).length, 0);
    assert.equal(result.audit.matched.length, 0);
    for (const [key, value] of Object.entries(coordinates))
      assert.deepEqual(result.pbp.plays[0]!.details?.[key], value);
  }
});
test("complete three-source shot type bijection retains every known native field", () => {
  const native = {
    ...game,
    plays: [
      {
        ...game.plays[0]!,
        details: {
          ...game.plays[0]!.details,
          shotType: "backhand",
          xCoord: 60,
          yCoord: 5,
        },
      },
      {
        ...game.plays[0]!,
        eventId: 12346,
        sortOrder: 2,
        details: {
          ...game.plays[0]!.details,
          shotType: "wrist",
          xCoord: 70,
          yCoord: 7,
        },
      },
    ],
  };
  const report = html.replace(
    /<tr><td>14<\/td>.*?<\/tr>/,
    "<tr><td>14</td><td>1</td><td>EV</td><td>1:0019:00</td><td>SHOT</td><td>NYR ONGOAL - #11 AWAY, Backhand, Off. Zone, 30 ft.</td><td>11 C 30 G</td><td>21 C 40 G</td></tr>",
  );
  const before = structuredClone(native);
  const result = bridgeHistoricalShotSource(
    native,
    [shot, { ...shot, ordinal: 14, shotType: "back" }],
    report,
    provenance,
  );
  assert.deepEqual(native, before);
  assert.deepEqual(
    result.pbp.plays.map((p) => p.eventId),
    [12346, 12345],
  );
  for (const p of before.plays)
    for (const [key, value] of Object.entries(p.details))
      assert.deepEqual(
        result.pbp.plays.find((v) => v.eventId === p.eventId)!.details?.[key],
        value,
      );
  assert.equal(result.audit.shotTypeAlignments?.length, 1);
  assert(
    result.audit.matched.every(
      (m) => m.identity === "unique-three-source-shot-type",
    ),
  );
  assert.equal(extractShotTrainingRows(result.pbp).length, 2);
  assert.throws(
    () =>
      bridgeHistoricalShotSource(
        native,
        [shot, { ...shot, ordinal: 14, shotType: "unknown" }],
        report,
        provenance,
      ),
    /uniquely aligned/,
  );
});
test("explicit three-shot equivalence requires the complete reviewed group and unchanged payloads", () => {
  const native = {
    ...game,
    id: 2008020499,
    gameDate: "2008-12-23",
    plays: [11059374, 11059375, 11059376].map((eventId, i) => ({
      ...game.plays[0]!,
      eventId,
      sortOrder: 10 + i,
      periodDescriptor: { number: 2, periodType: "REG" },
      timeInPeriod: "03:45",
      details: { ...game.plays[0]!.details, shotType: "wrist" },
    })),
  };
  const report = `<title>Play By Play</title><table><tr><td>Match/Game 0499</td><td>Tuesday, December 23, 2008</td></tr>${[114, 115, 116].map((o) => `<tr><td>${o}</td><td>2</td><td>EV</td><td>3:4516:15</td><td>SHOT</td><td>NYR ONGOAL - #11 AWAY, Wrist, Off. Zone, 30 ft.</td><td>11 C 30 G</td><td>21 C 40 G</td></tr>`).join("")}</table>`;
  const source = {
    ...provenance,
    officialPlayReportUrl:
      "https://www.nhl.com/scores/htmlreports/20082009/PL020499.HTM",
  };
  const rows = [114, 115, 116].map((ordinal, i) => ({
    ...shot,
    gameId: native.id,
    ordinal,
    period: 2,
    second: 225,
    x: 60 + i,
  }));
  const result = bridgeHistoricalShotSource(native, rows, report, source);
  assert.equal(result.audit.shotIdentityAmbiguities?.length, 1);
  assert.equal(result.pbp.plays.length, 3);
  assert.equal(extractShotTrainingRows(result.pbp).length, 3);
  const changed = structuredClone(native);
  changed.plays[2]!.details = {
    ...changed.plays[2]!.details,
    shotType: "snap",
  };
  assert.throws(
    () => bridgeHistoricalShotSource(changed, rows, report, source),
    /equivalent shot identity/,
  );
  assert.throws(
    () => bridgeHistoricalShotSource(native, rows.slice(0, 2), report, source),
    /equivalent shot identity/,
  );
});
test("raw geometry bridge requires independent official joins and preserves native IDs/inputs", () => {
  const before = JSON.stringify(game),
    result = bridgeHistoricalShotSource(
      game,
      [shot, { ...shot, ordinal: 14, second: 62, kind: "MISS" }],
      html,
      provenance,
    );
  assert.equal(JSON.stringify(game), before);
  assert.equal(result.pbp.plays[0]!.eventId, 12345);
  assert.equal(result.pbp.plays[0]!.details!.xCoord, 60);
  assert.equal(result.pbp.plays[0]!.situationCode, "1111");
  assert.equal(result.audit.restoredMisses, 1);
  assert.equal(result.audit.providerProbabilitiesUsed, false);
  assert.equal(result.pbp.plays[1]!.eventId, 1000000014);
});
test("ambiguous raw candidates, wrong identities/manpower and report scope cannot acquire credit", () => {
  for (const rows of [
    [shot, shot],
    [{ ...shot, goalie: 30 }],
    [{ ...shot, homeSkaters: 2 }],
    [{ ...shot, second: 61 }],
  ]) {
    const result = bridgeHistoricalShotSource(game, rows, html, provenance);
    assert.ok(result.audit.rejected.length > 0);
    assert.equal(
      result.pbp.plays.find((p) => p.eventId === 12345)!.details!.xCoord,
      undefined,
    );
  }
  assert.throws(
    () =>
      bridgeHistoricalShotSource(
        game,
        [shot],
        html.replace("Game 0001", "Game 0002"),
        provenance,
      ),
    /scope/,
  );
  assert.throws(
    () =>
      bridgeHistoricalShotSource(game, [shot], html, {
        ...provenance,
        providerSha256: "invalid",
      }),
    /provenance/,
  );
});
test("native facts are not overwritten by conflicting provider geometry", () => {
  const changed = {
    ...game,
    plays: [
      { ...game.plays[0]!, details: { ...game.plays[0]!.details, xCoord: 10 } },
    ],
  };
  const result = bridgeHistoricalShotSource(changed, [shot], html, provenance);
  assert.equal(
    result.pbp.plays.find((p) => p.eventId === 12345)!.details!.xCoord,
    10,
  );
  assert.ok(result.audit.rejected.length > 0);
});

test("complete valid official geometry has priority after every identity/manpower join", () => {
  const raw = {
    ...game,
    plays: [
      {
        ...game.plays[0]!,
        details: { ...game.plays[0]!.details, xCoord: 59, yCoord: 6 },
      },
    ],
  };
  const before = JSON.stringify(raw);
  const result = bridgeHistoricalShotSource(raw, [shot], html, provenance);
  assert.equal(JSON.stringify(raw), before);
  assert.equal(result.pbp.plays[0]!.details!.xCoord, 59);
  assert.equal(result.pbp.plays[0]!.details!.yCoord, 6);
  assert.equal(result.pbp.plays[0]!.situationCode, "1111");
  assert.deepEqual(result.audit.geometryDisagreements, [
    {
      ordinal: 13,
      eventId: 12345,
      official: { x: 59, y: 6 },
      provider: { x: 60, y: 5 },
      officialReportDistanceFeet: 30,
    },
  ]);
  for (const changed of [
    { ...shot, goalie: 30 },
    { ...shot, second: 61 },
    { ...shot, homeSkaters: 2 },
  ]) {
    const rejected = bridgeHistoricalShotSource(
      raw,
      [changed],
      html,
      provenance,
    );
    assert.equal(rejected.audit.matched.length, 0);
    assert.equal(rejected.pbp.plays[0]!.situationCode, undefined);
  }
  for (const [xCoord, yCoord] of [
    [0, 0],
    [101, 5],
    [60, 44],
    [NaN, 5],
  ]) {
    assert.throws(
      () =>
        bridgeHistoricalShotSource(
          {
            ...raw,
            plays: [
              {
                ...raw.plays[0]!,
                details: { ...raw.plays[0]!.details, xCoord, yCoord },
              },
            ],
          },
          [shot],
          html,
          provenance,
        ),
      /invalid geometry requires separate source review/,
    );
  }
});

test("TEAM bench penalties match a verified server, never an individual offender", () => {
  const penalty = {
    eventId: 999,
    sortOrder: 2,
    periodDescriptor: { number: 1, periodType: "REG" },
    timeInPeriod: "02:00",
    typeDescKey: "penalty",
    details: {
      eventOwnerTeamId: 3,
      typeCode: "BEN",
      duration: 2,
      servedByPlayerId: 11,
    },
  };
  const raw = { ...game, plays: [...game.plays, penalty] };
  const report = html.replace(
    "</table>",
    "<tr><td>15</td><td>1</td><td>EV</td><td>2:0018:00</td><td>PENL</td><td>NYR TEAM Too many men/ice - bench(2 min) Served By: #11 AWAY, Neu. Zone</td><td>11 C 30 G</td><td>21 C 40 G</td></tr></table>",
  );
  const before = JSON.stringify(raw);
  const result = bridgeHistoricalShotSource(raw, [shot], report, provenance);
  assert.equal(JSON.stringify(raw), before);
  const after = result.pbp.plays.find((p) => p.eventId === 999)!;
  assert.equal(after.details!.servedByPlayerId, 11);
  assert.equal(after.details!.committedByPlayerId, undefined);
  assert.equal(after.sortOrder, 15);
  const faceoffReport = report.replace(
    "Too many men/ice - bench(2 min)",
    "Face-off violation(2 min)",
  );
  const faceoffResult = bridgeHistoricalShotSource(
    raw,
    [shot],
    faceoffReport,
    provenance,
  );
  assert.deepEqual(
    faceoffResult.pbp.plays.find((p) => p.eventId === 999)!.details,
    penalty.details,
  );
  for (const invalid of [
    faceoffReport.replace(
      "Face-off violation(2 min)",
      "Face-off violation(4 min)",
    ),
    faceoffReport.replace("Face-off violation", "Face-off obstruction"),
    faceoffReport.replace("#11 AWAY, Neu.", "#21 HOME, Neu."),
    faceoffReport.replace("#11 AWAY, Neu.", "#99 UNKNOWN, Neu."),
  ])
    assert.throws(
      () => bridgeHistoricalShotSource(raw, [shot], invalid, provenance),
      /uniquely aligned/,
    );
  for (const changed of [
    {
      ...raw,
      plays: [
        ...game.plays,
        { ...penalty, details: { ...penalty.details, servedByPlayerId: 21 } },
      ],
    },
    {
      ...raw,
      plays: [
        ...game.plays,
        { ...penalty, details: { ...penalty.details, typeCode: "MIN" } },
      ],
    },
    {
      ...raw,
      plays: [
        ...game.plays,
        {
          ...penalty,
          details: { ...penalty.details, committedByPlayerId: 11 },
        },
      ],
    },
    { ...raw, plays: [...raw.plays, { ...penalty, eventId: 998 }] },
  ]) {
    assert.throws(
      () => bridgeHistoricalShotSource(changed, [shot], report, provenance),
      /uniquely aligned/,
    );
    assert.throws(
      () =>
        bridgeHistoricalShotSource(changed, [shot], faceoffReport, provenance),
      /uniquely aligned/,
    );
  }
  assert.throws(
    () =>
      bridgeHistoricalShotSource(
        raw,
        [shot],
        report.replace("#11 AWAY, Neu.", "#99 UNKNOWN, Neu."),
        provenance,
      ),
    /uniquely aligned/,
  );
});
test("archive parser ignores provider probabilities and explicitly records malformed rows", () => {
  const columns =
    "season,game_id,id,period,time,event,shooterPlayerId,goalieIdForShot,isHomeTeam,xCord,yCord,homeSkatersOnIce,awaySkatersOnIce,homeEmptyNet,awayEmptyNet,shotType,xGoal";
  const good =
    "2008,20001,13,1,60,SHOT,11,40,0,60,5,1,1,0,0,WRIST,not-a-probability";
  const parsed = parseHistoricalRawShots(
    columns +
      "\n" +
      good +
      "\n" +
      good.replace(",1,1,0,0,WRIST", ",7,1,0,0,WRIST"),
    20082009,
  );
  assert.equal(parsed.games.get(game.id)!.length, 1);
  assert.equal(parsed.rejected.length, 1);
  assert.equal(Object.hasOwn(parsed.games.get(game.id)![0]!, "xGoal"), false);
});
test("shootout native records do not require nonexistent regular-play report joins", () => {
  const raw = {
    ...game,
    plays: [
      ...game.plays,
      {
        ...game.plays[0]!,
        eventId: 999,
        periodDescriptor: { number: 4, periodType: "SO" },
      },
    ],
  };
  assert.equal(
    bridgeHistoricalShotSource(raw, [shot], html, provenance).pbp.plays.some(
      (p) => p.eventId === 999,
    ),
    true,
  );
});

test("unrecoverable official MISS remains in the denominator without invented geometry", () => {
  const result = bridgeHistoricalShotSource(game, [shot], html, provenance);
  const miss = result.pbp.plays.find((p) => p.typeDescKey === "missed-shot")!;
  assert.ok(miss);
  assert.equal(miss.details!.xCoord, undefined);
  assert.equal(
    result.audit.rejected.some((r) => r.ordinal === 14),
    true,
  );
});
test("report lineup inconsistency is disclosed without changing its membership", () => {
  const raw = {
    ...game,
    rosterSpots: [
      ...game.rosterSpots,
      {
        playerId: 12,
        teamId: 3,
        sweaterNumber: 12,
        positionCode: "C",
        lastName: { default: "Other" },
      },
    ],
  };
  const result = bridgeHistoricalShotSource(
    raw,
    [shot],
    html.replaceAll("11 C 30 G", "12 C 30 G"),
    provenance,
  );
  assert.equal(result.audit.reportLineupWarnings.length, 2);
  assert.equal(result.pbp.plays[0]!.details!.shootingPlayerId, 11);
  assert.equal(
    Object.hasOwn(result.pbp.plays[0]!.details!, "homePlayers"),
    false,
  );
});

function penaltyFixture(identical = false) {
  const first = {
    eventId: 200,
    sortOrder: 2,
    periodDescriptor: { number: 1, periodType: "REG" },
    timeInPeriod: "02:00",
    typeDescKey: "penalty",
    details: {
      eventOwnerTeamId: 3,
      committedByPlayerId: 11,
      drawnByPlayerId: 21,
      duration: 2,
      typeCode: "MIN",
      descKey: "roughing",
    },
  };
  const second = {
    ...structuredClone(first),
    eventId: 201,
    sortOrder: 3,
    details: { ...first.details, descKey: identical ? "roughing" : "hooking" },
  };
  const penaltyRow = (ordinal: number, offence: string, extra = "") =>
    "<tr><td>" +
    ordinal +
    "</td><td>1</td><td>EV</td><td>2:0018:00</td><td>PENL</td><td>NYR #11 AWAY " +
    offence +
    "(2 min)" +
    extra +
    ", Def. Zone Drawn By: TBL #21 HOME</td><td>11 C 30 G</td><td>21 C 40 G</td></tr>";
  return {
    raw: {
      ...structuredClone(game),
      plays: [...structuredClone(game.plays), first, second],
    },
    html: html.replace(
      "</table>",
      penaltyRow(15, "Roughing", identical ? " Served By: #11 AWAY" : "") +
        penaltyRow(16, identical ? "Roughing" : "Hooking") +
        "</table>",
    ),
  };
}
test("same-clock penalties require full-group unique offence matching, never array order", () => {
  const fixture = penaltyFixture();
  const source = structuredClone(fixture.raw);
  fixture.raw.plays.reverse();
  const result = bridgeHistoricalShotSource(
    fixture.raw,
    [shot],
    fixture.html,
    provenance,
  );
  assert.deepEqual(
    result.pbp.plays
      .filter((p) => p.typeDescKey === "penalty")
      .map((p) => [p.eventId, p.sortOrder, p.details]),
    [
      [200, 15, source.plays[1]!.details],
      [201, 16, source.plays[2]!.details],
    ],
  );
  assert.equal(result.audit.penaltyAlignments?.length, 1);
  assert.deepEqual(fixture.raw.plays, [...source.plays].reverse());
  assert.throws(
    () =>
      bridgeHistoricalShotSource(
        fixture.raw,
        [shot],
        fixture.html.replace("Hooking(2 min)", "Tripping(2 min)"),
        provenance,
      ),
    /Sparse native|Reviewed equivalent shot identity/,
  );
});
test("identical repeated penalties retain all native facts and disclose unresolved identity", () => {
  const fixture = penaltyFixture(true),
    before = structuredClone(fixture.raw);
  const result = bridgeHistoricalShotSource(
    fixture.raw,
    [shot],
    fixture.html,
    provenance,
  );
  const native = before.plays.filter((p) => p.typeDescKey === "penalty"),
    recovered = result.pbp.plays.filter((p) => p.typeDescKey === "penalty");
  for (let i = 0; i < native.length; i++) {
    assert.deepEqual(
      { ...recovered[i], sortOrder: native[i]!.sortOrder },
      native[i],
    );
    assert.equal(
      Object.hasOwn(recovered[i]!.details!, "servedByPlayerId"),
      false,
    );
  }
  const audit: any = result.audit.penaltyAlignments?.[0];
  assert.equal(audit.status, "model-equivalent-ambiguous");
  assert.deepEqual(audit.matches, []);
  assert.equal(audit.reportSemanticsDiffer, true);
  assert.deepEqual(fixture.raw, before);
  for (const mutate of [
    (raw: any) => {
      raw.plays[2].details.drawnByPlayerId = 30;
    },
    (raw: any) => {
      raw.plays[2].details.duration = 4;
    },
  ]) {
    const bad = structuredClone(fixture.raw);
    mutate(bad);
    assert.throws(() =>
      bridgeHistoricalShotSource(bad, [shot], fixture.html, provenance),
    );
  }
  assert.throws(
    () =>
      bridgeHistoricalShotSource(
        fixture.raw,
        [shot],
        fixture.html.replace("Served By: #11 AWAY", "Served By: #21 HOME"),
        provenance,
      ),
    /Sparse native|Reviewed equivalent shot identity/,
  );
});
test("reviewed shot IDs allow only fully identical payloads, preserving explicit identity uncertainty", () => {
  const base = structuredClone(game),
    first = { ...base.plays[0]!, eventId: 11031786, sortOrder: 1 },
    second = {
      ...structuredClone(base.plays[0]!),
      eventId: 11031787,
      sortOrder: 2,
    };
  const raw = {
    ...base,
    id: 2008020038,
    gameDate: "2008-10-13",
    plays: [first, second],
  };
  const shotHtml = html
    .replace("Match/Game 0001", "Match/Game 0038")
    .replace("Saturday, October 4, 2008", "Monday, October 13, 2008")
    .replace("<td>13</td>", "<td>49</td>")
    .replace("<td>14</td>", "<td>51</td>")
    .replace("<td>1:0218:58</td>", "<td>1:0019:00</td>")
    .replace("<td>MISS</td>", "<td>SHOT</td>");
  const proof = {
    ...provenance,
    officialPlayReportUrl: provenance.officialPlayReportUrl.replace(
      "020001",
      "020038",
    ),
  };
  const rows = [
    { ...shot, gameId: raw.id, ordinal: 49 },
    { ...shot, gameId: raw.id, ordinal: 51, x: 65 },
  ];
  const before = structuredClone(raw),
    result = bridgeHistoricalShotSource(raw, rows, shotHtml, proof);
  assert.equal(result.audit.shotIdentityAmbiguities?.length, 1);
  assert.equal(result.audit.matched.length, 2);
  assert.ok(
    result.audit.matched.every(
      (m) => m.identity === "model-equivalent-ambiguous-serialization-only",
    ),
  );
  assert.deepEqual(raw, before);
  assert.deepEqual(
    result.pbp.plays.map((p) => [p.eventId, p.sortOrder, p.details!.xCoord]),
    [
      [11031786, 49, shot.x],
      [11031787, 51, 65],
    ],
  );
  const changed = structuredClone(raw);
  changed.plays[1]!.details.goalieInNetId = 30;
  assert.throws(
    () => bridgeHistoricalShotSource(changed, rows, shotHtml, proof),
    /Sparse native|Reviewed equivalent shot identity/,
  );
  const unsupported = bridgeHistoricalShotSource(
    raw,
    rows.slice(0, 1),
    shotHtml,
    proof,
  );
  assert.equal(unsupported.audit.rejected.length, 1);
  assert.equal(
    unsupported.pbp.plays.find((p) => p.sortOrder === 51)?.details?.xCoord,
    undefined,
  );
  const thirdPrimaryShot = shotHtml.replace(
    "</table>",
    "<tr><td>52</td><td>1</td><td>EV</td><td>1:0019:00</td><td>SHOT</td><td>NYR ONGOAL - #11 AWAY, Wrist, Off. Zone, 30 ft.</td><td>11 C 30 G</td><td>21 C 40 G</td></tr></table>",
  );
  assert.throws(
    () => bridgeHistoricalShotSource(raw, rows, thirdPrimaryShot, proof),
    /Sparse native|Reviewed equivalent shot identity/,
  );
});

test("regular-season shootout report events never become ordinary shots or context", () => {
  const nativeShootout = ["shot-on-goal", "missed-shot", "goal"].map(
    (kind, index) => ({
      ...structuredClone(game.plays[0]!),
      eventId: 500 + index,
      sortOrder: 20 + index,
      periodDescriptor: { number: 5, periodType: "SO" },
      timeInPeriod: "00:00",
      typeDescKey: kind,
    }),
  );
  const raw = {
    ...structuredClone(game),
    plays: [...structuredClone(game.plays), ...nativeShootout],
  };
  const shootoutRows = ["SHOT", "MISS", "GOAL", "STOP", "GEND"]
    .map(
      (kind, index) =>
        `<tr><td>${30 + index}</td><td>5</td><td>EV</td><td>0:000:00</td><td>${kind}</td><td>NYR ONGOAL - #11 AWAY, Wrist, Off. Zone, 30 ft.</td><td>30 G</td><td>40 G</td></tr>`,
    )
    .join("");
  const result = bridgeHistoricalShotSource(
    raw,
    [shot, { ...shot, ordinal: 30, period: 5, second: 0 }],
    html.replace("</table>", shootoutRows + "</table>"),
    provenance,
  );
  assert.equal(result.audit.version, "nhl-historical-raw-shot-bridge-v2");
  assert.equal(result.audit.ignoredShootoutReportEvents?.length, 5);
  assert.equal(result.audit.matched.length, 1);
  assert.deepEqual(
    result.pbp.plays.filter((p) => p.periodDescriptor.number === 5),
    nativeShootout,
  );
  assert.equal(extractShotTrainingRows(result.pbp).length, 1);
  const squad = { forwards: [], defense: [], goalies: [] };
  const physical = buildGameValueData(
    {
      pbp: result.pbp,
      box: {
        id: game.id,
        gameDate: game.gameDate,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        playerByGameStats: { homeTeam: squad, awayTeam: squad },
      },
      shifts: [],
    },
    [],
  );
  assert.equal(physical.officialShots, 2); // One regular SHOT plus its independent MISS.
  assert.equal(physical.homeGoals + physical.awayGoals, 0);
  assert.deepEqual(raw.plays.slice(-3), nativeShootout);
  const parsed = parseHistoricalRawShots(
    "season,game_id,id,period,time,event,shooterPlayerId,goalieIdForShot,isHomeTeam,xCord,yCord,homeSkatersOnIce,awaySkatersOnIce,homeEmptyNet,awayEmptyNet,shotType\n2008,20001,30,5,4800,SHOT,11,40,0,60,5,1,1,0,0,WRIST",
    20082009,
  );
  assert.equal(parsed.games.size, 0);
  assert.equal(
    parsed.rejected[0]?.reason,
    "Intentional regular-season shootout exclusion",
  );
});

test("served-by text stops at Drawn By and exact goalie committers remain distinct from servers", () => {
  const f = penaltyFixture(),
    withoutComma = f.html.replace(
      "Roughing(2 min), Def. Zone",
      "Roughing(2 min) Served By: #11 AWAY Drawn By: TBL #21 HOME, Def. Zone",
    );
  assert.equal(
    bridgeHistoricalShotSource(f.raw, [shot], withoutComma, provenance).audit
      .penaltyAlignments?.length,
    1,
  );
  const penalty = {
    eventId: 900,
    sortOrder: 2,
    periodDescriptor: { number: 1, periodType: "REG" },
    timeInPeriod: "02:00",
    typeDescKey: "penalty",
    details: {
      eventOwnerTeamId: 14,
      committedByPlayerId: 40,
      typeCode: "MIN",
      duration: 2,
      descKey: "goalie-leave-crease",
    },
  };
  const raw = {
      ...structuredClone(game),
      plays: [...structuredClone(game.plays), penalty],
    },
    report = html.replace(
      "</table>",
      "<tr><td>15</td><td>1</td><td>EV</td><td>2:0018:00</td><td>PENL</td><td>TBL #40 KEEPER Goalie leave crease(2 min)</td><td>11 C 30 G</td><td>21 C 40 G</td></tr></table>",
    );
  assert.deepEqual(
    bridgeHistoricalShotSource(raw, [shot], report, provenance).pbp.plays.find(
      (p) => p.eventId === 900,
    )?.details,
    penalty.details,
  );
  assert.throws(
    () =>
      bridgeHistoricalShotSource(
        raw,
        [shot],
        report.replace("#40 KEEPER", "#40 WRONG"),
        provenance,
      ),
    /Sparse native|Reviewed equivalent shot identity/,
  );
  assert.throws(
    () =>
      bridgeHistoricalShotSource(
        f.raw,
        [shot],
        withoutComma.replace("Served By: #11 AWAY", "Served By: #30 GOALIE"),
        provenance,
      ),
    /Sparse native|Reviewed equivalent shot identity/,
  );
});
test("only explicit evidenced offence labels map to their native penalty identities", () => {
  for (const spec of [
    {
      label: "Instigator - Misconduct",
      key: "instigator-misconduct",
      code: "MIS",
      duration: 10,
    },
    { label: "Aggressor", key: "aggressor", code: "GAM", duration: 10 },
    {
      label: "Match penalty",
      key: "match-penatly-10-minutes",
      code: "MAT",
      duration: 10,
    },
    {
      label: "Interference on goalkeeper",
      key: "interference-goalkeeper",
      code: "MIN",
      duration: 2,
    },
  ]) {
    const f = penaltyFixture();
    f.raw.plays[2]!.details = {
      ...f.raw.plays[2]!.details,
      descKey: spec.key,
      typeCode: spec.code,
      duration: spec.duration,
    };
    const report = f.html.replace(
      "Hooking(2 min)",
      spec.label + "(" + spec.duration + " min)",
    );
    assert.equal(
      bridgeHistoricalShotSource(f.raw, [shot], report, provenance).audit
        .penaltyAlignments?.length,
      1,
    );
    assert.throws(
      () =>
        bridgeHistoricalShotSource(
          f.raw,
          [shot],
          report.replace(spec.label, "Unknown undocumented label"),
          provenance,
        ),
      /Sparse native|Reviewed equivalent shot identity/,
    );
    if (spec.code === "MAT") {
      assert.throws(
        () =>
          bridgeHistoricalShotSource(
            f.raw,
            [shot],
            report.replace("Match penalty(10 min)", "Match penalty(2 min)"),
            provenance,
          ),
        /Sparse native/,
      );
      const wrongType = structuredClone(f.raw);
      wrongType.plays[2]!.details = {
        ...wrongType.plays[2]!.details,
        typeCode: "GAM",
      };
      assert.throws(
        () => bridgeHistoricalShotSource(wrongType, [shot], report, provenance),
        /Sparse native/,
      );
    }
  }
});

test("reviewed0076 exact seven corrupt-clock SOGs remain original and unpriced", async () => {
  const {
    proveReviewedEventSourceAvailability: prove,
    applyReviewedEventSourceAvailability: apply,
  } = await import("./reviewed-event-source-availability");
  const ids = [
      11033976, 11033977, 11033978, 11033979, 11033980, 11033981, 11033982,
    ],
    shooters = [8471498, 8467876, 8459648, 8469598, 8468660, 8470609, 8467881],
    ordinals = [24, 26, 2, 3, 6, 11, 13];
  const raw = {
    id: 2008020076,
    gameDate: "2008-10-19",
    gameType: 2,
    gameState: "OFF",
    homeTeam: { id: 16, abbrev: "CHI" },
    awayTeam: { id: 23, abbrev: "VAN" },
    rosterSpots: shooters
      .map((playerId, i) => ({
        playerId,
        teamId: 23,
        sweaterNumber: i + 1,
        positionCode: "C",
        lastName: { default: `Player${i}` },
      }))
      .concat([
        {
          playerId: 8469658,
          teamId: 16,
          sweaterNumber: 30,
          positionCode: "G",
          lastName: { default: "Keeper" },
        },
      ]),
    plays: ids.map((eventId, i) => ({
      eventId,
      sortOrder: i + 1,
      periodDescriptor: { number: 1, periodType: "REG" },
      timeInPeriod: "00:00",
      typeDescKey: "shot-on-goal",
      details: {
        eventOwnerTeamId: 23,
        shootingPlayerId: shooters[i],
        goalieInNetId: 8469658,
      },
    })),
  };
  const html = `<title>Play By Play</title><table><tr><td>Sunday, October 19, 2008</td><td>Game 0076</td></tr>${ordinals
    .map(
      (n, i) =>
        `<tr><td>${n}</td><td>1</td><td>EV</td><td>${i >= 2 ? "0:00" : i === 0 ? "0:25" : "0:57"}</td><td>SHOT</td><td>VAN ONGOAL - #${i + 1} PLAYER${i}, Wrist</td><td></td><td></td></tr>`,
    )
    .sort(
      (a, b) =>
        Number(a.match(/<td>([0-9]+)/)![1]) -
        Number(b.match(/<td>([0-9]+)/)![1]),
    )
    .join("")}</table>`;
  const proof = prove({
      rawPbpText: JSON.stringify(raw),
      playReportHtml: html,
      gameSummaryHtml: "<title>Game Summary</title>",
      providerArchive: {
        url: provenance.providerUrl,
        sha256: provenance.providerSha256,
      },
    }),
    marked = apply(raw, proof),
    p = {
      ...provenance,
      officialPlayReportUrl: provenance.officialPlayReportUrl.replace(
        "0001",
        "0076",
      ),
    };
  const result = bridgeHistoricalShotSource(marked, [], html, p);
  assert.deepEqual(result.pbp.plays, raw.plays);
  assert.deepEqual(marked.plays, raw.plays);
  assert.equal(result.audit.matched.length, 0);
  assert.equal(result.audit.restoredOfficialContextEvents, 0);
  assert.deepEqual(
    result.audit.reviewedUntrustedClockEvents?.nativeEventIds,
    ids,
  );
  assert.throws(() => bridgeHistoricalShotSource(raw, [], html, p));
  assert.throws(() =>
    bridgeHistoricalShotSource(
      marked,
      [],
      html.replace("#7 PLAYER6", "#6 PLAYER5"),
      p,
    ),
  );
});

test("documented Grossman surname joins only exact NHL identity, first name and unique team/jersey", () => {
  const g: any = structuredClone(game);
  Object.assign(g.rosterSpots[0], {
    playerId: 8471269,
    firstName: { default: "Nicklas" },
    lastName: { default: "Grossmann" },
  });
  g.plays[0].details.shootingPlayerId = 8471269;
  const row = { ...shot, shooter: 8471269 },
    report = html.replaceAll("AWAY", "GROSSMAN"),
    before = JSON.stringify(g);
  const good = bridgeHistoricalShotSource(g, [row], report, provenance);
  assert.equal(good.audit.matched.length, 1);
  assert.equal(JSON.stringify(g), before);
  assert.equal(good.pbp.rosterSpots[0].lastName.default, "Grossmann");
  for (const mutate of [
    (x: any) => {
      x.rosterSpots[0].playerId = 999;
      x.plays[0].details.shootingPlayerId = 999;
    },
    (x: any) => {
      x.rosterSpots[0].firstName.default = "Other";
    },
    (x: any) => {
      x.rosterSpots[0].teamId = 14;
    },
    (x: any) => {
      x.rosterSpots.push({ ...x.rosterSpots[0], playerId: 999 });
    },
  ]) {
    const bad = structuredClone(g);
    mutate(bad);
    const r = bridgeHistoricalShotSource(
      bad,
      [{ ...row, shooter: bad.plays[0].details.shootingPlayerId }],
      report,
      provenance,
    );
    assert.equal(r.audit.matched.length, 0);
  }
});
