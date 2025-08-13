import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { DraftPick } from "@gshl-types";

// Draft Pick router
const draftPickWhereSchema = z
  .object({
    playerId: z.number().int().optional(),
    teamId: z.number().int().optional(),
    seasonId: z.number().int().optional(),
    round: z.number().int().optional(),
    pick: z.number().int().optional(),
  })
  .optional();

const draftPickCreateSchema = z.object({
  playerId: z.number().int().optional(),
  teamId: z.number().int(),
  seasonId: z.number().int(),
  round: z.number().int(),
  pick: z.number().int(),
  originalTeamId: z.number().int().optional(),
});

const draftPickUpdateSchema = z.object({
  playerId: z.number().int().optional(),
  teamId: z.number().int().optional(),
  seasonId: z.number().int().optional(),
  round: z.number().int().optional(),
  pick: z.number().int().optional(),
  originalTeamId: z.number().int().optional(),
});

export const draftPickRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: draftPickWhereSchema }))
    .query(async ({ input }): Promise<DraftPick[]> => {
      return optimizedSheetsAdapter.findMany(
        "DraftPick",
        input,
      ) as unknown as Promise<DraftPick[]>;
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<DraftPick | null> => {
      return optimizedSheetsAdapter.findUnique("DraftPick", {
        where: { id: input.id },
      }) as unknown as Promise<DraftPick | null>;
    }),

  getByTeam: publicProcedure
    .input(z.object({ teamId: z.number().int() }))
    .query(async ({ input }): Promise<DraftPick[]> => {
      return optimizedSheetsAdapter.findMany("DraftPick", {
        where: { teamId: input.teamId },
      }) as unknown as Promise<DraftPick[]>;
    }),

  getBySeason: publicProcedure
    .input(z.object({ seasonId: z.number().int() }))
    .query(async ({ input }): Promise<DraftPick[]> => {
      return optimizedSheetsAdapter.findMany("DraftPick", {
        where: { seasonId: input.seasonId },
        orderBy: { round: "asc" } as any,
      }) as unknown as Promise<DraftPick[]>;
    }),

  create: publicProcedure
    .input(draftPickCreateSchema)
    .mutation(async ({ input }): Promise<DraftPick> => {
      return optimizedSheetsAdapter.create("DraftPick", {
        data: input,
      }) as unknown as Promise<DraftPick>;
    }),

  update: publicProcedure
    .input(idSchema.extend({ data: draftPickUpdateSchema }))
    .mutation(async ({ input }): Promise<DraftPick> => {
      return optimizedSheetsAdapter.update("DraftPick", {
        where: { id: input.id },
        data: input.data,
      }) as unknown as Promise<DraftPick>;
    }),

  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<DraftPick> => {
      return optimizedSheetsAdapter.delete("DraftPick", {
        where: { id: input.id },
      }) as unknown as Promise<DraftPick>;
    }),

  count: publicProcedure
    .input(z.object({ where: draftPickWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("DraftPick", input);
      return { count };
    }),
});
