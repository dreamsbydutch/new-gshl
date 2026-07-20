import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { baseQuerySchema, requireQueryScope } from "./_schemas";
import {
  type PlayerCareerSplitStatLine,
  type PlayerCareerTotalStatLine,
  type PlayerDayStatLine,
  type PlayerNHLStatLine,
  type PlayerSplitStatLine,
  type PlayerTotalStatLine,
  type PlayerWeekStatLine,
} from "@gshl-types";
import { getMany } from "../sheets-store";

// Player stats schemas
const playerStatsWhereSchema = z
  .object({
    playerId: z.string().optional(),
    seasonId: z.string().optional(),
    weekId: z.string().optional(),
    teamId: z.string().optional(),
    gshlTeamId: z.string().optional(),
    date: z.string().optional(),
    position: z.string().optional(),
  })
  .optional();

export const playerStatsRouter = createTRPCRouter({
  // Daily stats operations
  daily: createTRPCRouter({
    // Get all daily stats with filtering
    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: playerStatsWhereSchema,
        }),
      )
      .query(async ({ input }): Promise<PlayerDayStatLine[]> => {
        requireQueryScope(input.where, [
          "playerId",
          "seasonId",
          "weekId",
          "date",
        ]);
        return getMany<PlayerDayStatLine>("PlayerDayStatLine", input);
      }),

    // Get daily stats by player
    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonId: z.string().optional(),
          weekId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerDayStatLine[]> => {
        return getMany<PlayerDayStatLine>("PlayerDayStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
            ...(input.weekId && { weekId: input.weekId }),
          },
        });
      }),

    // Get daily stats by week
    getByWeek: publicProcedure
      .input(
        z.object({
          weekId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerDayStatLine[]> => {
        return getMany<PlayerDayStatLine>("PlayerDayStatLine", {
          where: {
            weekId: input.weekId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),
  }),

  // Weekly stats operations
  weekly: createTRPCRouter({
    // Get all weekly stats with filtering
    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: playerStatsWhereSchema,
        }),
      )
      .query(async ({ input }): Promise<PlayerWeekStatLine[]> => {
        requireQueryScope(input.where, ["playerId", "seasonId", "weekId"]);
        return getMany<PlayerWeekStatLine>("PlayerWeekStatLine", input);
      }),

    // Get weekly stats by player
    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerWeekStatLine[]> => {
        return getMany<PlayerWeekStatLine>("PlayerWeekStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),

    // Get weekly stats by week
    getByWeek: publicProcedure
      .input(
        z.object({
          weekId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerWeekStatLine[]> => {
        return getMany<PlayerWeekStatLine>("PlayerWeekStatLine", {
          where: {
            weekId: input.weekId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),

    // Get leaderboard
    getLeaderboard: publicProcedure
      .input(
        z.object({
          seasonId: z.string(),
          statType: z.enum(["G", "A", "P", "PIM", "PPG", "SOG", "HIT", "BLK"]),
          take: z.number().int().positive().max(100).default(25),
        }),
      )
      .query(async ({ input }): Promise<PlayerWeekStatLine[]> => {
        return getMany<PlayerWeekStatLine>("PlayerWeekStatLine", {
          where: { seasonId: input.seasonId },
          orderBy: { [input.statType]: "desc" },
          take: input.take,
        });
      }),
  }),

  // Season splits operations (player stats per team)
  splits: createTRPCRouter({
    // Get all splits
    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: z
            .object({
              playerId: z.string().optional(),
              seasonId: z.string().optional(),
              gshlTeamId: z.string().optional(),
            })
            .optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerSplitStatLine[]> => {
        requireQueryScope(input.where, ["playerId", "seasonId", "gshlTeamId"]);
        return getMany<PlayerSplitStatLine>("PlayerSplitStatLine", input);
      }),

    // Get splits by player
    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerSplitStatLine[]> => {
        return getMany<PlayerSplitStatLine>("PlayerSplitStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),
  }),

  // Season totals operations
  totals: createTRPCRouter({
    getByPlayers: publicProcedure
      .input(z.object({ playerIds: z.array(z.string().min(1)).max(500) }))
      .query(async ({ input }): Promise<PlayerTotalStatLine[]> => {
        const rows = await Promise.all(
          [...new Set(input.playerIds)].map((playerId) =>
            getMany<PlayerTotalStatLine>("PlayerTotalStatLine", {
              where: { playerId },
            }),
          ),
        );
        return rows.flat();
      }),

    // Get all season totals
    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: z
            .object({
              playerId: z.string().optional(),
              seasonId: z.string().optional(),
            })
            .optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerTotalStatLine[]> => {
        requireQueryScope(input.where, ["playerId", "seasonId"]);
        return getMany<PlayerTotalStatLine>("PlayerTotalStatLine", input);
      }),

    // Get season totals by player
    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerTotalStatLine[]> => {
        return getMany<PlayerTotalStatLine>("PlayerTotalStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),

    // Get season leaderboard
    getLeaderboard: publicProcedure
      .input(
        z.object({
          seasonId: z.string(),
          statType: z.enum(["G", "A", "P", "PIM", "PPG", "SOG", "HIT", "BLK"]),
          take: z.number().int().positive().max(100).default(25),
        }),
      )
      .query(async ({ input }): Promise<PlayerTotalStatLine[]> => {
        return getMany<PlayerTotalStatLine>("PlayerTotalStatLine", {
          where: { seasonId: input.seasonId },
          orderBy: { [input.statType]: "desc" },
          take: input.take,
        });
      }),
  }),

  careerSplits: createTRPCRouter({
    getByTeams: publicProcedure
      .input(z.object({ teamIds: z.array(z.string().min(1)).max(50) }))
      .query(async ({ input }): Promise<PlayerCareerSplitStatLine[]> => {
        const rows = await Promise.all(
          [...new Set(input.teamIds)].map((gshlTeamId) =>
            getMany<PlayerCareerSplitStatLine>("PlayerCareerSplitStatLine", {
              where: { gshlTeamId },
            }),
          ),
        );
        return rows.flat();
      }),

    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: z
            .object({
              playerId: z.string().optional(),
              gshlTeamId: z.string().optional(),
              seasonType: z.string().optional(),
            })
            .optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerCareerSplitStatLine[]> => {
        requireQueryScope(input.where, ["playerId", "gshlTeamId"]);
        return getMany<PlayerCareerSplitStatLine>(
          "PlayerCareerSplitStatLine",
          input,
        );
      }),

    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonType: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerCareerSplitStatLine[]> => {
        return getMany<PlayerCareerSplitStatLine>("PlayerCareerSplitStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonType && { seasonType: input.seasonType }),
          },
        });
      }),
  }),

  careerTotals: createTRPCRouter({
    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: z
            .object({
              playerId: z.string().optional(),
              seasonType: z.string().optional(),
            })
            .optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerCareerTotalStatLine[]> => {
        requireQueryScope(input.where, ["playerId"]);
        return getMany<PlayerCareerTotalStatLine>(
          "PlayerCareerTotalStatLine",
          input,
        );
      }),

    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonType: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerCareerTotalStatLine[]> => {
        return getMany<PlayerCareerTotalStatLine>("PlayerCareerTotalStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonType && { seasonType: input.seasonType }),
          },
        });
      }),
  }),

  nhl: createTRPCRouter({
    getByPlayers: publicProcedure
      .input(
        z.object({
          playerIds: z.array(z.string().min(1)).max(100),
        }),
      )
      .query(async ({ input }): Promise<PlayerNHLStatLine[]> => {
        const pages = await Promise.all(
          [...new Set(input.playerIds)].map((playerId) =>
            getMany<PlayerNHLStatLine>("PlayerNHLStatLine", {
              where: { playerId },
            }),
          ),
        );
        return pages.flat();
      }),

    getAll: publicProcedure
      .input(
        baseQuerySchema.extend({
          where: z
            .object({
              playerId: z.string().optional(),
              seasonId: z.string().optional(),
            })
            .optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerNHLStatLine[]> => {
        requireQueryScope(input.where, ["playerId", "seasonId"]);
        return getMany<PlayerNHLStatLine>("PlayerNHLStatLine", input);
      }),

    getByPlayer: publicProcedure
      .input(
        z.object({
          playerId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<PlayerNHLStatLine[]> => {
        return getMany<PlayerNHLStatLine>("PlayerNHLStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),
  }),
});
