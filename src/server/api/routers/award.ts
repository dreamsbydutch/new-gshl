import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Awards } from "@gshl-types";
import { getById, getCount, getMany } from "../sheets-store";

const awardWhereSchema = z
  .object({
    id: z.string().optional(),
    seasonId: z.string().optional(),
    winnerId: z.string().optional(),
    award: z.string().optional(),
  })
  .optional();

export const awardRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: awardWhereSchema }))
    .query(async ({ input }): Promise<Awards[]> => {
      return getMany<Awards>("Awards", input);
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Awards | null> => {
      return getById<Awards>("Awards", input.id);
    }),

  count: publicProcedure
    .input(z.object({ where: awardWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Awards", input) };
    }),
});
