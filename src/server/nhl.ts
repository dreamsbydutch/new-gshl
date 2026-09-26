import "server-only";
import type { z } from "zod";
import type { NHLSchedule, NHLStandings } from "@gshl-lib/types/nhl";
import {
  nhlDateRange,
  nhlScheduleSchema,
  nhlStandingsSchema,
} from "@gshl-utils/features/nhl";

async function fetchNHL<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`https://api-web.nhle.com/v1/${path}`, {
    next: { revalidate: 60 },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("NHL data unavailable");
  return schema.parse(await response.json());
}

export function getNHLStandings(): Promise<NHLStandings> {
  return fetchNHL("standings/now", nhlStandingsSchema);
}

export async function getNHLSchedule(dates: string[]): Promise<NHLSchedule> {
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
  };
}

export { nhlDateRange };
