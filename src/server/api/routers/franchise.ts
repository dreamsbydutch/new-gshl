import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Franchise } from "@gshl-types";
import { getById, getCount, getMany } from "../sheets-store";

// Franchise router
const franchiseWhereSchema = z
  .object({
    name: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

export const franchiseRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: franchiseWhereSchema }))
    .query(async ({ input }): Promise<Franchise[]> => {
      return getMany<Franchise>("Franchise", input);
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Franchise | null> => {
      return getById<Franchise>("Franchise", input.id);
    }),

  count: publicProcedure
    .input(z.object({ where: franchiseWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Franchise", input) };
    }),
});
