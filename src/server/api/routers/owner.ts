import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Owner } from "@gshl-types";
import { getById, getCount, getMany } from "../sheets-store";

// Owner router
const ownerWhereSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    nickName: z.string().optional(),
    email: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

export const ownerRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: ownerWhereSchema }))
    .query(async ({ input }): Promise<Owner[]> => {
      return getMany<Owner>("Owner", input);
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Owner | null> => {
      return getById<Owner>("Owner", input.id);
    }),

  count: publicProcedure
    .input(z.object({ where: ownerWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Owner", input) };
    }),
});
