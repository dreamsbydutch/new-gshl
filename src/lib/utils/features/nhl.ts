import { z } from "zod";

export const NHL_STANDINGS_REFRESH_SECONDS = 24 * 60 * 60;
export const NHL_SCHEDULE_REFRESH_SECONDS = 15 * 60;

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
});
export const nhlScheduleResponseSchema = nhlScheduleSchema.extend({
  updatedAt: z.number(),
});

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
