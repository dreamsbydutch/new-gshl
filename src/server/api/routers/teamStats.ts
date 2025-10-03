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

// Team Day Stats Schema
const teamDayStatsCreateSchema = z.object({
  seasonId: z.string(),
  gshlTeamId: z.string(),
  weekId: z.string(),
  date: z.date(),
  GP: z.string().default("0"),
  MG: z.string().default("0"),
  IR: z.string().default("0"),
  IRplus: z.string().default("0"),
  GS: z.string().default("0"),
  G: z.string().default("0"),
  A: z.string().default("0"),
  P: z.string().default("0"),
  PM: z.string().default("0"),
  PIM: z.string().default("0"),
  PPP: z.string().default("0"),
  SOG: z.string().default("0"),
  HIT: z.string().default("0"),
  BLK: z.string().default("0"),
  W: z.string().default("0"),
  GA: z.string().default("0"),
  GAA: z.string().default("0"),
  SV: z.string().default("0"),
  SA: z.string().default("0"),
  SVP: z.string().default("0"),
  SO: z.string().default("0"),
  TOI: z.string().default("0"),
  Rating: z.string().default("0"),
  ADD: z.string().default("0"),
  MS: z.string().default("0"),
  BS: z.string().default("0"),
});

// Team Week Stats Schema
const teamWeekStatsCreateSchema = z.object({
  seasonId: z.string(),
  gshlTeamId: z.string(),
  weekId: z.string(),
  days: z.string().default("0"),
  GP: z.string().default("0"),
  MG: z.string().default("0"),
  IR: z.string().default("0"),
  IRplus: z.string().default("0"),
  GS: z.string().default("0"),
  G: z.string().default("0"),
  A: z.string().default("0"),
  P: z.string().default("0"),
  PM: z.string().default("0"),
  PIM: z.string().default("0"),
  PPP: z.string().default("0"),
  SOG: z.string().default("0"),
  HIT: z.string().default("0"),
  BLK: z.string().default("0"),
  W: z.string().default("0"),
  GA: z.string().default("0"),
  GAA: z.string().default("0"),
  SV: z.string().default("0"),
  SA: z.string().default("0"),
  SVP: z.string().default("0"),
  SO: z.string().default("0"),
  TOI: z.string().default("0"),
  Rating: z.string().default("0"),
  yearToDateRating: z.string().default("0"),
  powerRating: z.string().default("0"),
  powerRk: z.string().default("0"),
  ADD: z.string().default("0"),
  MS: z.string().default("0"),
  BS: z.string().default("0"),
});

// Team Season Stats Schema
const teamSeasonStatsCreateSchema = z.object({
  seasonId: z.string(),
  seasonType: z.nativeEnum(SeasonType),
  gshlTeamId: z.string(),
  days: z.string().default("0"),
  GP: z.string().default("0"),
  MG: z.string().default("0"),
  IR: z.string().default("0"),
  IRplus: z.string().default("0"),
  GS: z.string().default("0"),
  G: z.string().default("0"),
  A: z.string().default("0"),
  P: z.string().default("0"),
  PM: z.string().default("0"),
  PIM: z.string().default("0"),
  PPP: z.string().default("0"),
  SOG: z.string().default("0"),
  HIT: z.string().default("0"),
  BLK: z.string().default("0"),
  W: z.string().default("0"),
  GA: z.string().default("0"),
  GAA: z.string().default("0"),
  SV: z.string().default("0"),
  SA: z.string().default("0"),
  SVP: z.string().default("0"),
  SO: z.string().default("0"),
  TOI: z.string().default("0"),
  Rating: z.string().default("0"),
  ADD: z.string().default("0"),
  MS: z.string().default("0"),
  BS: z.string().default("0"),
  teamW: z.string().default("0"),
  teamL: z.string().default("0"),
  teamHW: z.string().default("0"),
  teamHL: z.string().default("0"),
  streak: z.string().default(""),
  powerRk: z.string().default("0"),
  powerRating: z.string().default("0"),
  prevPowerRk: z.string().default("0"),
  prevPowerRating: z.string().default("0"),
  overallRk: z.string().default("0"),
  conferenceRk: z.string().default("0"),
  wildcardRk: z.number().optional(),
  losersTournRk: z.number().optional(),
  playersUsed: z.number().default(0),
  norrisRating: z.number().optional(),
  norrisRk: z.number().optional(),
  vezinaRating: z.number().optional(),
  vezinaRk: z.number().optional(),
  calderRating: z.number().optional(),
  calderRk: z.number().optional(),
  jackAdamsRating: z.number().optional(),
  jackAdamsRk: z.number().optional(),
  GMOYRating: z.number().optional(),
  GMOYRk: z.number().optional(),
});

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

    create: publicProcedure
      .input(teamDayStatsCreateSchema)
      .mutation(async ({ input }): Promise<TeamDayStatLine> => {
        return optimizedSheetsAdapter.create("TeamDayStatLine", {
          data: input,
        }) as unknown as Promise<TeamDayStatLine>;
      }),

    createMany: publicProcedure
      .input(
        z.object({
          data: z.array(teamDayStatsCreateSchema),
        }),
      )
      .mutation(async ({ input }): Promise<{ count: number }> => {
        return optimizedSheetsAdapter.createMany("TeamDayStatLine", {
          data: input.data,
        });
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
          weekId: z.number().int(),
          seasonId: z.number().int().optional(),
        }),
      )
      .query(async ({ input }): Promise<TeamWeekStatLine[]> => {
        return optimizedSheetsAdapter.findMany("TeamWeekStatLine", {
          where: {
            weekId: input.weekId,
            ...(input.seasonId && { seasonId: input.seasonId }),
          },
        }) as unknown as Promise<TeamWeekStatLine[]>;
      }),

    create: publicProcedure
      .input(teamWeekStatsCreateSchema)
      .mutation(async ({ input }): Promise<TeamWeekStatLine> => {
        return optimizedSheetsAdapter.create("TeamWeekStatLine", {
          data: input,
        }) as unknown as Promise<TeamWeekStatLine>;
      }),

    createMany: publicProcedure
      .input(
        z.object({
          data: z.array(teamWeekStatsCreateSchema),
        }),
      )
      .mutation(async ({ input }): Promise<{ count: number }> => {
        return optimizedSheetsAdapter.createMany("TeamWeekStatLine", {
          data: input.data,
        });
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

    create: publicProcedure
      .input(teamSeasonStatsCreateSchema)
      .mutation(async ({ input }): Promise<TeamSeasonStatLine> => {
        return optimizedSheetsAdapter.create("TeamSeasonStatLine", {
          data: input,
        }) as unknown as Promise<TeamSeasonStatLine>;
      }),

    createMany: publicProcedure
      .input(
        z.object({
          data: z.array(teamSeasonStatsCreateSchema),
        }),
      )
      .mutation(async ({ input }): Promise<{ count: number }> => {
        return optimizedSheetsAdapter.createMany("TeamSeasonStatLine", {
          data: input.data,
        });
      }),
  }),
});
