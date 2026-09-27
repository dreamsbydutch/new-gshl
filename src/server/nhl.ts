import "server-only";
import { unstable_cache } from "next/cache";
import {
  NHL_STANDINGS_REFRESH_SECONDS,
  NHL_SCHEDULE_REFRESH_SECONDS,
} from "@gshl-utils/features/nhl";
import { loadNHLSchedule, loadNHLStandings, loadNHLGame } from "./nhl-data";

const cachedStandings = unstable_cache(
  async (seasonId: number, refreshWindow: number) => {
    // Both season and refresh window belong to the cache key.
    void refreshWindow;
    return loadNHLStandings(seasonId);
  },
  ["nhl-standings-by-season"],
  { revalidate: NHL_STANDINGS_REFRESH_SECONDS },
);

const cachedSchedule = unstable_cache(
  async (seasonId: number, dates: string[], refreshWindow: number) => {
    void refreshWindow;
    return loadNHLSchedule(seasonId, dates);
  },
  ["nhl-schedule-by-season"],
  { revalidate: NHL_SCHEDULE_REFRESH_SECONDS },
);

export function getNHLStandings(seasonId: number) {
  return cachedStandings(
    seasonId,
    Math.floor(Date.now() / (NHL_STANDINGS_REFRESH_SECONDS * 1000)),
  );
}

export function getNHLSchedule(seasonId: number, dates: string[]) {
  return cachedSchedule(
    seasonId,
    dates,
    Math.floor(Date.now() / (NHL_SCHEDULE_REFRESH_SECONDS * 1000)),
  );
}

export { nhlDateRange } from "@gshl-utils/features/nhl";

const cachedGame = unstable_cache(
  async (gameId: string, refreshWindow: number) => {
    void refreshWindow;
    return loadNHLGame(gameId);
  },
  ["nhl-game"],
  { revalidate: NHL_SCHEDULE_REFRESH_SECONDS },
);

export function getNHLGame(gameId: string) {
  return cachedGame(
    gameId,
    Math.floor(Date.now() / (NHL_SCHEDULE_REFRESH_SECONDS * 1000)),
  );
}
