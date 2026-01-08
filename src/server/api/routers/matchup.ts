import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Matchup, TeamWeekStatLine } from "@gshl-types";
import { getById, getCount, getFirst, getMany } from "../sheets-store";

// Matchup router
const idStringSchema = z.coerce.string();

const matchupWhereSchema = z
  .object({
    seasonId: idStringSchema.optional(),
    weekId: idStringSchema.optional(),
    homeTeamId: idStringSchema.optional(),
    awayTeamId: idStringSchema.optional(),
  })
  .optional();

/**
 * Stat categories used for head-to-head matchup scoring
 */
const SCORING_CATEGORIES = [
  "G",
  "A",
  "P",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GAA",
  "SVP",
] as const;

/**
 * Calculate matchup score based on team week stat lines
 * Returns the number of stat categories won by each team
 */
export function calculateMatchupScores(
  homeStats: TeamWeekStatLine,
  awayStats: TeamWeekStatLine,
): { homeScore: number; awayScore: number } {
  let homeScore = 0;
  let awayScore = 0;

  for (const category of SCORING_CATEGORIES) {
    // Convert to numbers since Google Sheets returns strings
    const homeValue = Number(homeStats[category] ?? 0);
    const awayValue = Number(awayStats[category] ?? 0);

    // For GAA (lower is better), invert the comparison
    if (category === "GAA") {
      if (homeValue > 0 && awayValue > 0) {
        if (homeValue < awayValue) {
          homeScore++;
        } else if (awayValue < homeValue) {
          awayScore++;
        }
      }
    } else {
      // For all other stats (higher is better)
      if (homeValue > awayValue) {
        homeScore++;
      } else if (awayValue > homeValue) {
        awayScore++;
      }
    }
  }

  return { homeScore, awayScore };
}

export const matchupRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: matchupWhereSchema }))
    .query(async ({ input }): Promise<Matchup[]> => {
      return getMany<Matchup>("Matchup", input);
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Matchup | null> => {
      return getById<Matchup>("Matchup", input.id);
    }),

  getByWeek: publicProcedure
    .input(z.object({ weekId: idStringSchema }))
    .query(async ({ input }): Promise<Matchup[]> => {
      return getMany<Matchup>("Matchup", { where: { weekId: input.weekId } });
    }),

  getByTeam: publicProcedure
    .input(z.object({ teamId: idStringSchema }))
    .query(async ({ input }): Promise<Matchup[]> => {
      return getMany<Matchup>("Matchup", {
        where: { homeTeamId: input.teamId },
      });
    }),
  count: publicProcedure
    .input(z.object({ where: matchupWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Matchup", input) };
    }),
});
