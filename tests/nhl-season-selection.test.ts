import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ConvexProvider, ConvexReactClient } from "convex/react";
import { getFunctionName, type FunctionReference } from "convex/server";
import { useNavStore } from "../src/lib/cache";
import { useNHLMatchupRoster } from "../src/hooks/main/useNHLMatchupRoster";
import { nhlGameResponseSchema } from "../src/lib/utils/features/nhl";
import {
  useNHLSeason,
  useNHLStandings,
  useNHLSchedule,
} from "../src/hooks/main/useNHL";

for (const year of ["2025", "2026", "2027"]) {
  void test(`both NHL tabs request the season ending in stored GSHL year ${year}`, async (t) => {
    const previous = useNavStore.getState().selectedSeasonId;
    useNavStore.setState({ selectedSeasonId: "selected-season" });
    const client = new ConvexReactClient("https://test.convex.cloud");
    // frontend.seasons preserves the string year defined in convex/schema.ts.
    const startYear = Number(year) - 1;
    const seasons = [
      { id: "selected-season", year, name: `${startYear}-${year.slice(2)}` },
    ];
    t.mock.method(
      client,
      "watchQuery",
      (
        reference: FunctionReference<"query">,
        args: { where?: { year?: number } },
      ) => ({
        localQueryResult: () =>
          getFunctionName(reference) === "frontend:seasons"
            ? args.where?.year !== undefined && args.where.year !== Number(year)
              ? []
              : seasons
            : [],
        onUpdate: () => () => undefined,
      }),
    );
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
    const seasonId = startYear * 10000 + Number(year);
    const game = nhlGameResponseSchema.parse({
      id: startYear * 1000000 + 20001,
      season: seasonId,
      gameType: 2,
      gameDate: `${startYear}-10-10`,
      startTimeUTC: `${startYear}-10-10T23:00:00Z`,
      gameState: "OFF",
      gameScheduleState: "OK",
      updatedAt: Date.now(),
      awayTeam: { abbrev: "TOR", placeName: { default: "Toronto" } },
      homeTeam: { abbrev: "MTL", placeName: { default: "Montreal" } },
    });
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
              gameWeek: [{ date: `${startYear}-10-10`, games: [] }],
              published: true,
              updatedAt: Date.now(),
            },
      );
    });
    let resolvedSeason: number | undefined;
    let standings: ReturnType<typeof useNHLStandings> | undefined;
    let schedule: ReturnType<typeof useNHLSchedule> | undefined;
    let matchupSeason: string | undefined;
    function Probe() {
      matchupSeason = useNHLMatchupRoster(game).season?.id;
      resolvedSeason = useNHLSeason().seasonId;
      standings = useNHLStandings(resolvedSeason);
      schedule = useNHLSchedule(
        `${startYear}-10-10`,
        `${startYear}-10-16`,
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
    assert.equal(
      matchupSeason,
      "selected-season",
      "NHL matchups must find the GSHL season by its ending year",
    );
    assert.ok(requests.every((url) => url.includes(`season=${seasonId}`)));
    assert.equal(standings?.data?.seasonId, seasonId);
    assert.equal(schedule?.data?.gameWeek.length, 1);
  });
}
