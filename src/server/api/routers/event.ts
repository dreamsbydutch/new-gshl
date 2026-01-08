import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Event } from "@gshl-types";
import { getById, getCount, getMany } from "../sheets-store";

// Event router
const eventWhereSchema = z
  .object({
    seasonId: z.number().int().optional(),
    type: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

export const eventRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: eventWhereSchema }))
    .query(async ({ input }): Promise<Event[]> => {
      return getMany<Event>("Event", input);
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Event | null> => {
      return getById<Event>("Event", input.id);
    }),

  getBySeason: publicProcedure
    .input(z.object({ seasonId: z.number().int() }))
    .query(async ({ input }): Promise<Event[]> => {
      return getMany<Event>("Event", { where: { seasonId: input.seasonId } });
    }),

  count: publicProcedure
    .input(z.object({ where: eventWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Event", input) };
    }),
});
