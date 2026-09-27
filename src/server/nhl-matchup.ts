import "server-only";
import { unstable_cache } from "next/cache";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import type { Value } from "convex/values";
import { env } from "@gshl-env";
import { callConvex } from "@gshl-lib/data/convex-store";
import { NHL_SCHEDULE_REFRESH_SECONDS } from "@gshl-utils/features/nhl";
import { getNHLGame } from "./nhl";
import {
  loadNHLMatchupRoster,
  type NHLMatchupReader,
} from "./nhl-matchup-data";

const cachedRoster = unstable_cache(
  async (gameId: string, refreshWindow: number) => {
    void refreshWindow;
    const game = await getNHLGame(gameId);
    if (!game) return null;
    const client = new ConvexHttpClient(
      env.CONVEX_URL ?? env.NEXT_PUBLIC_CONVEX_URL!,
    );
    const read = <Result>(path: string, args: Record<string, Value>) =>
      client.query(
        makeFunctionReference<"query", Record<string, Value>, Result>(path),
        args,
      );
    const reader: NHLMatchupReader = {
      seasons: (year) => read("frontend:seasons", { where: { year } }),
      teams: (seasonId) => read("frontend:teams", { where: { seasonId } }),
      datePage: (seasonId, date, cursor) =>
        callConvex("query", "maintenanceScope:listPlayerDayDateRows", {
          seasonId,
          date,
          cursor,
        }),
      playersByIds: (ids) => read("frontend:playersByIds", { ids }),
      playersByOwner: (ownerId) =>
        read("frontend:players", { where: { ownerId } }),
    };
    return loadNHLMatchupRoster(game, reader);
  },
  ["nhl-matchup-roster"],
  { revalidate: NHL_SCHEDULE_REFRESH_SECONDS },
);

export function getNHLMatchupRoster(gameId: string) {
  return cachedRoster(
    gameId,
    Math.floor(Date.now() / (NHL_SCHEDULE_REFRESH_SECONDS * 1000)),
  );
}
