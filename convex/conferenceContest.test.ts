import assert from "node:assert/strict";
import test from "node:test";

import { view } from "./conferenceContest";
import type { QueryCtx } from "./_generated/server";
import type { ConferenceContestBrowserView } from "../src/lib/types";

void test("preseason query renders two conferences before teams or games exist", async () => {
  const preseasonId = "preseason";
  const now = Date.now();
  const seasonStart = now + 30 * 86_400_000;
  const tables: Record<string, Array<Record<string, unknown>>> = {
    seasons: [
      {
        _id: preseasonId,
        year: String(new Date(seasonStart).getUTCFullYear()),
        name: "Preseason",
        startDate: seasonStart,
        endDate: seasonStart + 180 * 86_400_000,
        draftStartAt: now - 86_400_000,
        isActive: false,
      },
    ],
    teams: [],
    matchups: [],
    teamAwards: [],
    conferences: [
      { _id: "A", name: "Alpha", abbr: "A", logoUrl: null },
      { _id: "B", name: "Beta", abbr: "B", logoUrl: null },
    ],
  };
  const db = {
    query(table: string) {
      const rows = tables[table];
      assert.ok(rows, `Unexpected table: ${table}`);
      const query = {
        withIndex() {
          return query;
        },
        async collect() {
          return rows;
        },
        async take(limit: number) {
          return rows.slice(0, limit);
        },
      };
      return query;
    },
    normalizeId(_table: string, id: string) {
      return id;
    },
    async get() {
      return null;
    },
  } as unknown as QueryCtx["db"];
  const handler = (
    view as unknown as {
      _handler: (ctx: QueryCtx, args: Record<string, never>) => Promise<ConferenceContestBrowserView>;
    }
  )._handler;
  const result = await handler({ db } as QueryCtx, {});

  assert.equal(result.seasons.length, 1);
  assert.equal(result.seasons[0]?.seasonId, preseasonId);
  assert.equal(result.seasons[0]?.gamesPlayedByConferenceId.A, 0);
  assert.deepEqual(result.seasons[0]?.headToHeadRecordByConferenceId.B, {
    wins: 0,
    losses: 0,
    ties: 0,
  });
  assert.ok(result.overall);
});
