import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { gunzipSync } from "node:zlib";
import { load } from "cheerio";
import { buildGameValueData, clockSeconds } from "./game-value-input";
import { recoverOfficialPenaltyContexts } from "./official-penalty-context";

const FIRST = 11740480;
function fixture() {
  const sources = JSON.parse(
    gunzipSync(
      readFileSync(
        new URL(
          "./fixtures/reviewed-2008-penalty-context.json.gz",
          import.meta.url,
        ),
      ),
    ).toString("utf8"),
  );
  return { sources, game: buildGameValueData(sources, []) };
}
function controlFixture() {
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
  return { sources, game: buildGameValueData(sources, []) };
}
function primaryRows(
  html: string,
  edit: (rows: ReturnType<typeof load>) => void,
) {
  const $ = load(html);
  edit($);
  return $.html();
}
function findRow($: ReturnType<typeof load>, ordinal: number) {
  const row = $("tr").filter((_, element) => {
    const cells = $(element).children("td");
    return cells.length === 8 && cells.eq(0).text().trim() === String(ordinal);
  });
  assert.equal(row.length, 1);
  return row;
}
function unpricedFirst(
  result: ReturnType<typeof recoverOfficialPenaltyContexts>,
) {
  assert.deepEqual(
    result.penalties
      .filter((p) => p.eventId === FIRST)
      .map((p) => [p.homeBefore, p.awayBefore]),
    [[null, null]],
  );
  assert(!result.audit.changes.some((p) => p.eventId === FIRST));
}

test("contradictory known native context is preserved rather than repaired from the report", () => {
  const { sources, game } = fixture();
  sources.pbp.plays.find(
    (p: { eventId: number }) => p.eventId === FIRST,
  ).situationCode = "1451";
  const penalty = game.penalties.find((p) => p.eventId === FIRST)!;
  penalty.homeBefore = 5;
  penalty.awayBefore = 4;
  const before = JSON.stringify({ sources, game });
  const result = recoverOfficialPenaltyContexts(
    { ...sources, game },
    sources.html,
  );
  assert.deepEqual(
    result.penalties.find((p) => p.eventId === FIRST),
    penalty,
  );
  assert(!result.audit.changes.some((p) => p.eventId === FIRST));
  assert.equal(JSON.stringify({ sources, game }), before);
});

test("a half-known strength pair remains unchanged and is never completed opportunistically", () => {
  const { sources, game } = fixture();
  const penalty = game.penalties.find((p) => p.eventId === FIRST)!;
  penalty.homeBefore = 5;
  const result = recoverOfficialPenaltyContexts(
    { ...sources, game },
    sources.html,
  );
  assert.deepEqual(
    result.penalties.find((p) => p.eventId === FIRST),
    penalty,
  );
  assert(!result.audit.changes.some((p) => p.eventId === FIRST));
});

test("same-whistle source order cannot be reversed even when all assessment identities remain present", () => {
  const { sources, game } = fixture();
  const html = primaryRows(sources.html, ($) => {
    const a = findRow($, 171),
      b = findRow($, 172);
    a.children("td").eq(0).text("172");
    b.children("td").eq(0).text("171");
  });
  const result = recoverOfficialPenaltyContexts({ ...sources, game }, html);
  for (const id of [11740488, 11740487]) {
    assert.deepEqual(
      result.penalties.find((p) => p.eventId === id),
      game.penalties.find((p) => p.eventId === id),
    );
    assert(!result.audit.changes.some((p) => p.eventId === id));
  }
});

test("a nonpriced misconduct cannot disappear from the whole native whistle group", () => {
  const { sources, game } = fixture();
  const event = structuredClone(
    sources.pbp.plays.find((p: { eventId: number }) => p.eventId === FIRST),
  );
  for (const p of sources.pbp.plays)
    if (p.sortOrder > event.sortOrder) p.sortOrder++;
  event.eventId = 1999999001;
  event.sortOrder++;
  event.details = {
    ...event.details,
    typeCode: "MIS",
    duration: 10,
    descKey: "misconduct",
  };
  sources.pbp.plays.push(event);
  unpricedFirst(
    recoverOfficialPenaltyContexts({ ...sources, game }, sources.html),
  );
});

for (const kind of ["GOAL", "FAC"]) {
  test(`${kind} before the first assessment at the same clock prevents borrowing the physical left-limit`, () => {
    const { sources, game } = fixture();
    const html = primaryRows(sources.html, ($) => {
      const original = findRow($, 15),
        extra = original.clone();
      $("tr").each((_, row) => {
        const cells = $(row).children("td"),
          n = Number(cells.eq(0).text().trim());
        if (cells.length === 8 && Number.isInteger(n) && n >= 15)
          cells.eq(0).text(String(n + 1));
      });
      extra.children("td").eq(4).text(kind);
      original.before(extra);
    });
    unpricedFirst(recoverOfficialPenaltyContexts({ ...sources, game }, html));
  });
}

test("period-zero context never borrows the preceding period's ending lineup", () => {
  const { sources, game } = fixture();
  const event = sources.pbp.plays.find(
    (p: { eventId: number }) => p.eventId === FIRST,
  );
  event.timeInPeriod = "00:00";
  event.timeRemaining = "20:00";
  game.penalties.find((p) => p.eventId === FIRST)!.second = 0;
  const html = primaryRows(sources.html, ($) =>
    findRow($, 15).children("td").eq(3).text("0:00 20:00"),
  );
  unpricedFirst(recoverOfficialPenaltyContexts({ ...sources, game }, html));
});

test("period end and next-period zero cannot alias into one newly priced absolute-clock group", () => {
  const { sources, game } = fixture();
  for (const [id, period, clock, remaining] of [
    [FIRST, 1, "20:00", "00:00"],
    [11740481, 2, "00:00", "20:00"],
  ] as const) {
    const event = sources.pbp.plays.find(
      (p: { eventId: number }) => p.eventId === id,
    );
    event.periodDescriptor.number = period;
    event.timeInPeriod = clock;
    event.timeRemaining = remaining;
    game.penalties.find((p) => p.eventId === id)!.second = 1200;
  }
  const html = primaryRows(sources.html, ($) => {
    findRow($, 15).children("td").eq(3).text("20:00 0:00");
    const second = findRow($, 49).children("td");
    second.eq(1).text("2");
    second.eq(3).text("0:00 20:00");
  });
  const result = recoverOfficialPenaltyContexts({ ...sources, game }, html);
  unpricedFirst(result);
  assert(!result.audit.changes.some((p) => p.eventId === 11740481));
});

test("an extra positive shift starting exactly at the whistle is excluded from the pre-whistle cohort", () => {
  const { sources, game } = fixture(),
    t = 137;
  const candidate = sources.pbp.rosterSpots.find(
    (person: { playerId: number; positionCode: string }) =>
      person.positionCode !== "G" &&
      game.players.some((p) => p.id === person.playerId) &&
      !sources.shifts.some(
        (s: {
          playerId: number;
          period: number;
          startTime: string;
          endTime: string;
        }) =>
          s.playerId === person.playerId &&
          s.period === 1 &&
          clockSeconds(s.startTime) < t + 1 &&
          clockSeconds(s.endTime) > t - 1,
      ),
  );
  assert(candidate);
  sources.shifts.push({
    ...sources.shifts[0],
    playerId: candidate.playerId,
    teamId: candidate.teamId,
    period: 1,
    startTime: "02:17",
    endTime: "02:18",
    duration: "00:01",
  });
  const result = recoverOfficialPenaltyContexts(
    { ...sources, game },
    sources.html,
  );
  assert.deepEqual(
    result.penalties
      .filter((p) => p.eventId === FIRST)
      .map((p) => [p.homeBefore, p.awayBefore]),
    [[5, 5]],
  );
});

test("missing defending-goalie shift evidence withholds recovery without changing known context", () => {
  const { sources, game } = fixture();
  const goalies = new Set(
    sources.pbp.rosterSpots
      .filter(
        (p: { teamId: number; positionCode: string }) =>
          p.teamId === game.homeTeam && p.positionCode === "G",
      )
      .map((p: { playerId: number }) => p.playerId),
  );
  sources.shifts = sources.shifts.filter(
    (s: { playerId: number; period: number }) =>
      s.period !== 1 || !goalies.has(s.playerId),
  );
  unpricedFirst(
    recoverOfficialPenaltyContexts({ ...sources, game }, sources.html),
  );
});

test("a foreign shift game and an orphan penalty ledger ID are hard source failures", () => {
  const first = fixture();
  first.sources.shifts[0].gameId = 2008020010;
  assert.throws(
    () =>
      recoverOfficialPenaltyContexts(
        { ...first.sources, game: first.game },
        first.sources.html,
      ),
    /shift|identity|game/i,
  );
  const second = fixture();
  second.game.penalties[0]!.eventId = 1999999002;
  assert.throws(
    () =>
      recoverOfficialPenaltyContexts(
        { ...second.sources, game: second.game },
        second.sources.html,
      ),
    /ledger|identity|assessment/i,
  );
});

test("contradictory committed/server identity on a BEN sanction cannot produce personal credit", () => {
  const { sources, game } = fixture();
  const event = sources.pbp.plays.find(
    (p: { eventId: number }) => p.eventId === FIRST,
  );
  event.details.typeCode = "BEN";
  event.details.servedByPlayerId = event.details.committedByPlayerId;
  game.penalties.find((p) => p.eventId === FIRST)!.committed = null;
  const result = recoverOfficialPenaltyContexts(
    { ...sources, game },
    sources.html,
  );
  unpricedFirst(result);
  assert.equal(
    result.penalties.find((p) => p.eventId === FIRST)!.committed,
    null,
  );
});

test("reviewed malformed control remains untimed and preserves every native fact", () => {
  const { sources, game } = controlFixture();
  const before = JSON.stringify({ sources, game });
  const result = recoverOfficialPenaltyContexts(
    { ...sources, game },
    sources.html,
  );
  const controls = result.audit.unclockedControlRows!;
  assert.equal(controls.length, 1);
  assert.equal(controls[0]!.ordinal, 307);
  assert.equal(controls[0]!.rawClock, "-16:0-120:00");
  assert.equal("second" in controls[0]!, false);
  assert.equal(JSON.stringify({ sources, game }), before);
  assert.deepEqual(
    result.penalties.map(({ homeBefore: _home, awayBefore: _away, ...p }) => p),
    game.penalties.map(({ homeBefore: _home, awayBefore: _away, ...p }) => p),
  );
});

test("reviewed control cannot authorize a changed body, row, lineup or boundary", () => {
  const { sources, game } = controlFixture();
  const mutations = [
    (html: string) => `${html}\n`,
    (html: string) =>
      primaryRows(html, ($) => {
        findRow($, 307).children("td").eq(0).text("999");
      }),
    (html: string) =>
      primaryRows(html, ($) => {
        findRow($, 307).children("td").eq(3).text("unknown");
      }),
    (html: string) =>
      primaryRows(html, ($) => {
        findRow($, 307).children("td").eq(6).text("1 G");
      }),
    (html: string) =>
      primaryRows(html, ($) => {
        findRow($, 308).children("td").eq(4).text("FAC");
      }),
  ];
  for (const mutate of mutations)
    assert.throws(
      () =>
        recoverOfficialPenaltyContexts(
          { ...sources, game },
          mutate(sources.html),
        ),
      /Missing penalty context primary clock/,
    );
});

test("malformed penalty and physical clocks never inherit the control exception", () => {
  const { sources, game } = controlFixture();
  for (const kind of ["PENL", "GOAL", "FAC"])
    assert.throws(
      () =>
        recoverOfficialPenaltyContexts(
          { ...sources, game },
          primaryRows(sources.html, ($) => {
            findRow($, 307).children("td").eq(4).text(kind);
          }),
        ),
      /Missing penalty context primary clock/,
    );
});

test("an intervening native model event invalidates the reviewed metadata gap", () => {
  const { sources, game } = controlFixture();
  const event = structuredClone(
    sources.pbp.plays.find(
      (p: { typeDescKey: string }) => p.typeDescKey === "shot-on-goal",
    ),
  );
  assert(event);
  event.eventId = 1999999999;
  event.sortOrder = 307;
  sources.pbp.plays.push(event);
  assert.throws(
    () => recoverOfficialPenaltyContexts({ ...sources, game }, sources.html),
    /control gap contains a native model event/,
  );
});
