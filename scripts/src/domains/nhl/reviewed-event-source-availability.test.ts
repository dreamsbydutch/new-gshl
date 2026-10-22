import assert from "node:assert/strict";
import test from "node:test";
import {
  proveReviewedEventSourceAvailability as prove,
  applyReviewedEventSourceAvailability as apply,
  reviewedEventSourcePeriods as periods,
} from "./reviewed-event-source-availability";
const ids = [
  11033976, 11033977, 11033978, 11033979, 11033980, 11033981, 11033982,
];
const shooters = [
  8471498, 8467876, 8459648, 8469598, 8468660, 8470609, 8467881,
];
function fixture(game = 2008020076) {
  const scope =
    game === 2008020076
      ? { gameDate: "2008-10-19", home: 16, away: 23 }
      : game === 2008020259
        ? { gameDate: "2008-11-17", home: 10, away: 6 }
        : game === 2008020409
          ? { gameDate: "2008-12-10", home: 17, away: 20 }
          : { gameDate: "2009-03-21", home: 27, away: 23 };
  const raw = {
    id: game,
    gameDate: scope.gameDate,
    gameType: 2,
    gameState: "OFF",
    homeTeam: { id: scope.home },
    awayTeam: { id: scope.away },
    rosterSpots: [...shooters, 8469658].map((playerId) => ({ playerId })),
    plays: ids.map((eventId, i) => ({
      eventId,
      typeDescKey: "shot-on-goal",
      periodDescriptor: { number: 1, periodType: "REG" },
      timeInPeriod: "00:00",
      details: {
        eventOwnerTeamId: scope.away,
        shootingPlayerId: shooters[i],
        goalieInNetId: 8469658,
      },
    })),
  };
  const rows = [2, 3, 6, 11, 13]
    .map(
      (n) =>
        `<tr><td>${n}</td><td>1</td><td>EV</td><td>0:00</td><td>SHOT</td><td>VAN ONGOAL - TEST</td><td></td><td>CHI</td></tr>`,
    )
    .join("");
  const playReportHtml = `<title>Play By Play</title>${game === 2008020076 ? `<table><tr><td>Sunday, October 19, 2008</td><td>Game 0076</td></tr>${rows}</table>` : ""}`;
  const input = {
    rawPbpText: JSON.stringify(raw),
    playReportHtml,
    gameSummaryHtml:
      "<title>Game Summary</title><table><tr><td>Wrong historical summary</td></tr></table>",
    providerArchive: {
      url: "https://peter-tanner.com/moneypuck/downloads/shots_2008.zip",
      sha256: "a".repeat(64),
    },
  };
  return { raw, input };
}
test("four explicit cases only withhold trust and preserve every native fact", () => {
  for (const game of [2008020076, 2008020259, 2008020409, 2008021077]) {
    const { raw, input } = fixture(game),
      original = structuredClone(raw),
      proof = prove(input),
      result = apply(raw, proof);
    assert.deepEqual(raw, original);
    assert.deepEqual(result.plays, raw.plays);
    assert.deepEqual(result.rosterSpots, raw.rosterSpots);
    assert.deepEqual(
      [...periods(result)],
      game === 2008020076 ? [1] : [1, 2, 3, 4],
    );
    assert.equal(proof.nativeOnGoalAttempts, 7);
    assert.equal(proof.nativeGoals, 0);
    assert.deepEqual(apply(result, proof), result);
    assert.deepEqual([...periods(raw)], []);
  }
});
test("zero-clock identity, team, clock and full primary evidence fail closed", () => {
  for (const mutate of [
    (r: ReturnType<typeof fixture>["raw"]) => {
      r.plays[0]!.eventId = 123;
    },
    (r: ReturnType<typeof fixture>["raw"]) => {
      r.plays[0]!.details.shootingPlayerId = 123;
    },
    (r: ReturnType<typeof fixture>["raw"]) => {
      r.plays[0]!.details.eventOwnerTeamId = 16;
    },
    (r: ReturnType<typeof fixture>["raw"]) => {
      r.plays[0]!.timeInPeriod = "00:01";
    },
  ]) {
    const { raw, input } = fixture();
    mutate(raw);
    assert.throws(() => prove({ ...input, rawPbpText: JSON.stringify(raw) }));
  }
  const { input } = fixture();
  assert.throws(() =>
    prove({
      ...input,
      playReportHtml: input.playReportHtml.replace(
        "VAN ONGOAL - TEST",
        "CHI ONGOAL - TEST",
      ),
    }),
  );
});
test("empty source is scoped, not permission to ignore a nonempty valid report", () => {
  const { raw, input } = fixture(2008020259);
  assert.throws(() =>
    prove({
      ...input,
      playReportHtml:
        input.playReportHtml + "<table><tr><td>1</td></tr></table>",
    }),
  );
  assert.throws(() =>
    prove({ ...input, rawPbpText: JSON.stringify({ ...raw, id: 2008020260 }) }),
  );
  assert.throws(() =>
    prove({
      ...input,
      providerArchive: { ...input.providerArchive, sha256: "invalid" },
    }),
  );
});
test("proof and raw mutation reject; unavailable metadata cannot broaden periods or events", () => {
  const { raw, input } = fixture(),
    proof = prove(input);
  assert.throws(() => apply({ ...raw, gameDate: "2008-10-20" }, proof));
  assert.throws(() => apply(raw, { ...proof, nativeOnGoalAttempts: 8 }));
  const result = apply(raw, proof) as unknown as Record<string, unknown>;
  const metadata = result.reviewedEventSourceAvailability as Record<
    string,
    unknown
  >;
  for (const patch of [
    { unavailablePeriods: [1, 2] },
    { withheldNativeEventIds: [...ids, 123] },
    { proofSha256: "bad" },
    { sourceHashes: {} },
  ]) {
    assert.throws(() =>
      periods({
        ...result,
        reviewedEventSourceAvailability: { ...metadata, ...patch },
      }),
    );
  }
});
test("duplicate, zero and unbounded native populations reject", () => {
  const { raw, input } = fixture();
  for (const plays of [
    [...raw.plays, raw.plays[0]],
    [{ ...raw.plays[0], eventId: 0 }],
    Array.from({ length: 2001 }, (_, i) => ({
      ...raw.plays[0],
      eventId: i + 1,
    })),
  ])
    assert.throws(() =>
      prove({ ...input, rawPbpText: JSON.stringify({ ...raw, plays }) }),
    );
});
