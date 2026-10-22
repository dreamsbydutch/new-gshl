import assert from "node:assert/strict";
import test from "node:test";
import {
  alignHistoricalPenaltyGroup,
  reviewModelEquivalentPenaltyGroup,
  reviewPartitionedHistoricalPenaltyGroup,
  type HistoricalNativePenaltyIdentity,
  type HistoricalReportPenaltyIdentity,
} from "./historical-penalty-alignment";
import { gameFixture } from "./game-value-fixtures";
import {
  buildGameValueData,
  extractShotTrainingRows,
} from "./game-value-input";
import { valuePenaltyEvents } from "../../runtime/nhl-game-season-value";
const base = {
  period: 3,
  second: 827,
  teamId: 23,
  committedByPlayerId: 8470609,
  typeCode: "MIN",
  duration: 2,
  offence: "roughing",
};
const native: HistoricalNativePenaltyIdentity[] = [
  { ...base, eventId: 11740467, sortOrder: 58 },
  {
    ...base,
    eventId: 11740468,
    sortOrder: 59,
    typeCode: "MAJ",
    duration: 5,
    offence: "fighting",
  },
];
const official: HistoricalReportPenaltyIdentity[] = [
  { ...base, ordinal: 271, offence: "Roughing", servedByPlayerId: 8471664 },
  { ...base, ordinal: 273, typeCode: "MAJ", duration: 5, offence: "Fighting" },
];
test("distinct minor/major identities resolve uniquely without selecting the first same-clock candidate", () => {
  const before = structuredClone({ native, official });
  assert.deepEqual(
    alignHistoricalPenaltyGroup([...native].reverse(), official).matches,
    [
      { ordinal: 271, eventId: 11740467 },
      { ordinal: 273, eventId: 11740468 },
    ],
  );
  assert.deepEqual({ native, official }, before);
});

test("reviewed NHL offence spellings keep type, duration, actors and server constraints", () => {
  for (const [printed, api, typeCode, duration] of [
    ["Face-off violation", "delaying-game-bench-face-off-violation", "BEN", 2],
    ["Delay of game", "delaying-game", "MIN", 2],
    ["Match penalty", "match-penatly-10-minutes", "MAT", 10],
    ["Hi stick - double minor", "high-sticking-double-minor", "MIN", 4],
  ] as const) {
    const n = {
      ...native[0]!,
      offence: api,
      typeCode,
      duration,
      servedByPlayerId: 99,
    };
    const r = {
      ...official[0]!,
      offence: printed,
      typeCode,
      duration,
      servedByPlayerId: 99,
    };
    const before = structuredClone({ n, r });
    assert.deepEqual(alignHistoricalPenaltyGroup([n], [r]).matches, [
      { ordinal: r.ordinal, eventId: n.eventId },
    ]);
    for (const invalid of [
      { ...r, duration: duration + 1 },
      { ...r, typeCode: "UNK" },
      { ...r, servedByPlayerId: 100 },
      { ...r, offence: "Unrecognized unrelated offence" },
    ])
      assert.equal(
        alignHistoricalPenaltyGroup([n], [invalid]).status,
        "unmatched",
      );
    for (const invalid of [
      { ...r, committedByPlayerId: n.committedByPlayerId! + 1 },
      { ...r, teamId: n.teamId + 1 },
      { ...r, second: n.second + 1 },
    ])
      assert.throws(() => alignHistoricalPenaltyGroup([n], [invalid]));
    assert.deepEqual({ n, r }, before);
  }
});
test("distinct same-duration offences resolve but identical duplicate roughing minors remain ambiguous", () => {
  const n = native.map((row, i) => ({
    ...row,
    typeCode: "MIN",
    duration: 2,
    offence: i ? "tripping" : "slashing",
  }));
  const r = official.map((row, i) => ({
    ...row,
    typeCode: "MIN",
    duration: 2,
    offence: i ? "Tripping" : "Slashing",
  }));
  assert.equal(alignHistoricalPenaltyGroup(n, r).status, "unique");
  const identicalNative = n.map((row) => ({ ...row, offence: "roughing" }));
  const identicalOfficial = r.map((row) => ({ ...row, offence: "Roughing" }));
  const ambiguous = alignHistoricalPenaltyGroup(
    identicalNative,
    identicalOfficial,
  );
  assert.equal(ambiguous.status, "ambiguous");
  assert.deepEqual(ambiguous.matches, []);
});
test("missing multiplicity, contradictory known server and unrecognized offence never invent matches", () => {
  assert.equal(
    alignHistoricalPenaltyGroup(native, official.slice(0, 1)).status,
    "unmatched",
  );
  assert.equal(
    alignHistoricalPenaltyGroup(
      [{ ...native[0]!, servedByPlayerId: 1 }],
      [official[0]!],
    ).status,
    "unmatched",
  );
  assert.equal(
    alignHistoricalPenaltyGroup(
      [native[0]!],
      [{ ...official[0]!, offence: "Hooking" }],
    ).status,
    "unmatched",
  );
});
test("mixed clocks, duplicate identities and invalid numeric inputs fail closed", () => {
  for (const changed of [
    [{ ...native[0]!, second: 826 }, native[1]!],
    [native[0]!, { ...native[1]!, sortOrder: 58 }],
    [native[0]!, { ...native[1]!, eventId: 11740467 }],
    [native[0]!, { ...native[1]!, duration: NaN }],
  ])
    assert.throws(() => alignHistoricalPenaltyGroup(changed, official));
});

test("a large multiplicity-deficient group is unmatched without factorial enumeration", () => {
  const n = Array.from({ length: 20 }, (_, index) => ({
    ...base,
    eventId: 100 + index,
    sortOrder: index,
    offence: index === 19 ? "hooking" : "roughing",
  }));
  const r = Array.from({ length: 20 }, (_, index) => ({
    ...base,
    ordinal: 200 + index,
  }));
  assert.equal(alignHistoricalPenaltyGroup(n, r).status, "unmatched");
});

test("model-equivalent duplicate minors preserve every native field and disclose differing report semantics", () => {
  const f = gameFixture(),
    original = {
      ...f.sources.pbp.plays[3]!,
      details: { ...f.sources.pbp.plays[3]!.details, descKey: "roughing" },
    },
    duplicate = { ...structuredClone(original), eventId: 5, sortOrder: 5 },
    originals = [original, duplicate];
  const rows = [4, 5].map((ordinal, index) => ({
    ordinal,
    period: 1,
    second: 30,
    teamId: 1,
    committedByPlayerId: 2,
    typeCode: "MIN",
    duration: 2,
    offence: "Roughing",
    semantics: { strength: index ? "SH" : "EV", servedBy: index ? null : 3 },
  }));
  const before = structuredClone({ originals, rows }),
    accepted = reviewModelEquivalentPenaltyGroup(originals, rows);
  assert.equal(accepted.accepted, true);
  if (!accepted.accepted) throw Error("Fixture must be equivalent");
  assert.equal(accepted.status, "model-equivalent-ambiguous");
  assert.deepEqual(accepted.matches, []);
  assert.equal(accepted.reportSemanticsDiffer, true);
  assert.deepEqual(accepted.nativePayloads, originals);
  const replay = (nativeOrder: typeof originals, reportOrder: typeof rows) => {
    const proof = reviewModelEquivalentPenaltyGroup(nativeOrder, reportOrder);
    if (!proof.accepted) throw Error("Permutation changed equivalence");
    const replacements = proof.nativePayloads.map((p, index) => ({
      ...p,
      eventId: p.eventId,
      sortOrder: proof.ordinalSlots[index]!.reportOrdinal,
    }));
    const pbp = {
      ...f.sources.pbp,
      plays: f.sources.pbp.plays.map(
        (p) => replacements.find((r) => r.eventId === p.eventId) ?? p,
      ),
    };
    const data = buildGameValueData({ ...f.sources, pbp }, f.shots);
    return {
      pbp,
      data,
      penalties: valuePenaltyEvents(data, {}),
      ordinaryFeatures: extractShotTrainingRows(pbp),
    };
  };
  const expected = replay(originals, rows);
  for (const nativeOrder of [originals, [...originals].reverse()])
    for (const reportOrder of [rows, [...rows].reverse()])
      assert.deepEqual(replay(nativeOrder, reportOrder), expected);
  assert.deepEqual({ originals, rows }, before);
  assert.deepEqual(
    expected.data.penalties.map((p) => p.committed),
    [2, 2],
  );
  for (const changed of [
    [
      original,
      { ...duplicate, details: { ...duplicate.details, drawnByPlayerId: 12 } },
    ],
    [original, { ...duplicate, situationCode: "1441" }],
    [original, { ...duplicate, extraSourceField: "different" }],
  ])
    assert.equal(
      reviewModelEquivalentPenaltyGroup(changed, rows).accepted,
      false,
    );
  const separated = reviewModelEquivalentPenaltyGroup(
    [original, { ...duplicate, sortOrder: 6 }],
    [rows[0]!, { ...rows[1]!, ordinal: 6 }],
  );
  assert.equal(separated.accepted, true);
  if (!separated.accepted)
    throw Error("Identical separated payloads must remain equivalent");
  assert.deepEqual(
    separated.ordinalSlots.map((s) => [s.nativeEventId, s.reportOrdinal]),
    [
      [original.eventId, 4],
      [duplicate.eventId, 6],
    ],
  );
  const ambiguousIds = new Set(originals.map((p) => p.eventId));
  const normalizeDiagnosticIds = (value: unknown, key = ""): unknown => {
    if (key === "eventId" && ambiguousIds.has(Number(value)))
      return "ambiguous-penalty";
    if (key === "unpriced" && Array.isArray(value))
      return value.map((id) =>
        ambiguousIds.has(Number(id)) ? "ambiguous-penalty" : id,
      );
    if (Array.isArray(value))
      return value.map((item) => normalizeDiagnosticIds(item));
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([name, item]) => [
          name,
          normalizeDiagnosticIds(item, name),
        ]),
      );
    return value;
  };
  const alternativeBijection = (reverse: boolean) => {
    const replacements = originals.map((p, index) => ({
      ...structuredClone(p),
      sortOrder:
        accepted.ordinalSlots[reverse ? 1 - index : index]!.reportOrdinal,
    }));
    const pbp = {
      ...f.sources.pbp,
      plays: f.sources.pbp.plays.map(
        (p) => replacements.find((r) => r.eventId === p.eventId) ?? p,
      ),
    };
    assert.deepEqual(
      pbp.plays.filter((p) => !ambiguousIds.has(p.eventId)),
      f.sources.pbp.plays.filter((p) => !ambiguousIds.has(p.eventId)),
    );
    const data = buildGameValueData({ ...f.sources, pbp }, f.shots);
    return normalizeDiagnosticIds({
      modelInput: {
        ...pbp,
        plays: [...pbp.plays].sort((a, b) => a.sortOrder - b.sortOrder),
      },
      data,
      penalties: valuePenaltyEvents(data, {}),
      ordinaryFeatures: extractShotTrainingRows(pbp),
    });
  };
  assert.deepEqual(alternativeBijection(true), alternativeBijection(false));
});

test("actual Godard raw payloads stay ambiguous while both ID-to-ordinal bijections have identical native semantics", () => {
  const original = {
      eventId: 11740433,
      periodDescriptor: {
        number: 2,
        periodType: "REG",
        maxRegulationPeriods: 3,
      },
      timeInPeriod: "12:22",
      timeRemaining: "07:38",
      typeCode: 509,
      typeDescKey: "penalty",
      sortOrder: 38,
      details: {
        typeCode: "MIN",
        descKey: "roughing",
        duration: 2,
        committedByPlayerId: 8468252,
        drawnByPlayerId: 8467493,
        eventOwnerTeamId: 5,
      },
    },
    native = [
      original,
      { ...structuredClone(original), eventId: 11740434, sortOrder: 39 },
    ];
  const official = [184, 185].map((ordinal, index) => ({
    ordinal,
    period: 2,
    second: 742,
    teamId: 5,
    committedByPlayerId: 8468252,
    typeCode: "MIN",
    duration: 2,
    offence: "Roughing",
    semantics: {
      strength: index ? "SH" : "EV",
      description: index
        ? "PIT #28 GODARD Roughing(2 min)"
        : "PIT #28 GODARD Roughing(2 min) Served By: #26 FEDOTENKO",
    },
  }));
  const review = reviewModelEquivalentPenaltyGroup(native, official);
  assert.equal(review.accepted, true);
  if (!review.accepted)
    throw Error("Actual identical group should qualify for model equivalence");
  assert.deepEqual(review.matches, []);
  assert.equal(review.reportSemanticsDiffer, true);
  assert.deepEqual(review.nativePayloads, native);
  const semantics = (reverse: boolean) =>
    native
      .map((p, index) => {
        const result = {
          ...structuredClone(p),
          sortOrder:
            review.ordinalSlots[reverse ? 1 - index : index]!.reportOrdinal,
        };
        return result;
      })
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => {
        const { eventId: diagnosticIdentity, ...rest } = p;
        void diagnosticIdentity;
        return rest;
      });
  assert.deepEqual(semantics(false), semantics(true));
});

test("full compatibility components anchor unique majors and identical repeated game misconducts atomically", () => {
  const raw = (
    eventId: number,
    sortOrder: number,
    typeCode: string,
    descKey: string,
    duration: number,
  ) => ({
    eventId,
    sortOrder,
    typeDescKey: "penalty",
    periodDescriptor: { number: 1, periodType: "REG" },
    timeInPeriod: "08:36",
    details: {
      eventOwnerTeamId: 25,
      committedByPlayerId: 99,
      drawnByPlayerId: 88,
      typeCode,
      descKey,
      duration,
    },
  });
  const native = [
    raw(10, 1, "MAJ", "fighting", 5),
    raw(11, 2, "GAM", "game-misconduct", 10),
    raw(12, 3, "GAM", "game-misconduct", 10),
  ];
  const official = native.map((r, i) => ({
    ordinal: [50, 52, 53][i]!,
    period: 1,
    second: 516,
    teamId: 25,
    committedByPlayerId: 99,
    duration: r.details.duration,
    typeCode: r.details.typeCode,
    offence: r.details.descKey,
    semantics: { strength: i ? "SH" : "EV" },
  }));
  const before = structuredClone({ native, official }),
    result = reviewPartitionedHistoricalPenaltyGroup(native, official);
  assert.equal(result.accepted, true);
  if (!result.accepted) throw Error("Fixture must partition");
  assert.equal(result.partitions.length, 2);
  assert.deepEqual(result.matches, []);
  assert.deepEqual(
    result.ordinalSlots.map((s) => [
      s.nativeEventId,
      s.reportOrdinal,
      s.identity,
    ]),
    [
      [10, 50, "unique-primary-identity"],
      [11, 52, "serialization-only-not-primary-event-identity"],
      [12, 53, "serialization-only-not-primary-event-identity"],
    ],
  );
  const reversed = reviewPartitionedHistoricalPenaltyGroup(
    [...native].reverse(),
    [...official].reverse(),
  );
  if (!reversed.accepted)
    throw Error("Permutation must preserve full partition approval");
  assert.deepEqual(
    reversed.ordinalSlots
      .slice()
      .sort((a, b) => a.nativeEventId - b.nativeEventId),
    result.ordinalSlots,
  );
  const altered = structuredClone(native);
  altered[2]!.details.drawnByPlayerId = 77;
  assert.equal(
    reviewPartitionedHistoricalPenaltyGroup(altered, official).accepted,
    false,
  );
  assert.equal(
    reviewPartitionedHistoricalPenaltyGroup(native, official.slice(0, 2))
      .accepted,
    false,
  );
  assert.deepEqual({ native, official }, before);
});
