import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { baseQuerySchema, idSchema } from "./_schemas";
import type { Conference } from "@gshl-types";
import { getById, getCount, getMany } from "../sheets-store";

// Conference router
const conferenceWhereSchema = z
  .object({
    name: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

export const conferenceRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: conferenceWhereSchema }))
    .query(async ({ input }): Promise<Conference[]> => {
      return getMany<Conference>("Conference", input);
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Conference | null> => {
      return getById<Conference>("Conference", input.id);
    }),

  count: publicProcedure
    .input(z.object({ where: conferenceWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Conference", input) };
    }),
});
