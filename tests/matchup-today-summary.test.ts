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
  assert.match(render("W"), />\+0<\/span>/);
  assert.match(render("GAA"), />2.50 today<\/span>/);
  assert.match(render("SVP"), />0.925 today<\/span>/);
});
void test("unavailable daily stats and inactive matchups do not imply zero contributions", () => {
  assert.equal(render("A"), "");
  assert.equal(render("G", { ...activity, isActive: false }), "");
  assert.equal(render("G", { ...activity, teams: [] }), "");
});
