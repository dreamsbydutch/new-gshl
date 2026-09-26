import "server-only";
import { unstable_cache } from "next/cache";
import type { z } from "zod";
import type { NHLSchedule, NHLStandings } from "@gshl-lib/types/nhl";
import {
  nhlDateRange,
  nhlScheduleSchema,
  nhlStandingsSchema,
  NHL_STANDINGS_REFRESH_SECONDS,
  NHL_SCHEDULE_REFRESH_SECONDS,
} from "@gshl-utils/features/nhl";

async function fetchNHL<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`https://api-web.nhle.com/v1/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("NHL data unavailable");
  return schema.parse(await response.json());
}

const cachedStandings = unstable_cache(
  async (refreshWindow: number): Promise<NHLStandings> => {
    // Arguments form part of Next's cache key. A new window gets fresh data
    // immediately, rather than serving yesterday's data during revalidation.
    void refreshWindow;
    const data = await fetchNHL("standings/now", nhlStandingsSchema);
    return { ...data, updatedAt: Date.now() };
  },
  ["nhl-standings"],
  { revalidate: NHL_STANDINGS_REFRESH_SECONDS },
);

const cachedSchedule = unstable_cache(
  async (dates: string[], refreshWindow: number): Promise<NHLSchedule> => {
    void refreshWindow;
    // Each NHL response covers seven days, including dates with no games.
    const chunks = await Promise.all(
      dates
        .filter((_, i) => i % 7 === 0)
        .map((date) => fetchNHL(`schedule/${date}`, nhlScheduleSchema)),
    );
    const days = new Map(
      chunks
        .flatMap((chunk) => chunk.gameWeek)
        .map((day) => [day.date, day.games]),
    );
    return {
      gameWeek: dates.map((date) => ({ date, games: days.get(date) ?? [] })),
      updatedAt: Date.now(),
    };
  },
  ["nhl-schedule"],
  { revalidate: NHL_SCHEDULE_REFRESH_SECONDS },
);

export function getNHLStandings() {
  return cachedStandings(
    Math.floor(Date.now() / (NHL_STANDINGS_REFRESH_SECONDS * 1000)),
  );
}

export function getNHLSchedule(dates: string[]) {
  return cachedSchedule(
    dates,
    Math.floor(Date.now() / (NHL_SCHEDULE_REFRESH_SECONDS * 1000)),
  );
}

export { nhlDateRange };
