import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Matchup } from "@gshl-types";

// Matchup router
const matchupWhereSchema = z
  .object({
    seasonId: z.number().int().optional(),
    weekId: z.number().int().optional(),
    homeTeamId: z.number().int().optional(),
    awayTeamId: z.number().int().optional(),
  })
  .optional();

const matchupCreateSchema = z.object({
  seasonId: z.number().int(),
  weekId: z.number().int(),
  homeTeamId: z.number().int(),
  awayTeamId: z.number().int(),
  homeScore: z.number().optional(),
  awayScore: z.number().optional(),
  isComplete: z.boolean().default(false),
});

const matchupUpdateSchema = z.object({
  seasonId: z.number().int().optional(),
  weekId: z.number().int().optional(),
  homeTeamId: z.number().int().optional(),
  awayTeamId: z.number().int().optional(),
  homeScore: z.number().optional(),
  awayScore: z.number().optional(),
  isComplete: z.boolean().optional(),
});

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
    .input(z.object({ weekId: z.number().int() }))
    .query(async ({ input }): Promise<Matchup[]> => {
      return optimizedSheetsAdapter.findMany("Matchup", {
        where: { weekId: input.weekId },
      }) as unknown as Promise<Matchup[]>;
    }),

  getByTeam: publicProcedure
    .input(z.object({ teamId: z.number().int() }))
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
});
