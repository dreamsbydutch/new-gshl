import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { DraftPick } from "@gshl-types";
import { minimalSheetsWriter } from "@gshl-sheets";
import { getById, getCount, getMany } from "../sheets-store";

// Draft Pick router
const draftPickWhereSchema = z
  .object({
    playerId: z.string().optional(),
    teamId: z.string().optional(),
    seasonId: z.string().optional(),
    round: z.string().optional(),
    pick: z.string().optional(),
  })
  .optional();

const draftPickUpdateSchema = z.object({
  playerId: z.string().nullable().optional(),
  teamId: z.string().optional(),
  seasonId: z.string().optional(),
  round: z.string().optional(),
  pick: z.string().optional(),
  originalTeamId: z.string().optional(),
});

export const draftPickRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: draftPickWhereSchema }))
    .query(async ({ input }): Promise<DraftPick[]> => {
      return getMany<DraftPick>("DraftPick", input);
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<DraftPick | null> => {
      return getById<DraftPick>("DraftPick", input.id);
    }),

  getByTeam: publicProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ input }): Promise<DraftPick[]> => {
      return getMany<DraftPick>("DraftPick", {
        where: { teamId: input.teamId },
      });
    }),

  getBySeason: publicProcedure
    .input(z.object({ seasonId: z.string() }))
    .query(async ({ input }): Promise<DraftPick[]> => {
      return getMany<DraftPick>("DraftPick", {
        where: { seasonId: input.seasonId },
        orderBy: { round: "asc", pick: "asc" },
      });
    }),

  update: publicProcedure
    .input(idSchema.extend({ data: draftPickUpdateSchema }))
    .mutation(async ({ input }): Promise<DraftPick> => {
      await minimalSheetsWriter.updateById("DraftPick", input.id, input.data);
      const updated = await getById<DraftPick>("DraftPick", input.id);
      if (!updated) {
        throw new Error(`DraftPick with id ${input.id} not found after update`);
      }
      return updated;
    }),

  count: publicProcedure
    .input(z.object({ where: draftPickWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("DraftPick", input) };
    }),
});
