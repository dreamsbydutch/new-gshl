import { z } from "zod";
import type { NHLLeader, NHLLeaders } from "../lib/types/nhl-leaders";

const number = z.number().finite();
const skaterSchema = z.object({
  playerId: number,
  skaterFullName: z.string(),
  teamAbbrevs: z.string(),
  gamesPlayed: number,
  goals: number,
  assists: number,
  points: number,
  shots: number,
  ppPoints: number,
  timeOnIcePerGame: number,
});
const realtimeSchema = z.object({
  playerId: number,
  hits: number,
  blockedShots: number,
});
const goalieSchema = z.object({
  playerId: number,
  goalieFullName: z.string(),
  teamAbbrevs: z.string(),
  gamesPlayed: number,
  wins: number,
  goalsAgainst: number,
  goalsAgainstAverage: number.nullable(),
  saves: number,
  shotsAgainst: number,
  savePct: number.nullable(),
  timeOnIce: number,
});

async function readNHLStats(url: string): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error("NHL player stats unavailable");
  return response.json();
}

// The NHL caps each response at 100 rows. Stable IDs keep page boundaries consistent.
async function readReport<T>(
  report: string,
  seasonId: number,
  schema: z.ZodType<T>,
  read: (url: string) => Promise<unknown>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 0; start < 2000; start += 100) {
    const params = new URLSearchParams({
      isAggregate: "false",
      isGame: "false",
      start: String(start),
      limit: "100",
      cayenneExp: `seasonId=${seasonId} and gameTypeId=2`,
      sort: JSON.stringify([{ property: "playerId", direction: "ASC" }]),
    });
    const page = z
      .object({ data: z.array(schema), total: z.number().int().nonnegative() })
      .parse(
        await read(`https://api.nhle.com/stats/rest/en/${report}?${params}`),
      );
    rows.push(...page.data);
    if (rows.length >= page.total) return rows;
    if (!page.data.length) throw new Error("Incomplete NHL stats report");
  }
  throw new Error("NHL stats report exceeds season limit");
}

export async function loadNHLLeaders(
  seasonId: number,
  read = readNHLStats,
): Promise<NHLLeaders> {
  const [skaters, realtime, goalies] = await Promise.all([
    readReport("skater/summary", seasonId, skaterSchema, read),
    readReport("skater/realtime", seasonId, realtimeSchema, read),
    readReport("goalie/summary", seasonId, goalieSchema, read),
  ]);
  const physical = new Map(realtime.map((row) => [row.playerId, row]));
  const empty: NHLLeader["stats"] = {
    GP: 0,
    G: 0,
    A: 0,
    P: 0,
    SOG: 0,
    PPP: 0,
    HIT: 0,
    BLK: 0,
    TOI: 0,
    W: 0,
    GA: 0,
    GAA: null,
    SV: 0,
    SA: 0,
    SVP: null,
  };
  return {
    seasonId,
    skaters: skaters
      .filter((row) => row.gamesPlayed > 0)
      .map((row) => {
        const extras = physical.get(row.playerId);
        if (!extras) throw new Error("Missing NHL skater physical stats");
        return {
          id: row.playerId,
          name: row.skaterFullName,
          team: row.teamAbbrevs,
          stats: {
            ...empty,
            GP: row.gamesPlayed,
            G: row.goals,
            A: row.assists,
            P: row.points,
            SOG: row.shots,
            PPP: row.ppPoints,
            HIT: extras.hits,
            BLK: extras.blockedShots,
            TOI: Math.round(row.timeOnIcePerGame * row.gamesPlayed),
          },
        };
      }),
    goalies: goalies
      .filter((row) => row.gamesPlayed > 0)
      .map((row) => ({
        id: row.playerId,
        name: row.goalieFullName,
        team: row.teamAbbrevs,
        stats: {
          ...empty,
          GP: row.gamesPlayed,
          W: row.wins,
          GA: row.goalsAgainst,
          GAA: row.goalsAgainstAverage,
          SV: row.saves,
          SA: row.shotsAgainst,
          SVP: row.savePct,
          TOI: row.timeOnIce,
        },
      })),
  };
}
