import { z } from "zod";
import { nhlEventFeedSchema } from "./nhl-events";
import { getPlayerNhlAbbreviations } from "../domain/player";

/** The caller supplies rostered players; bench and injury status do not matter. */
export function countGshlPlayersByNhlTeam(
  players: ReadonlyArray<{ id: string; nhlTeam?: string[] | null }>,
): Record<string, number> {
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  for (const player of players) {
    if (seen.has(player.id)) continue;
    seen.add(player.id);
    for (const team of getPlayerNhlAbbreviations(player.nhlTeam)) {
      counts[team] = (counts[team] ?? 0) + 1;
    }
  }
  return counts;
}

export const NHL_STANDINGS_REFRESH_SECONDS = 24 * 60 * 60;
export const NHL_SCHEDULE_REFRESH_SECONDS = 15 * 60;

/** Home follows today's Eastern calendar date, independent of the season picker. */
export function getNHLHomeScheduleDays(now: Date) {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return (["Yesterday", "Today", "Tomorrow"] as const).map((label, index) => {
    const day = new Date(Date.parse(today) + (index - 1) * 86400000);
    const year = day.getUTCFullYear();
    const endingYear = year + (day.getUTCMonth() >= 6 ? 1 : 0);
    return {
      label,
      date: day.toISOString().slice(0, 10),
      seasonId: (endingYear - 1) * 10000 + endingYear,
      dateLabel: new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(day),
    };
  });
}
export const NHL_DIVISION_ORDER = [
  "Atlantic",
  "Metropolitan",
  "Central",
  "Pacific",
] as const;

export function toNHLSeasonId(
  gshlEndingYear: string | number | undefined,
): number | undefined {
  // GSHL stores the ending year: "2027" means the 2026-27 season.
  const year =
    typeof gshlEndingYear === "string"
      ? Number(gshlEndingYear)
      : gshlEndingYear;
  return year !== undefined &&
    Number.isInteger(year) &&
    year >= 1918 &&
    year <= 2100
    ? (year - 1) * 10000 + year
    : undefined;
}

export function isNHLSeasonId(value: number): boolean {
  return toNHLSeasonId(value % 10000) === value;
}

const localized = z.object({ default: z.string() });
export const nhlStandingsSchema = z.object({
  standings: z.array(
    z.object({
      teamName: localized,
      teamAbbrev: localized,
      conferenceName: z.string(),
      divisionName: z.string(),
      divisionSequence: z.number(),
      gamesPlayed: z.number(),
      wins: z.number(),
      losses: z.number(),
      otLosses: z.number(),
      points: z.number(),
      goalDifferential: z.number(),
      date: z.string(),
      seasonId: z.number(),
    }),
  ),
});

const gameTeam = z.object({
  abbrev: z.string(),
  placeName: localized,
  commonName: localized.optional(),
  score: z.number().optional(),
});
export const nhlGameSchema = z.object({
  id: z.number(),
  season: z.number(),
  gameType: z.number(),
  startTimeUTC: z.string().datetime(),
  gameState: z.string(),
  gameScheduleState: z.string(),
  awayTeam: gameTeam,
  homeTeam: gameTeam,
  periodDescriptor: z
    .object({ number: z.number(), periodType: z.string() })
    .optional(),
  gameOutcome: z.object({ lastPeriodType: z.string() }).optional(),
});
export const nhlScheduleSchema = z.object({
  gameWeek: z.array(
    z.object({ date: z.string(), games: z.array(nhlGameSchema) }),
  ),
});

// The timestamp is cached with the data, not regenerated for each visitor.
export const nhlStandingsResponseSchema = nhlStandingsSchema.extend({
  updatedAt: z.number(),
  seasonId: z.number(),
  isPreseason: z.boolean(),
});
export const nhlScheduleResponseSchema = nhlScheduleSchema.extend({
  updatedAt: z.number(),
  seasonId: z.number(),
  published: z.boolean(),
});

export const nhlSeasonsSchema = z.object({
  seasons: z.array(
    z.object({
      id: z.number(),
      standingsStart: z.string(),
      standingsEnd: z.string(),
    }),
  ),
});
export const nhlClubScheduleSchema = z.object({
  games: z.array(nhlGameSchema),
});

export const nhlBoxscorePlayerSchema = z.object({
  playerId: z.number(),
  position: z.string(),
  goals: z.number().optional(),
  assists: z.number().optional(),
  points: z.number().optional(),
  plusMinus: z.number().optional(),
  pim: z.number().optional(),
  hits: z.number().optional(),
  powerPlayGoals: z.number().optional(),
  sog: z.number().optional(),
  blockedShots: z.number().optional(),
  saves: z.number().optional(),
  shotsAgainst: z.number().optional(),
  goalsAgainst: z.number().optional(),
  savePctg: z.number().optional(),
  toi: z.string().optional(),
});
const boxscoreTeam = z.object({
  forwards: z.array(nhlBoxscorePlayerSchema).default([]),
  defense: z.array(nhlBoxscorePlayerSchema).default([]),
  goalies: z.array(nhlBoxscorePlayerSchema).default([]),
});
export const nhlBoxscoreSchema = nhlGameSchema.extend({
  gameDate: z.string(),
  playerByGameStats: z
    .object({ awayTeam: boxscoreTeam, homeTeam: boxscoreTeam })
    .optional(),
});
export const nhlGameResponseSchema = nhlBoxscoreSchema.extend({
  updatedAt: z.number(),
  eventFeed: nhlEventFeedSchema.nullable().optional(),
});

export function buildNHLPreseasonStandings(
  seasonId: number,
  date: string,
  games: z.infer<typeof nhlGameSchema>[],
  previous: z.infer<typeof nhlStandingsSchema>["standings"],
): z.infer<typeof nhlStandingsSchema>["standings"] {
  const regularGames = games.filter(
    (game) => game.season === seasonId && game.gameType === 2,
  );
  if (
    !regularGames.length ||
    regularGames.some((game) => ["OFF", "FINAL"].includes(game.gameState))
  )
    return [];
  const teams = new Map(
    regularGames
      .flatMap((game) => [game.awayTeam, game.homeTeam])
      .map((team) => [team.abbrev, team]),
  );
  return [...teams.values()]
    .map((team) => {
      // Reuse only division metadata; never carry results into another season.
      const metadata = previous.find(
        (row) => row.teamAbbrev.default === team.abbrev,
      );
      return {
        seasonId,
        date,
        teamAbbrev: { default: team.abbrev },
        teamName: {
          default: `${team.placeName.default} ${team.commonName?.default ?? team.abbrev}`,
        },
        conferenceName: metadata?.conferenceName ?? "",
        divisionName: metadata?.divisionName ?? "Unassigned",
        divisionSequence: 0,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        otLosses: 0,
        points: 0,
        goalDifferential: 0,
      };
    })
    .sort((a, b) => a.teamName.default.localeCompare(b.teamName.default));
}

export function formatNHLUpdatedAt(updatedAt: number): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
    timeZoneName: "short",
  }).format(new Date(updatedAt));
}

/** Date keys are NHL calendar dates; never convert them through the browser timezone. */
export function nhlDateRange(start: string, end: string): string[] {
  const validDate = (value: string) =>
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value;
  if (!validDate(start) || !validDate(end)) throw new Error("Invalid dates");
  const count = (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
  if (count < 1 || count > 31)
    throw new Error("Select a range of 1 to 31 days");
  return Array.from({ length: count }, (_, i) =>
    new Date(Date.parse(start) + i * 86400000).toISOString().slice(0, 10),
  );
}

export function nhlGameStatus(game: z.infer<typeof nhlGameSchema>): string {
  if (game.gameScheduleState === "PPD") return "Postponed";
  if (game.gameScheduleState === "CNCL") return "Cancelled";
  if (["FINAL", "OFF"].includes(game.gameState)) {
    const period =
      game.gameOutcome?.lastPeriodType ?? game.periodDescriptor?.periodType;
    return period === "OT" || period === "SO" ? `Final / ${period}` : "Final";
  }
  if (["LIVE", "CRIT"].includes(game.gameState)) {
    const period = game.periodDescriptor;
    return `Live${period ? ` · ${period.periodType === "REG" ? `P${period.number}` : period.periodType}` : ""}`;
  }
  if (game.gameScheduleState === "TBD") return "Time TBD";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Toronto",
    timeZoneName: "short",
  }).format(new Date(game.startTimeUTC));
}
