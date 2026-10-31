import { GSHL_PERFORMANCE_RATING_VERSION } from "../src/lib/utils/domain/gshl-performance-rating";
import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MatchupGameImpact } from "../src/components/matchup/MatchupGameImpact";
import type { MatchupPlayerWeekRow } from "../src/lib/types/matchup";

void test("game impact uses weekly stats while daily participants may be partial", () => {
  const html = renderToStaticMarkup(
    createElement(MatchupGameImpact, {
      team: null,
      standouts: [{ id: "one" }],
      players: [{ id: "one", fullName: "Test Player", GP: 1, SOG: 99 }],
      roster: [
        {
          id: "one",
          fullName: "Test Player",
          GP: 2,
          SOG: 8,
          PPP: 2,
          W: 1,
          SO: 1,
          Rating: 75,
          ratingVersion: GSHL_PERFORMANCE_RATING_VERSION,
        } as MatchupPlayerWeekRow,
      ],
    }),
  );
  const text = html.replace(/<!-- -->/g, "");
  assert.match(text, /4\.0 SOG/);
  assert.match(text, /1\.0 PPP/);
  assert.match(text, /0\.5 W/);
  assert.match(text, /0\.5 SO/);
  assert.doesNotMatch(html, /99\.0/);
  assert.match(html, /75\.0/);
  assert.match(html, /Roster standout/);
});

void test("participants without weekly data do not invent pace or ratings", () => {
  const html = renderToStaticMarkup(
    createElement(MatchupGameImpact, {
      team: null,
      standouts: [{ id: "one" }],
      players: [{ id: "unknown", fullName: "New Player" }],
      roster: [],
    }),
  );
  assert.match(html, /New Player/);
  assert.match(html, /Rating unavailable/);
  assert.match(html, /No weekly stat pace yet/);
  assert.doesNotMatch(html, /NaN|Roster standout/);
});
