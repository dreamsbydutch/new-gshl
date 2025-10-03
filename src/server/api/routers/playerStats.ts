import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { baseQuerySchema } from "./_schemas";
import type {
  PlayerDayStatLine,
  PlayerTotalStatLine,
  PlayerWeekStatLine,
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

const playerDayStatsCreateSchema = z.object({
  playerId: z.string(),
  seasonId: z.string(),
  weekId: z.string(),
  gshlTeamId: z.string(),
  date: z.date(),
  nhlPos: z.string(),
  posGroup: z.string(),
  nhlTeam: z.string(),
  GP: z.string().default("0"),
  G: z.string().default("0"),
  A: z.string().default("0"),
  P: z.string().default("0"),
  PM: z.string().default("0"),
  PIM: z.string().default("0"),
  PPG: z.string().default("0"),
  PPA: z.string().default("0"),
  SHG: z.string().default("0"),
  SHA: z.string().default("0"),
  GWG: z.string().default("0"),
  GTG: z.string().default("0"),
  SOG: z.string().default("0"),
  HIT: z.string().default("0"),
  BLK: z.string().default("0"),
  // Add other stat fields as needed
});

const playerWeekStatsCreateSchema = z.object({
  playerId: z.string(),
  seasonId: z.string(),
  weekId: z.string(),
  gshlTeamId: z.string(),
  position: z.string(),
  GP: z.string().default("0"),
  G: z.string().default("0"),
  A: z.string().default("0"),
  P: z.string().default("0"),
  PM: z.string().default("0"),
  PIM: z.string().default("0"),
  PPG: z.string().default("0"),
  PPA: z.string().default("0"),
  SHG: z.string().default("0"),
  SHA: z.string().default("0"),
  GWG: z.string().default("0"),
  GTG: z.string().default("0"),
  SOG: z.string().default("0"),
  HIT: z.string().default("0"),
  BLK: z.string().default("0"),
  // Add other stat fields as needed
});

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
      }),

    // Create daily stats
    create: publicProcedure
      .input(playerDayStatsCreateSchema)
      .mutation(async ({ input }): Promise<PlayerDayStatLine> => {
        return optimizedSheetsAdapter.create("PlayerDayStatLine", {
          data: input,
        }) as unknown as Promise<PlayerDayStatLine>;
      }),

    // Batch create daily stats
    createMany: publicProcedure
      .input(
        z.object({
          data: z.array(playerDayStatsCreateSchema),
        }),
      )
      .mutation(async ({ input }): Promise<{ count: number }> => {
        return optimizedSheetsAdapter.createMany("PlayerDayStatLine", {
          data: input.data,
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

    // Create weekly stats
    create: publicProcedure
      .input(playerWeekStatsCreateSchema)
      .mutation(async ({ input }): Promise<PlayerWeekStatLine> => {
        return optimizedSheetsAdapter.create("PlayerWeekStatLine", {
          data: input,
        }) as unknown as Promise<PlayerWeekStatLine>;
      }),

    // Batch create weekly stats
    createMany: publicProcedure
      .input(
        z.object({
          data: z.array(playerWeekStatsCreateSchema),
        }),
      )
      .mutation(async ({ input }): Promise<{ count: number }> => {
        return optimizedSheetsAdapter.createMany("PlayerWeekStatLine", {
          data: input.data,
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
