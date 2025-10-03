import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { DraftPick } from "@gshl-types";

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

const draftPickCreateSchema = z.object({
  playerId: z.string().optional(),
  teamId: z.string(),
  seasonId: z.string(),
  round: z.string(),
  pick: z.string(),
  originalTeamId: z.string().optional(),
});

const draftPickUpdateSchema = z.object({
  playerId: z.string().optional(),
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
    .input(z.object({ teamId: z.string() }))
    .query(async ({ input }): Promise<DraftPick[]> => {
      return optimizedSheetsAdapter.findMany("DraftPick", {
        where: { teamId: input.teamId },
      }) as unknown as Promise<DraftPick[]>;
    }),

  getBySeason: publicProcedure
    .input(z.object({ seasonId: z.string() }))
    .query(async ({ input }): Promise<DraftPick[]> => {
      const picksRaw = await optimizedSheetsAdapter.findMany("DraftPick", {
        where: { seasonId: input.seasonId },
      });
      const picks = (picksRaw as DraftPick[])
        .slice()
        .sort((a, b) => +a.round - +b.round || +a.pick - +b.pick);
      return picks;
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
