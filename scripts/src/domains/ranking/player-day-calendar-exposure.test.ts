import assert from "node:assert/strict";
import test from "node:test";
import { attachPlayerDayCalendarExposure } from "./player-day-calendar-exposure";

const week = {
  weekId: "olympic-break",
  startDate: "2026-02-02",
  endDate: "2026-03-01",
  meanGamesPerNhlTeam: 4.8125,
  scheduledLeagueGames: 77,
  leagueTeamCount: 32,
};
const sidecar = {
  version: "owner-independent-nhl-calendar-exposure-v1",
  weeks: [week],
};

test("exposure attaches only league schedule metadata, preserving performances and inputs", () => {
  const contexts = [
    {
      weekId: week.weekId,
      startDate: week.startDate,
      endDate: week.endDate,
      owner: "a",
      raw: { G: 999 },
    },
  ];
  const original = structuredClone(contexts);
  const result = attachPlayerDayCalendarExposure(contexts, sidecar);
  assert.equal(result[0]!.nhlGamesPerTeam, 4.8125);
  assert.deepEqual(contexts, original);
  assert.notEqual(result[0], contexts[0]);
  assert.equal(
    attachPlayerDayCalendarExposure(
      [{ ...contexts[0]!, owner: "b", raw: { G: -999 } }],
      sidecar,
    )[0]!.nhlGamesPerTeam,
    4.8125,
  );
});

test("missing, duplicate, wrong-date and preexisting contradictory exposure fail closed", () => {
  const context = {
    weekId: week.weekId,
    startDate: week.startDate,
    endDate: week.endDate,
  };
  assert.throws(
    () =>
      attachPlayerDayCalendarExposure(
        [{ ...context, weekId: "missing" }],
        sidecar,
      ),
    /Missing or mismatched/,
  );
  assert.throws(
    () =>
      attachPlayerDayCalendarExposure([context], {
        ...sidecar,
        weeks: [week, week],
      }),
    /duplicate/,
  );
  assert.throws(
    () =>
      attachPlayerDayCalendarExposure(
        [{ ...context, endDate: "2026-03-02" }],
        sidecar,
      ),
    /mismatched/,
  );
  assert.throws(
    () =>
      attachPlayerDayCalendarExposure(
        [{ ...context, nhlGamesPerTeam: 28 }],
        sidecar,
      ),
    /disagrees/,
  );
});

test("invalid dates, nonpositive/nonfinite exposure and inconsistent schedule counts are rejected", () => {
  const context = {
    weekId: week.weekId,
    startDate: week.startDate,
    endDate: week.endDate,
  };
  for (const bad of [0, -1, Infinity, NaN, "4.8125"])
    assert.throws(
      () =>
        attachPlayerDayCalendarExposure([context], {
          ...sidecar,
          weeks: [{ ...week, meanGamesPerNhlTeam: bad }],
        }),
      /Invalid/,
    );
  assert.throws(
    () =>
      attachPlayerDayCalendarExposure([context], {
        ...sidecar,
        weeks: [{ ...week, startDate: "2026-02-30" }],
      }),
    /Invalid/,
  );
  assert.throws(
    () =>
      attachPlayerDayCalendarExposure([context], {
        ...sidecar,
        weeks: [{ ...week, scheduledLeagueGames: 78 }],
      }),
    /schedule counts/,
  );
});
