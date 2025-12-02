import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { baseQuerySchema } from "./_schemas";
import {
  type PlayerDayStatLine,
  type PlayerSplitStatLine,
  type PlayerTotalStatLine,
  type PlayerWeekStatLine,
} from "@gshl-types";

// Player stats schemas
const playerStatsWhereSchema = z
  .object({
    playerId: z.string().optional(),
    seasonId: z.string().optional(),
    weekId: z.string().optional(),
    teamId: z.string().optional(),
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
        return optimizedSheetsAdapter.findMany(
          "PlayerDayStatLine",
          input,
        ) as unknown as Promise<PlayerDayStatLine[]>;
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
        return optimizedSheetsAdapter.findMany("PlayerDayStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
            ...(input.weekId && { weekId: input.weekId }),
          },
        }) as unknown as Promise<PlayerDayStatLine[]>;
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
        return optimizedSheetsAdapter.findMany("PlayerDayStatLine", {
          where: {
            weekId: input.weekId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<PlayerDayStatLine[]>;
      })
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
        return optimizedSheetsAdapter.findMany(
          "PlayerWeekStatLine",
          input,
        ) as unknown as Promise<PlayerWeekStatLine[]>;
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
        return optimizedSheetsAdapter.findMany("PlayerWeekStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<PlayerWeekStatLine[]>;
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
        return optimizedSheetsAdapter.findMany("PlayerWeekStatLine", {
          where: {
            weekId: input.weekId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<PlayerWeekStatLine[]>;
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
        return optimizedSheetsAdapter.findMany("PlayerWeekStatLine", {
          where: { seasonId: input.seasonId },
          orderBy: { [input.statType]: "desc" },
          take: input.take,
        }) as unknown as Promise<PlayerWeekStatLine[]>;
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
        return optimizedSheetsAdapter.findMany(
          "PlayerSplitStatLine",
          input,
        ) as unknown as Promise<PlayerSplitStatLine[]>;
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
        return optimizedSheetsAdapter.findMany("PlayerSplitStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<PlayerSplitStatLine[]>;
      }),

  }),

  // Season totals operations
  totals: createTRPCRouter({
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
        return optimizedSheetsAdapter.findMany(
          "PlayerTotalStatLine",
          input,
        ) as unknown as Promise<PlayerTotalStatLine[]>;
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
        return optimizedSheetsAdapter.findMany("PlayerTotalStatLine", {
          where: {
            playerId: input.playerId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<PlayerTotalStatLine[]>;
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
        return optimizedSheetsAdapter.findMany("PlayerTotalStatLine", {
          where: { seasonId: input.seasonId },
          orderBy: { [input.statType]: "desc" },
          take: input.take,
        }) as unknown as Promise<PlayerTotalStatLine[]>;
      }),
  }),
});