import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { baseQuerySchema } from "./_schemas";
import {
  type TeamDayStatLine,
  type TeamSeasonStatLine,
  type TeamWeekStatLine,
  SeasonType,
} from "@gshl-types";

// Team Stats router
const teamStatsWhereSchema = z
  .object({
    gshlTeamId: z.string().optional(),
    seasonId: z.string().optional(),
    weekId: z.string().optional(),
    seasonType: z.nativeEnum(SeasonType).optional(),
  })
  .optional();


export const teamStatsRouter = createTRPCRouter({
  // Daily team stats
  daily: createTRPCRouter({
    getAll: publicProcedure
      .input(baseQuerySchema.extend({ where: teamStatsWhereSchema }))
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany(
          "TeamDayStatLine",
          input,
        ) as unknown as Promise<TeamDayStatLine[]>;
      }),

    getByTeam: publicProcedure
      .input(
        z.object({
          gshlTeamId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamDayStatLine", {
          where: {
            gshlTeamId: input.gshlTeamId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamDayStatLine[]>;
      }),

    getByWeek: publicProcedure
      .input(
        z.object({
          weekId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamDayStatLine", {
          where: {
            weekId: input.weekId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamDayStatLine[]>;
      }),

    getByDate: publicProcedure
      .input(
        z.object({
          date: z.date(),
          seasonId: z.number().int().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamDayStatLine", {
          where: {
            date: input.date,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamDayStatLine[]>;
      }),

  }),

  // Weekly team stats
  weekly: createTRPCRouter({
    getAll: publicProcedure
      .input(baseQuerySchema.extend({ where: teamStatsWhereSchema }))
      .query(async ({ input }): Promise<TeamWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany(
          "TeamWeekStatLine",
          input,
        ) as unknown as Promise<TeamWeekStatLine[]>;
      }),

    getByTeam: publicProcedure
      .input(
        z.object({
          gshlTeamId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamWeekStatLine", {
          where: {
            gshlTeamId: input.gshlTeamId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamWeekStatLine[]>;
      }),

    getByWeek: publicProcedure
      .input(
        z.object({
          weekId: z.union([z.number().int(), z.string()]),
          seasonId: z.union([z.number().int(), z.string()]).optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamWeekStatLine", {
          where: {
            weekId: String(input.weekId),
            ...(input.seasonId && { seasonId: String(input.seasonId) }),
          },
        }) as unknown as Promise<TeamWeekStatLine[]>;
      }),
  }),

  // Season totals
  season: createTRPCRouter({
    getAll: publicProcedure
      .input(baseQuerySchema.extend({ where: teamStatsWhereSchema }))
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return optimizedSheetsAdapter.findMany(
          "TeamSeasonStatLine",
          input,
        ) as unknown as Promise<TeamSeasonStatLine[]>;
      }),

    getByTeam: publicProcedure
      .input(
        z.object({
          gshlTeamId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamSeasonStatLine", {
          where: {
            gshlTeamId: input.gshlTeamId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamSeasonStatLine[]>;
      }),

    getBySeason: publicProcedure
      .input(z.object({ seasonId: z.number().int() }))
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamSeasonStatLine", {
          where: { seasonId: input.seasonId },
        }) as unknown as Promise<TeamSeasonStatLine[]>;
      }),

    getBySeasonType: publicProcedure
      .input(
        z.object({
          seasonId: z.number().int(),
          seasonType: z.nativeEnum(SeasonType),
        }),
      )
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamSeasonStatLine", {
          where: {
            seasonId: input.seasonId,
            seasonType: input.seasonType,
          },
        }) as unknown as Promise<TeamSeasonStatLine[]>;
      }),

  }),
});
