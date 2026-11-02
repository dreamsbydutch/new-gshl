import { z } from "zod";
import type { NHLLeader, NHLLeaderStat } from "../../types/nhl-leaders";

export const NHL_LEADERS_REFRESH_SECONDS = 600;
export const nhlLeaderSchema = z.object({
  id: z.number(),
  name: z.string(),
  team: z.string(),
  stats: z.object({
    GP: z.number(),
    G: z.number(),
    A: z.number(),
    P: z.number(),
    SOG: z.number(),
    PPP: z.number(),
    HIT: z.number(),
    BLK: z.number(),
    TOI: z.number(),
    W: z.number(),
    GA: z.number(),
    GAA: z.number().nullable(),
    SV: z.number(),
    SA: z.number(),
    SVP: z.number().nullable(),
  }),
});
export const nhlLeadersSchema = z.object({
  seasonId: z.number(),
  skaters: z.array(nhlLeaderSchema),
  goalies: z.array(nhlLeaderSchema),
});

export function selectNHLLeaders(
  players: readonly NHLLeader[],
  stat: NHLLeaderStat,
  limit: number,
) {
  const direction = stat === "GA" || stat === "GAA" ? 1 : -1;
  return [...players]
    .sort((a, b) => {
      const left = a.stats[stat];
      const right = b.stats[stat];
      if (left === null) return right === null ? a.id - b.id : 1;
      if (right === null) return -1;
      return (
        direction * (left - right) || b.stats.GP - a.stats.GP || a.id - b.id
      );
    })
    .slice(0, limit);
}

export function formatNHLLeaderStat(stat: NHLLeaderStat, value: number | null) {
  if (value === null) return "—";
  if (stat === "TOI") {
    const seconds = Math.round(value);
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  }
  if (stat === "GAA") return value.toFixed(2);
  if (stat === "SVP") return value.toFixed(3);
  return String(value);
}
