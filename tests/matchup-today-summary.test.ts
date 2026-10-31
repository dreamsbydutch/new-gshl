import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchupTodayValue } from "../src/components/matchup/MatchupTodaySummary";
import type { useMatchupActivity } from "../src/hooks/features/useMatchupActivity";

const activity = {
  isActive: true,
  teams: [
    {
      side: "away",
      available: true,
      stats: { G: 4, SOG: 11, W: 0, GAA: 2.5, SVP: 0.925 },
    },
  ],
} as unknown as ReturnType<typeof useMatchupActivity>;
const render = (stat: string, input = activity) =>
  renderToStaticMarkup(
    createElement(MatchupTodayValue, { activity: input, stat, side: "away" }),
  );
void test("daily counts are additions while goalie rates are labeled as today's values", () => {
  assert.match(render("G"), />\+4<\/span>/);
  assert.match(render("SOG"), />\+11<\/span>/);
  assert.equal(render("W"), "");
  assert.match(render("GAA"), />2.50 today<\/span>/);
  assert.match(render("SVP"), />0.925 today<\/span>/);
});
void test("unavailable daily stats and inactive matchups do not imply zero contributions", () => {
  assert.equal(render("A"), "");
  assert.equal(render("G", { ...activity, isActive: false }), "");
  assert.equal(render("G", { ...activity, teams: [] }), "");
});

void test("zero daily counting stats are hidden independently for each category and side", () => {
  const zeros = {
    ...activity,
    teams: [
      {
        side: "away",
        available: true,
        stats: { G: 0, A: "0", P: 0, PPP: 0, SOG: 0, HIT: 0, BLK: 0, W: 0 },
      },
      { side: "home", available: true, stats: { G: 1 } },
    ],
  } as unknown as ReturnType<typeof useMatchupActivity>;
  for (const stat of ["G", "A", "P", "PPP", "SOG", "HIT", "BLK", "W"]) {
    assert.equal(render(stat, zeros), "", stat);
  }
  assert.match(
    renderToStaticMarkup(
      createElement(MatchupTodayValue, {
        activity: zeros,
        stat: "G",
        side: "home",
      }),
    ),
    />\+1<\/span>/,
  );
});

void test("a zero goals-against rate and perfect save percentage remain meaningful contributions", () => {
  const shutout = {
    ...activity,
    teams: [{ side: "away", available: true, stats: { GAA: 0, SVP: 1 } }],
  } as unknown as ReturnType<typeof useMatchupActivity>;
  assert.match(render("GAA", shutout), />0.00 today<\/span>/);
  assert.match(render("SVP", shutout), />1.000 today<\/span>/);
});
