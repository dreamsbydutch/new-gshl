import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { baseQuerySchema } from "./_schemas";
import {
  type PlayerDayStatLine,
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
});
