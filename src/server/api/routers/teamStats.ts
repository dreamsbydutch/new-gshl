import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { baseQuerySchema } from "./_schemas";
import {
  type TeamDayStatLine,
  type TeamSeasonStatLine,
  type TeamWeekStatLine,
  SeasonType,
} from "@gshl-types";
import { getMany } from "../sheets-store";

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
        return getMany<TeamDayStatLine>("TeamDayStatLine", input);
      }),

    getByTeam: publicProcedure
      .input(
        z.object({
          gshlTeamId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return getMany<TeamDayStatLine>("TeamDayStatLine", {
          where: {
            gshlTeamId: input.gshlTeamId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),

    getByWeek: publicProcedure
      .input(
        z.object({
          weekId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return getMany<TeamDayStatLine>("TeamDayStatLine", {
          where: {
            weekId: input.weekId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),

    getByDate: publicProcedure
      .input(
        z.object({
          date: z.date(),
          seasonId: z.number().int().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamDayStatLine[]> => {
        return getMany<TeamDayStatLine>("TeamDayStatLine", {
          where: {
            date: input.date,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),
  }),

  // Weekly team stats
  weekly: createTRPCRouter({
    getAll: publicProcedure
      .input(baseQuerySchema.extend({ where: teamStatsWhereSchema }))
      .query(async ({ input }): Promise<TeamWeekStatLine[]> => {
        return getMany<TeamWeekStatLine>("TeamWeekStatLine", input);
      }),

    getByTeam: publicProcedure
      .input(
        z.object({
          gshlTeamId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamWeekStatLine[]> => {
        return getMany<TeamWeekStatLine>("TeamWeekStatLine", {
          where: {
            gshlTeamId: input.gshlTeamId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),

    getByWeek: publicProcedure
      .input(
        z.object({
          weekId: z.union([z.number().int(), z.string()]),
          seasonId: z.union([z.number().int(), z.string()]).optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamWeekStatLine[]> => {
        return getMany<TeamWeekStatLine>("TeamWeekStatLine", {
          where: {
            weekId: String(input.weekId),
            ...(input.seasonId && { seasonId: String(input.seasonId) }),
          },
        });
      }),
  }),

  // Season totals
  season: createTRPCRouter({
    getAll: publicProcedure
      .input(baseQuerySchema.extend({ where: teamStatsWhereSchema }))
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return getMany<TeamSeasonStatLine>("TeamSeasonStatLine", input);
      }),

    getByTeam: publicProcedure
      .input(
        z.object({
          gshlTeamId: z.string(),
          seasonId: z.string().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return getMany<TeamSeasonStatLine>("TeamSeasonStatLine", {
          where: {
            gshlTeamId: input.gshlTeamId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        });
      }),

    getBySeason: publicProcedure
      .input(z.object({ seasonId: z.number().int() }))
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return getMany<TeamSeasonStatLine>("TeamSeasonStatLine", {
          where: { seasonId: input.seasonId },
        });
      }),

    getBySeasonType: publicProcedure
      .input(
        z.object({
          seasonId: z.number().int(),
          seasonType: z.nativeEnum(SeasonType),
        }),
      )
      .query(async ({ input }): Promise<TeamSeasonStatLine[]> => {
        return getMany<TeamSeasonStatLine>("TeamSeasonStatLine", {
          where: {
            seasonId: input.seasonId,
            seasonType: input.seasonType,
          },
        });
      }),
  }),
});
