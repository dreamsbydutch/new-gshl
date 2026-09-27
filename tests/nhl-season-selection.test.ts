import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { useNavStore } from "../src/lib/cache";
import {
  useNHLSeason,
  useNHLStandings,
  useNHLSchedule,
} from "../src/hooks/main/useNHL";

for (const year of ["2024", "2025", "2026"]) {
  void test(`both NHL tabs request data for the stored string year ${year}`, async (t) => {
    const previous = useNavStore.getState().selectedSeasonId;
    useNavStore.setState({ selectedSeasonId: "selected-season" });
    const client = new ConvexReactClient("https://test.convex.cloud");
    // frontend.seasons preserves the string year defined in convex/schema.ts.
    const seasons = [{ id: "selected-season", year }];
    t.mock.method(client, "watchQuery", () => ({
      localQueryResult: () => seasons,
      onUpdate: () => () => undefined,
    }));
    const events = new EventTarget();
    const originalWindow = Object.getOwnPropertyDescriptor(
      globalThis,
      "window",
    );
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: events,
    });
    const requests: string[] = [];
    const seasonId = Number(year) * 10000 + Number(year) + 1;
    t.mock.method(globalThis, "fetch", async (url: string) => {
      requests.push(url);
      return Response.json(
        url.includes("view=standings")
          ? {
              seasonId,
              standings: [],
              isPreseason: false,
              updatedAt: Date.now(),
            }
          : {
              seasonId,
              gameWeek: [{ date: `${year}-10-10`, games: [] }],
              published: true,
              updatedAt: Date.now(),
            },
      );
    });
    let resolvedSeason: number | undefined;
    let standings: ReturnType<typeof useNHLStandings> | undefined;
    let schedule: ReturnType<typeof useNHLSchedule> | undefined;
    function Probe() {
      resolvedSeason = useNHLSeason().seasonId;
      standings = useNHLStandings(resolvedSeason);
      schedule = useNHLSchedule(
        `${year}-10-10`,
        `${year}-10-16`,
        resolvedSeason,
      );
      return null;
    }
    let renderer: ReactTestRenderer | undefined;
    t.after(async () => {
      act(() => renderer?.unmount());
      await client.close();
      useNavStore.setState({ selectedSeasonId: previous });
      if (originalWindow)
        Object.defineProperty(globalThis, "window", originalWindow);
      else Reflect.deleteProperty(globalThis, "window");
    });
    await act(async () => {
      renderer = create(
        createElement(ConvexProvider, { client }, createElement(Probe)),
      );
    });
    assert.equal(
      requests.length,
      2,
      "Both NHL tabs must fetch data after resolving the selected GSHL season",
    );
    assert.equal(resolvedSeason, seasonId);
    assert.ok(requests.every((url) => url.includes(`season=${seasonId}`)));
    assert.equal(standings?.data?.seasonId, seasonId);
    assert.equal(schedule?.data?.gameWeek.length, 1);
  });
}
