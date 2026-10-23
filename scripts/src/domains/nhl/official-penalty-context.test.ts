import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { load } from "cheerio";
import { buildGameValueData } from "./game-value-input";
import {
  recoverOfficialPenaltyContexts,
  recoverReviewedOvertimeClock,
  isReviewedOvertimeClockGame,
} from "./official-penalty-context";

const fixture = () =>
  JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/reviewed-2008-penalty-context.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  );
const overtimeFixture = () =>
  JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/reviewed-2008-overtime-clock.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  );

test("five exact completed shootouts certify elapsed overtime without extending goalie participation", () => {
  const cases = overtimeFixture().cases;
  assert.equal(cases.length, 5);
  const overtimeSeconds = [290, 274, 300, 300, 268];
  for (const [index, c] of cases.entries()) {
    const before = JSON.stringify(c);
    const result = recoverReviewedOvertimeClock(c.input, c.reports);
    assert.equal(JSON.stringify(c), before);
    assert.equal(isReviewedOvertimeClockGame(c.input.pbp.id), true);
    assert.deepEqual(result.officialPeriodEnds, [{ period: 4, seconds: 300 }]);
    assert.equal(result.audit.unclockedControlRows.length, 1);
    assert(!("second" in result.audit.unclockedControlRows[0]!));
    const playingOvertime = result.audit.goalieParticipation.filter(
      (p) => p.overtimeSeconds > 0,
    );
    assert.equal(playingOvertime.length, 2);
    assert(
      playingOvertime.every(
        (p) => p.overtimeSeconds === overtimeSeconds[index],
      ),
    );
    assert(
      result.audit.goalieParticipation.every(
        (p) => p.reportMinusBoxSeconds === (index === 0 ? -10 : 0),
      ),
    );
    const game = buildGameValueData(
      { ...c.input, officialPeriodEnds: result.officialPeriodEnds },
      [],
    );
    assert.equal(game.gameSeconds, 3900);
    assert.deepEqual(recoverReviewedOvertimeClock(c.input, c.reports), result);
  }
  assert.equal(isReviewedOvertimeClockGame(2008020009), false);
  assert.equal(isReviewedOvertimeClockGame(2009020012), false);
});

test("elapsed overtime proof rejects changed source bytes, box facts, foreign shifts and conflicting clock", () => {
  const original = overtimeFixture().cases[0];
  const mutations = [
    (c: typeof original) => {
      c.reports.rawPbpJson += " ";
    },
    (c: typeof original) => {
      c.reports.playReportHtml += " ";
    },
    (c: typeof original) => {
      c.reports.homeShiftReportHtml += " ";
    },
    (c: typeof original) => {
      c.reports.awayShiftReportHtml += " ";
    },
    (c: typeof original) => {
      c.input.box.playerByGameStats.homeTeam.goalies[0].toi = "65:00";
    },
    (c: typeof original) => {
      c.input.shifts[0].gameId++;
    },
    (c: typeof original) => {
      c.input.pbp.id = 2008020009;
    },
    (c: typeof original) => {
      c.input.officialPeriodEnds = [{ period: 4, seconds: 299 }];
    },
    (c: typeof original) => {
      c.input.officialPeriodEnds = [
        { period: 4, seconds: 300 },
        { period: 4, seconds: 300 },
      ];
    },
  ];
  for (const mutate of mutations) {
    const c = structuredClone(original);
    mutate(c);
    assert.throws(() => recoverReviewedOvertimeClock(c.input, c.reports));
  }
  const identical = structuredClone(original);
  identical.input.officialPeriodEnds = [{ period: 4, seconds: 300 }];
  assert.deepEqual(
    recoverReviewedOvertimeClock(identical.input, identical.reports)
      .officialPeriodEnds,
    [{ period: 4, seconds: 300 }],
  );
});

test("elapsed overtime cannot certify altered completed outcome, shootout facts or an overtime winning goal", () => {
  const original = overtimeFixture().cases[0];
  const mutations = [
    (c: typeof original) => {
      c.input.pbp.gameOutcome.lastPeriodType = "OT";
    },
    (c: typeof original) => {
      c.input.pbp.periodDescriptor.number = 4;
    },
    (c: typeof original) => {
      c.input.pbp.gameState = "LIVE";
    },
    (c: typeof original) => {
      c.input.pbp.rosterSpots[0].teamId++;
    },
    (c: typeof original) => {
      c.input.pbp.plays.find(
        (p: { periodDescriptor: { number: number } }) =>
          p.periodDescriptor.number === 5,
      ).eventId++;
    },
    (c: typeof original) => {
      c.input.pbp.plays.find(
        (p: { periodDescriptor: { number: number } }) =>
          p.periodDescriptor.number === 4,
      ).typeDescKey = "goal";
    },
    (c: typeof original) => {
      c.input.pbp.plays.find(
        (p: { periodDescriptor: { number: number } }) =>
          p.periodDescriptor.number === 4,
      ).timeInPeriod = "05:01";
    },
  ];
  for (const mutate of mutations) {
    const c = structuredClone(original);
    mutate(c);
    assert.throws(() => recoverReviewedOvertimeClock(c.input, c.reports));
  }
});
function real() {
  const sources = fixture();
  return { sources, game: buildGameValueData(sources, []) };
}
test("real official0009 context recovery changes only missing ledger strengths", () => {
  const { sources, game } = real(),
    input = { ...sources, game };
  const before = JSON.stringify(input);
  const result = recoverOfficialPenaltyContexts(input, sources.html);
  assert.equal(result.audit.changes.length, 13);
  assert.equal(result.penalties.length, game.penalties.length);
  assert.equal(JSON.stringify(input), before);
  for (const [index, penalty] of result.penalties.entries()) {
    const { homeBefore, awayBefore, ...facts } = penalty;
    const {
      homeBefore: originalHome,
      awayBefore: originalAway,
      ...original
    } = game.penalties[index]!;
    assert.equal(originalHome, null);
    assert.equal(originalAway, null);
    assert.deepEqual(facts, original);
    assert(homeBefore! >= 3 && homeBefore! <= 5);
    assert(awayBefore! >= 3 && awayBefore! <= 5);
  }
  assert.deepEqual(recoverOfficialPenaltyContexts(input, sources.html), result);
});
test("samewhistle serial sanctions retain actual primary sequence rather than sharing later context", () => {
  const { sources, game } = real();
  const result = recoverOfficialPenaltyContexts(
    { ...sources, game },
    sources.html,
  );
  const group = result.audit.groups.find(
    (group) => group.period === 2 && group.second === 1067,
  )!;
  assert.equal(group.status, "recovered");
  assert.deepEqual(
    group.primaryRows.map((row) => row.code),
    ["1551", "1451"],
  );
  assert.deepEqual(
    group.primaryRows.map((row) => row.eventId),
    [11740488, 11740487],
  );
  assert.deepEqual(
    result.penalties
      .filter((p) => [11740488, 11740487].includes(p.eventId))
      .map((p) => [p.eventId, p.homeBefore, p.awayBefore]),
    [
      [11740488, 5, 5],
      [11740487, 5, 4],
    ],
  );
});
test("delayed goalie pull is normalized without copying goalie or player identities", () => {
  const { sources, game } = real();
  const result = recoverOfficialPenaltyContexts(
    { ...sources, game },
    sources.html,
  );
  const group = result.audit.groups.find(
    (group) => group.period === 1 && group.second === 683,
  )!;
  assert.equal(group.status, "recovered");
  assert.equal(group.primaryRows[0]!.code, "1551");
  assert.equal(group.witness!.home.goalies, 0);
  assert.equal(group.witness!.home.skaters, 6);
  assert.equal(group.witness!.primaryHome.goalies, 1);
  assert.equal(
    group.witness!.home.normalized,
    group.witness!.primaryHome.normalized,
  );
  assert.equal(group.witness!.exactPlayerMembership, false);
  assert.deepEqual(
    result.penalties.find((p) => p.eventId === 11740482),
    {
      ...game.penalties.find((p) => p.eventId === 11740482)!,
      homeBefore: 5,
      awayBefore: 5,
    },
  );
});
test("known native context remains authoritative and exact", () => {
  const { sources, game } = real();
  const event = sources.pbp.plays.find(
    (p: { eventId: number }) => p.eventId === 11740480,
  );
  event.situationCode = "1551";
  const penalty = game.penalties.find((p) => p.eventId === event.eventId)!;
  penalty.homeBefore = 5;
  penalty.awayBefore = 5;
  const result = recoverOfficialPenaltyContexts(
    { ...sources, game },
    sources.html,
  );
  assert.deepEqual(
    result.penalties.find((p) => p.eventId === event.eventId),
    penalty,
  );
  assert(!result.audit.changes.some((row) => row.eventId === event.eventId));
});
test("crossseason, wrong primary game and wrong box are rejected", () => {
  const { sources, game } = real();
  assert.throws(
    () =>
      recoverOfficialPenaltyContexts(
        { ...sources, game: { ...game, gameId: 2009020009 } },
        sources.html,
      ),
    /exact 2008/,
  );
  const page = load(sources.html);
  let changed = 0;
  page("td").each((_, td) => {
    if (/^(?:Match\/)?Game\s+0*9$/.test(page(td).text().trim())) {
      page(td).text("Game 10");
      changed++;
    }
  });
  assert(changed > 0);
  assert.throws(
    () => recoverOfficialPenaltyContexts({ ...sources, game }, page.html()),
    /primary game scope/,
  );
  assert.throws(
    () =>
      recoverOfficialPenaltyContexts(
        { ...sources, box: { ...sources.box, id: 2008020010 }, game },
        sources.html,
      ),
    /box game identity/,
  );
});

test("the exact reviewed malformed overtime end marker is retained without an inferred time", () => {
  const sources = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/reviewed-2008-penalty-context-control.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  );
  const game = buildGameValueData(sources, []),
    before = JSON.stringify({ sources, game });
  const result = recoverOfficialPenaltyContexts(
    { ...sources, game },
    sources.html,
  );
  assert.equal(result.audit.unclockedControlRows?.length, 1);
  assert.deepEqual(result.audit.unclockedControlRows?.[0], {
    ordinal: 307,
    period: 4,
    kind: "PEND",
    rawClock: "-16:0-120:00",
    description: "Period End- Local time: 10:10 EDT",
    reportSha256:
      "11cc3c292386baf7e3bede3bc48fca9879c882c08632b4e717993d1eaf376eb8",
    previous: { ordinal: 306, period: 3, kind: "PEND", rawClock: "20:000:00" },
    next: { ordinal: 308, period: 4, kind: "PSTR", rawClock: "0:005:00" },
  });
  assert(!("second" in result.audit.unclockedControlRows![0]!));
  assert.equal(JSON.stringify({ sources, game }), before);
  for (const [index, penalty] of result.penalties.entries()) {
    const { homeBefore: _home, awayBefore: _away, ...facts } = penalty;
    const {
      homeBefore: _oldHome,
      awayBefore: _oldAway,
      ...original
    } = game.penalties[index]!;
    assert.deepEqual(facts, original);
  }
});
