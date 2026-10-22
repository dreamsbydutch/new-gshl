import assert from "node:assert/strict";
import { test } from "node:test";
import { isFantasySeason, selectSeasonScope } from "./season-scope";
import { resolveUfaSigningSeason } from "../features/ufa-deadline";

void test("legacy and explicit fantasy years survive while NHL-only history requires opt-in", () => {
  const legacy = Object.freeze({ id: "fantasy-old" });
  const fantasy = Object.freeze({ id: "fantasy", nhlOnly: false });
  const nhl = Object.freeze({ id: "nhl", nhlOnly: true });
  const all = Object.freeze([nhl, legacy, fantasy]);
  assert.equal(isFantasySeason(nhl), false);
  assert.deepEqual(selectSeasonScope(all), [legacy, fantasy]);
  assert.deepEqual(selectSeasonScope(all, { includeNhlOnly: true }), all);
  assert.notEqual(selectSeasonScope(all, { includeNhlOnly: true }), all);
  assert.equal(all.length, 3);
});

void test("NHL-only rows never supply the fantasy signing season", () => {
  const nhl = {
    year: 2027,
    startDate: "2026-10-01",
    nhlOnly: true,
    isActive: true,
  };
  const fantasy = { year: 2026, startDate: "2025-10-01" };
  const now = Date.parse("2026-11-01T00:00:00Z");
  assert.equal(resolveUfaSigningSeason([nhl], now), undefined);
  assert.equal(resolveUfaSigningSeason([nhl, fantasy], now), fantasy);
});
