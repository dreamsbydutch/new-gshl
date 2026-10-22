import assert from "node:assert/strict";
import test from "node:test";
import {
  boundaryShiftFixture,
  twoBoundaryRowsFixture,
  retainedBoundary2008Fixtures,
} from "./boundary-shift-fixtures";
import { reconcileBoundaryShiftReports } from "./boundary-shift-reconciliation";
import { parseOfficialShiftReport } from "./official-shift-report";
import { reviewedBoundary2008Cases } from "./boundary-shift-2008-cases";

test("0366 returns one fully checked two-side result including exact bilingual headers and no invented zero-time exposure", () => {
  const f = retainedBoundary2008Fixtures().find(
    (f) => f.pbp.id === 2008020366,
  )!;
  const before = JSON.stringify(f),
    result = reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, []);
  assert.equal(JSON.stringify(f), before);
  assert.equal(result.shiftRecovery.recoveredSide, "both");
  assert.equal(result.shiftRecovery.players.length, 38);
  assert.equal(result.shiftRecovery.corrections.length, 6);
  assert.equal(
    result.shiftRecovery.reviewedSummaryHeaderTranslations?.length,
    19,
  );
  assert.equal(result.shiftRecovery.unchangedOppositeSideIntervals, 0);
  assert("companionReview" in result.shiftRecovery);
  assert.equal(
    result.shiftRecovery.companionReview.unchangedOppositeSideIntervals,
    0,
  );
  assert(result.shifts.every((s) => s.startTime !== s.endTime));
  const gomez = result.shiftRecovery.corrections.find(
    (c) => c.playerId === 8467351,
  );
  assert(
    gomez,
    "Scott Gomez must retain his explicit reviewed zero-time horn row audit",
  );
  assert.deepEqual(gomez.replacements, [{ period: 2, start: 1200, end: 1200 }]);
});

test("exact companion review rejects same-side, different-game and nested/cyclic configurations", () => {
  const f = retainedBoundary2008Fixtures().find(
    (f) => f.pbp.id === 2008020366,
  )!;
  const spec = reviewedBoundary2008Cases[2008020366]!;
  const original = spec.companion!;
  try {
    for (const mutate of [
      () => {
        spec.companion!.home = spec.home;
      },
      () => {
        spec.companion!.expectedSource!.date = "2008-01-01";
      },
      () => {
        spec.companion!.companion = spec.companion;
      },
      () => {
        spec.companion = spec;
      },
    ]) {
      spec.companion = structuredClone(original);
      mutate();
      assert.throws(
        () => reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, []),
        /companion/,
      );
    }
  } finally {
    spec.companion = original;
  }
});

test("both report bodies and both native cohorts must validate before any combined recovery is returned", () => {
  for (const mutate of [
    (f: ReturnType<typeof retainedBoundary2008Fixtures>[number]) => {
      f.reports.away += " ";
    },
    (f: ReturnType<typeof retainedBoundary2008Fixtures>[number]) => {
      f.reports.home += " ";
    },
    (f: ReturnType<typeof retainedBoundary2008Fixtures>[number]) => {
      f.box.playerByGameStats.awayTeam!.goalies![0]!.toi = "00:01";
    },
  ]) {
    const f = retainedBoundary2008Fixtures().find(
      (f) => f.pbp.id === 2008020366,
    )!;
    mutate(f);
    const before = JSON.stringify(f);
    assert.throws(() =>
      reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, []),
    );
    assert.equal(JSON.stringify(f), before);
  }
});

test("new goalie boundaries preserve Budaj's exact two-second absence and full Rinne overtime", () => {
  for (const id of [2008020562, 2008021092]) {
    const f = retainedBoundary2008Fixtures().find((f) => f.pbp.id === id)!;
    const result = reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, []);
    const goalie = id === 2008020562 ? 8469514 : 8471469;
    const rows = result.shifts.filter((s) => s.playerId === goalie);
    if (id === 2008020562) {
      assert(
        rows.some(
          (s) =>
            s.period === 2 && s.startTime === "0:00" && s.endTime === "20:00",
        ),
      );
      assert(
        rows.some(
          (s) =>
            s.period === 3 && s.startTime === "0:00" && s.endTime === "17:10",
        ),
      );
      assert(
        rows.some(
          (s) =>
            s.period === 3 && s.startTime === "17:12" && s.endTime === "20:00",
        ),
      );
    } else
      assert(
        rows.some(
          (s) =>
            s.period === 4 && s.startTime === "0:00" && s.endTime === "5:00",
        ),
      );
  }
});

test("all nineteen exact historical boundaries preserve native inputs and reconcile every player", () => {
  for (const f of retainedBoundary2008Fixtures().filter(
    (f) => f.pbp.id !== 2008020160,
  )) {
    const before = JSON.stringify(f),
      result = reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, []);
    assert.equal(JSON.stringify(f), before);
    assert.equal(
      result.shiftRecovery.players.length,
      f.pbp.id === 2008020366 ? 38 : f.pbp.id === 2008020149 ? 20 : 19,
    );
    assert.ok(
      result.shiftRecovery.players.every(
        (p) => p.nativeSeconds === p.intervalSeconds,
      ),
    );
    if (f.pbp.id === 2008020781) {
      assert.equal(
        result.shiftRecovery.reviewedSummaryHeaderTranslations?.length,
        19,
      );
      assert.ok(
        result.shifts.some(
          (s) =>
            s.playerId === 8468011 &&
            s.period === 3 &&
            s.startTime === "0:00" &&
            s.endTime === "20:00",
        ),
      );
    }
    if (f.pbp.id === 2008020021) {
      assert.ok(!result.shifts.some((s) => s.startTime === s.endTime));
      assert.ok(
        result.shifts.some(
          (s) =>
            s.playerId === 8460712 &&
            s.period === 4 &&
            s.startTime === "0:00" &&
            s.endTime === "3:54",
        ),
      );
    }
    if (f.pbp.id === 2008020392) {
      assert.ok(
        result.shifts.some(
          (s) =>
            s.playerId === 8460535 &&
            s.period === 2 &&
            s.startTime === "19:58" &&
            s.endTime === "20:00",
        ),
      );
      assert.ok(
        result.shifts.some(
          (s) =>
            s.playerId === 8460535 &&
            s.period === 3 &&
            s.startTime === "0:00" &&
            s.endTime === "18:39",
        ),
      );
    }
  }
});

test("exact historical source authority rejects changed, additional and reordered report rows and goalie identities", () => {
  const base = retainedBoundary2008Fixtures().find(
    (f) => f.pbp.id === 2008020775,
  )!;
  for (const mutate of [
    (f: typeof base) => {
      f.reports.home += " ";
    },
    (f: typeof base) => {
      f.reports.home = f.reports.home.replace("BACKSTROM", "OTHER");
    },
    (f: typeof base) => {
      f.reports.home = f.reports.home.replace(
        /(<tr[^>]*>[\s\S]*?<\/tr>)/i,
        "$1$1",
      );
    },
    (f: typeof base) => {
      f.pbp.rosterSpots.find((p) => p.playerId === 8473404)!.positionCode = "C";
    },
    (f: typeof base) => {
      f.pbp.gameDate = "2008-01-01";
    },
    (f: typeof base) => {
      f.box.playerByGameStats.homeTeam!.goalies![0]!.toi = "00:01";
    },
    (f: typeof base) => {
      f.pbp.plays.push({
        eventId: 999999,
        typeDescKey: "shot-on-goal",
        periodDescriptor: { number: 3, periodType: "REG" },
        timeInPeriod: "20:00",
        details: { goalieInNetId: 8473404 },
      });
    },
  ]) {
    const f = structuredClone(base);
    mutate(f);
    assert.throws(() =>
      reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, []),
    );
  }
  assert.throws(() =>
    reconcileBoundaryShiftReports(base.pbp, base.box, base.reports, [
      { id: 1 },
    ]),
  );
  const bilingual = retainedBoundary2008Fixtures().find(
    (f) => f.pbp.id === 2008020781,
  )!;
  bilingual.reports.away = bilingual.reports.away.replace("PR/SHF", "SHF");
  assert.throws(
    () =>
      reconcileBoundaryShiftReports(
        bilingual.pbp,
        bilingual.box,
        bilingual.reports,
        [],
      ),
    /source scope/,
  );
});

test("reviewed exact boundaries preserve inputs and the untouched side and reconcile all native exposure", () => {
  const f = boundaryShiftFixture(),
    before = JSON.stringify(f);
  assert.throws(
    () => parseOfficialShiftReport(f.reports.away, f.pbp, false),
    /interval/,
  );
  const result = reconcileBoundaryShiftReports(
    f.pbp,
    f.box,
    f.reports,
    f.apiShifts,
  );
  assert.equal(JSON.stringify(f), before);
  assert.equal(result.shiftRecovery.corrections.length, 5);
  assert.equal(result.shiftRecovery.players.length, 6);
  assert.equal(result.shiftRecovery.goalieWitnesses, 1);
  assert.deepEqual(
    result.shifts.filter((s) => s.teamId === 1),
    parseOfficialShiftReport(f.reports.home, f.pbp, true),
  );
  assert.ok(
    result.shiftRecovery.players.every(
      (p) => p.nativeSeconds === p.intervalSeconds,
    ),
  );
  assert.deepEqual(
    result.shifts
      .filter((s) => s.playerId === 8469508 && s.period === 2)
      .map((s) => [s.startTime, s.endTime]),
    [
      ["0:00", "0:51"],
      ["1:00", "2:00"],
    ],
  );
});
test("unknown actors, altered raw endpoints, one-second native skew and nonempty API alternatives cannot gain recovery", () => {
  for (const change of [
    (f: ReturnType<typeof boundaryShiftFixture>) => {
      f.pbp.id = 2009020002;
      f.box.id = 2009020002;
    },
    (f: ReturnType<typeof boundaryShiftFixture>) => {
      f.box.playerByGameStats.awayTeam.forwards[0]!.toi = "3:08";
    },
    (f: ReturnType<typeof boundaryShiftFixture>) => {
      f.reports.away = f.reports.away.replace("19:53 / 0:07", "19:52 / 0:08");
    },
    (f: ReturnType<typeof boundaryShiftFixture>) => {
      f.pbp.rosterSpots[0]!.playerId = 999;
    },
    (f: ReturnType<typeof boundaryShiftFixture>) => {
      f.apiShifts.push({ id: 1 });
    },
    (f: ReturnType<typeof boundaryShiftFixture>) => {
      f.reports.away = f.reports.away.replace("42:54", "42:53");
    },
    (f: ReturnType<typeof boundaryShiftFixture>) => {
      f.box.playerByGameStats.awayTeam.forwards.pop();
    },
  ]) {
    const f = boundaryShiftFixture();
    change(f);
    assert.throws(() =>
      reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, f.apiShifts),
    );
  }
});
test("all goalie witnesses and duplicate/overlapping source rows remain strict", () => {
  const f = boundaryShiftFixture();
  f.pbp.plays[0]!.periodDescriptor.number = 4;
  assert.throws(
    () => reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, []),
    /witness/,
  );
  const g = boundaryShiftFixture();
  g.reports.away = g.reports.away.replace(
    "<td>2</td><td>1</td><td>19:53",
    "<td>1</td><td>1</td><td>19:53",
  );
  assert.throws(
    () => reconcileBoundaryShiftReports(g.pbp, g.box, g.reports, []),
    /Duplicate/,
  );
});

test("two independently reviewed boundaries for one player remain distinct and mandatory", () => {
  const f = twoBoundaryRowsFixture(),
    before = JSON.stringify(f);
  const result = reconcileBoundaryShiftReports(f.pbp, f.box, f.reports, []);
  assert.equal(JSON.stringify(f), before);
  assert.equal(result.shiftRecovery.corrections.length, 8);
  assert.equal(
    result.shiftRecovery.corrections.filter((x) => x.playerId === 8471691)
      .length,
    2,
  );
  for (const clock of ["19:40 / 0:20", "19:27 / 0:33"]) {
    const bad = twoBoundaryRowsFixture();
    // Change only Hanzal's exact row, leaving all other actors and total ledgers intact.
    const start = bad.reports.away.indexOf("2 HANZAL, PLAYER"),
      end = bad.reports.away.indexOf("3 KORPIKOSKI, PLAYER");
    const part = bad.reports.away
      .slice(start, end)
      .replace(clock, "19:39 / 0:21");
    bad.reports.away =
      bad.reports.away.slice(0, start) + part + bad.reports.away.slice(end);
    assert.throws(() =>
      reconcileBoundaryShiftReports(bad.pbp, bad.box, bad.reports, []),
    );
  }
});

test("the documented Grossmann spelling keeps exact NHL-ID, both first names and unique team jersey guards", () => {
  const create = () => {
    const f = twoBoundaryRowsFixture();
    const player = {
      playerId: 8471269,
      teamId: 2,
      sweaterNumber: 99,
      positionCode: "D",
      firstName: { default: "Nicklas" },
      lastName: { default: "Grossmann" },
    };
    f.pbp.rosterSpots.push(player);
    f.box.playerByGameStats.awayTeam.forwards.push({
      playerId: player.playerId,
      toi: "0:00",
    });
    const zero =
      '<tr><td class="playerHeading">99 GROSSMAN, NICKLAS</td></tr><tr><td>1</td><td>0</td><td>0:00</td><td>0:00</td><td>0:00</td><td>0:00</td><td>0:00</td></tr><tr><td>TOT</td><td>0</td><td>0:00</td><td>0:00</td><td>0:00</td><td>0:00</td><td>0:00</td></tr>';
    f.reports.away = f.reports.away.replace("</table>", zero + "</table>");
    return { f, player };
  };
  const good = create();
  assert.doesNotThrow(() =>
    reconcileBoundaryShiftReports(good.f.pbp, good.f.box, good.f.reports, []),
  );
  for (const change of [
    (x: ReturnType<typeof create>) => {
      x.player.playerId = 999;
    },
    (x: ReturnType<typeof create>) => {
      x.player.firstName.default = "Other";
    },
    (x: ReturnType<typeof create>) => {
      x.f.reports.away = x.f.reports.away.replace(
        "GROSSMAN, NICKLAS",
        "GROSSMAN, OTHER",
      );
    },
    (x: ReturnType<typeof create>) => {
      x.player.lastName.default = "Grossman";
      x.f.reports.away = x.f.reports.away.replace(
        "GROSSMAN, NICKLAS",
        "GROSSMANN, NICKLAS",
      );
    },
    (x: ReturnType<typeof create>) => {
      x.f.pbp.rosterSpots.push({ ...x.player, playerId: 998 });
    },
  ]) {
    const x = create();
    change(x);
    assert.throws(() =>
      reconcileBoundaryShiftReports(x.f.pbp, x.f.box, x.f.reports, []),
    );
  }
});
