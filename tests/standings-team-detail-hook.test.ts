import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { useStandingsTeamDetail } from "../src/hooks/main/useStandings";

void test("team detail sends a day only when a dated server snapshot needs refreshing", async (t) => {
  const client = new ConvexReactClient("https://standings-test.convex.cloud");
  const ids = { seasonId: "season", teamId: "team" };
  const today = "2026-11-27";
  const legacy = { previousGames: [], upcomingGames: [] };
  let snapshot: typeof legacy & { asOfDay?: string } = legacy;
  const requests: unknown[] = [];
  t.mock.method(
    client,
    "watchQuery",
    (ref: FunctionReference<"query">, args: object) => {
      assert.equal(getFunctionName(ref), "standings:teamDetail");
      requests.push(args);
      if (!snapshot.asOfDay) assert.deepEqual(args, ids);
      return {
        localQueryResult: () => snapshot,
        onUpdate: () => () => {},
      };
    },
  );
  function Probe() {
    useStandingsTeamDetail({ ...ids, today });
    return null;
  }
  try {
    for (const day of [undefined, today, "2026-11-26"]) {
      snapshot = day ? { ...legacy, asOfDay: day } : legacy;
      requests.length = 0;
      let renderer: ReactTestRenderer | undefined;
      act(() => {
        renderer = create(
          createElement(ConvexProvider, { client }, createElement(Probe)),
        );
      });
      try {
        assert.ok(requests.length > 0);
        assert.equal(
          requests.some((args) => Object.hasOwn(args as object, "today")),
          day === "2026-11-26",
        );
      } finally {
        act(() => renderer?.unmount());
      }
    }
  } finally {
    await client.close();
  }
});
