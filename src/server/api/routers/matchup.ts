import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Matchup, TeamWeekStatLine } from "@gshl-types";

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

const matchupCreateSchema = z.object({
  seasonId: idStringSchema,
  weekId: idStringSchema,
  homeTeamId: idStringSchema,
  awayTeamId: idStringSchema,
  homeScore: z.number().optional(),
  awayScore: z.number().optional(),
  isComplete: z.boolean().default(false),
});

const matchupUpdateSchema = z.object({
  seasonId: idStringSchema.optional(),
  weekId: idStringSchema.optional(),
  homeTeamId: idStringSchema.optional(),
  awayTeamId: idStringSchema.optional(),
  homeScore: z.number().optional(),
  awayScore: z.number().optional(),
  isComplete: z.boolean().optional(),
});

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
      return optimizedSheetsAdapter.findMany(
        "Matchup",
        input,
      ) as unknown as Promise<Matchup[]>;
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Matchup | null> => {
      return optimizedSheetsAdapter.findUnique("Matchup", {
        where: { id: input.id },
      }) as unknown as Promise<Matchup | null>;
    }),

  getByWeek: publicProcedure
    .input(z.object({ weekId: idStringSchema }))
    .query(async ({ input }): Promise<Matchup[]> => {
      return optimizedSheetsAdapter.findMany("Matchup", {
        where: { weekId: input.weekId },
      }) as unknown as Promise<Matchup[]>;
    }),

  getByTeam: publicProcedure
    .input(z.object({ teamId: idStringSchema }))
    .query(async ({ input }): Promise<Matchup[]> => {
      return optimizedSheetsAdapter.findMany("Matchup", {
        where: { homeTeamId: input.teamId },
      }) as unknown as Promise<Matchup[]>;
    }),

  create: publicProcedure
    .input(matchupCreateSchema)
    .mutation(async ({ input }): Promise<Matchup> => {
      return optimizedSheetsAdapter.create("Matchup", {
        data: input,
      }) as unknown as Promise<Matchup>;
    }),

  update: publicProcedure
    .input(idSchema.extend({ data: matchupUpdateSchema }))
    .mutation(async ({ input }): Promise<Matchup> => {
      return optimizedSheetsAdapter.update("Matchup", {
        where: { id: input.id },
        data: input.data,
      }) as unknown as Promise<Matchup>;
    }),

  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Matchup> => {
      return optimizedSheetsAdapter.delete("Matchup", {
        where: { id: input.id },
      }) as unknown as Promise<Matchup>;
    }),

  count: publicProcedure
    .input(z.object({ where: matchupWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("Matchup", input);
      return { count };
    }),

  /**
   * Update matchup scores based on team week stat lines
   * Fetches the home and away team's TeamWeekStatLine records for the matchup's week,
   * compares them across all scoring categories, and updates the matchup with scores
   */
  updateScores: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Matchup> => {
      // 1. Get the matchup
      const matchup = (await optimizedSheetsAdapter.findUnique("Matchup", {
        where: { id: input.id },
      })) as unknown as Matchup | null;

      if (!matchup) {
        throw new Error(`Matchup with id ${input.id} not found`);
      }

      // 2. Get team week stat lines for both teams
      const [homeTeamStats, awayTeamStats] = await Promise.all([
        optimizedSheetsAdapter.findFirst("TeamWeekStatLine", {
          where: {
            gshlTeamId: matchup.homeTeamId,
            weekId: matchup.weekId,
          },
        }) as unknown as Promise<TeamWeekStatLine | null>,
        optimizedSheetsAdapter.findFirst("TeamWeekStatLine", {
          where: {
            gshlTeamId: matchup.awayTeamId,
            weekId: matchup.weekId,
          },
        }) as unknown as Promise<TeamWeekStatLine | null>,
      ]);

      if (!homeTeamStats) {
        throw new Error(
          `TeamWeekStatLine not found for home team ${matchup.homeTeamId} in week ${matchup.weekId}`,
        );
      }

      if (!awayTeamStats) {
        throw new Error(
          `TeamWeekStatLine not found for away team ${matchup.awayTeamId} in week ${matchup.weekId}`,
        );
      }

      // 3. Calculate scores
      const { homeScore, awayScore } = calculateMatchupScores(
        homeTeamStats,
        awayTeamStats,
      );

      // 4. Determine winner (home team wins ties)
      const homeWin = homeScore >= awayScore;
      const awayWin = awayScore > homeScore;

      // 5. Update the matchup
      return optimizedSheetsAdapter.update("Matchup", {
        where: { id: input.id },
        data: {
          homeScore,
          awayScore,
          homeWin,
          awayWin,
          isComplete: true,
        },
      }) as unknown as Promise<Matchup>;
    }),

  /**
   * Batch update scores for multiple matchups
   */
  updateScoresBatch: publicProcedure
    .input(
      z.object({
        matchupIds: z.array(idStringSchema),
      }),
    )
    .mutation(
      async ({
        input,
      }): Promise<{
        updated: number;
        errors: Array<{ id: string; error: string }>;
      }> => {
        const results = {
          updated: 0,
          errors: [] as Array<{ id: string; error: string }>,
        };

        for (const matchupId of input.matchupIds) {
          try {
            await optimizedSheetsAdapter.findUnique("Matchup", {
              where: { id: matchupId },
            });

            // Re-use the updateScores logic
            const matchup = (await optimizedSheetsAdapter.findUnique(
              "Matchup",
              {
                where: { id: matchupId },
              },
            )) as unknown as Matchup | null;

            if (!matchup) {
              results.errors.push({
                id: matchupId,
                error: "Matchup not found",
              });
              continue;
            }

            const [homeTeamStats, awayTeamStats] = await Promise.all([
              optimizedSheetsAdapter.findFirst("TeamWeekStatLine", {
                where: {
                  gshlTeamId: matchup.homeTeamId,
                  weekId: matchup.weekId,
                },
              }) as unknown as Promise<TeamWeekStatLine | null>,
              optimizedSheetsAdapter.findFirst("TeamWeekStatLine", {
                where: {
                  gshlTeamId: matchup.awayTeamId,
                  weekId: matchup.weekId,
                },
              }) as unknown as Promise<TeamWeekStatLine | null>,
            ]);

            if (!homeTeamStats || !awayTeamStats) {
              results.errors.push({
                id: matchupId,
                error: "Team stats not found",
              });
              continue;
            }

            const { homeScore, awayScore } = calculateMatchupScores(
              homeTeamStats,
              awayTeamStats,
            );

            const homeWin = homeScore >= awayScore;
            const awayWin = awayScore > homeScore;

            await optimizedSheetsAdapter.update("Matchup", {
              where: { id: matchupId },
              data: {
                homeScore,
                awayScore,
                homeWin,
                awayWin,
                isComplete: true,
              },
            });

            results.updated++;
          } catch (error) {
            results.errors.push({
              id: matchupId,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        return results;
      },
    ),

  /**
   * Update scores for all matchups in a specific week
   */
  updateScoresByWeek: publicProcedure
    .input(z.object({ weekId: idStringSchema }))
    .mutation(
      async ({
        input,
      }): Promise<{
        updated: number;
        errors: Array<{ id: string; error: string }>;
      }> => {
        // Get all matchups for the week
        const matchups = (await optimizedSheetsAdapter.findMany("Matchup", {
          where: { weekId: input.weekId },
        })) as unknown as Matchup[];

        // Use the batch update logic
        const results = {
          updated: 0,
          errors: [] as Array<{ id: string; error: string }>,
        };

        for (const matchup of matchups) {
          try {
            const [homeTeamStats, awayTeamStats] = await Promise.all([
              optimizedSheetsAdapter.findFirst("TeamWeekStatLine", {
                where: {
                  gshlTeamId: matchup.homeTeamId,
                  weekId: matchup.weekId,
                },
              }) as unknown as Promise<TeamWeekStatLine | null>,
              optimizedSheetsAdapter.findFirst("TeamWeekStatLine", {
                where: {
                  gshlTeamId: matchup.awayTeamId,
                  weekId: matchup.weekId,
                },
              }) as unknown as Promise<TeamWeekStatLine | null>,
            ]);

            if (!homeTeamStats || !awayTeamStats) {
              results.errors.push({
                id: matchup.id,
                error: "Team stats not found",
              });
              continue;
            }

            const { homeScore, awayScore } = calculateMatchupScores(
              homeTeamStats,
              awayTeamStats,
            );

            const homeWin = homeScore >= awayScore;
            const awayWin = awayScore > homeScore;

            await optimizedSheetsAdapter.update("Matchup", {
              where: { id: matchup.id },
              data: {
                homeScore,
                awayScore,
                homeWin,
                awayWin,
                isComplete: true,
              },
            });

            results.updated++;
          } catch (error) {
            results.errors.push({
              id: matchup.id,
              error: error instanceof Error ? error.message : "Unknown error",
            });
          }
        }

        return results;
      },
    ),
});
