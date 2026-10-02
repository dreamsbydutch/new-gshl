import type { z } from "zod";
import { nhlEventFeedSchema } from "@gshl-utils/features/nhl-events";
import type { NHLSchedule, NHLStandings } from "@gshl-lib/types/nhl";
import {
  buildNHLPreseasonStandings,
  nhlClubScheduleSchema,
  nhlScheduleSchema,
  nhlSeasonsSchema,
  nhlStandingsSchema,
  nhlBoxscoreSchema,
} from "@gshl-utils/features/nhl";

async function fetchNHL<T>(
  path: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<T | null> {
  const response = await fetch(`https://api-web.nhle.com/v1/${path}`, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error("NHL data unavailable");
  return schema.parse(await response.json());
}

async function seasonCatalog() {
  const catalog = await fetchNHL("standings-season", nhlSeasonsSchema);
  if (!catalog) throw new Error("NHL season catalog unavailable");
  return catalog.seasons;
}

export async function loadNHLGame(gameId: string) {
  const [game, eventFeed] = await Promise.all([
    fetchNHL(`gamecenter/${gameId}/boxscore`, nhlBoxscoreSchema),
    fetchNHL(`gamecenter/${gameId}/play-by-play`, nhlEventFeedSchema).catch(
      () => null,
    ),
  ]);
  return game && String(game.id) === gameId
    ? {
        ...game,
        eventFeed: eventFeed?.id === game.id ? eventFeed : null,
        updatedAt: Date.now(),
      }
    : null;
}

export async function loadNHLStandings(
  seasonId: number,
  now = new Date(),
): Promise<NHLStandings> {
  const seasons = await seasonCatalog();
  const season = seasons.find((item) => item.id === seasonId);
  const empty: NHLStandings = {
    seasonId,
    standings: [],
    isPreseason: false,
    updatedAt: now.getTime(),
  };
  if (!season) return empty;
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  const date = today < season.standingsEnd ? today : season.standingsEnd;
  const data =
    date >= season.standingsStart
      ? await fetchNHL(`standings/${date}`, nhlStandingsSchema)
      : null;
  const standings =
    data?.standings.filter((team) => team.seasonId === seasonId) ?? [];
  if (standings.length) return { ...empty, standings, updatedAt: Date.now() };
  // Initialize only an upcoming season whose regular-season schedule exists.
  // Toronto's full regular-season schedule identifies the participating clubs.
  if (today > season.standingsEnd) return empty;
  const schedule = await fetchNHL(
    `club-schedule-season/TOR/${seasonId}`,
    nhlClubScheduleSchema,
  );
  if (
    !schedule?.games.some(
      (game) => game.season === seasonId && game.gameType === 2,
    )
  )
    return empty;
  const previousSeason = [...seasons]
    .filter((item) => item.id < seasonId)
    .sort((a, b) => b.id - a.id)[0];
  const previous = previousSeason
    ? await fetchNHL(
        `standings/${previousSeason.standingsEnd}`,
        nhlStandingsSchema,
      )
    : null;
  const initial = buildNHLPreseasonStandings(
    seasonId,
    today,
    schedule.games,
    previous?.standings ?? [],
  );
  return {
    ...empty,
    standings: initial,
    isPreseason: initial.length > 0,
    updatedAt: Date.now(),
  };
}

export async function loadNHLSchedule(
  seasonId: number,
  dates: string[],
): Promise<NHLSchedule> {
  const seasons = await seasonCatalog();
  if (!seasons.some((item) => item.id === seasonId))
    return { seasonId, gameWeek: [], published: false, updatedAt: Date.now() };
  const chunks = await Promise.all(
    dates
      .filter((_, i) => i % 7 === 0)
      .map((date) => fetchNHL(`schedule/${date}`, nhlScheduleSchema)),
  );
  const days = new Map(
    chunks
      .flatMap((chunk) => chunk?.gameWeek ?? [])
      .map((day) => [
        day.date,
        day.games.filter((game) => game.season === seasonId),
      ]),
  );
  return {
    seasonId,
    published: true,
    gameWeek: dates.map((date) => ({ date, games: days.get(date) ?? [] })),
    updatedAt: Date.now(),
  };
}
