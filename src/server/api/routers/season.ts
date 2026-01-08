import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Season } from "@gshl-types";
import { getById, getCount, getFirst, getMany } from "../sheets-store";

// Season-specific schemas
const seasonWhereSchema = z
  .object({
    year: z.number().int().optional(),
    isActive: z.boolean().optional(),
    name: z.string().optional(),
  })
  .optional();

export const seasonRouter = createTRPCRouter({
  // Get all seasons with filtering and pagination
  getAll: publicProcedure
    .input(
      baseQuerySchema.extend({
        where: seasonWhereSchema,
      }),
    )
    .query(async ({ input }): Promise<Season[]> => {
      return getMany<Season>("Season", input);
    }),

  // Get single season by ID
  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Season | null> => {
      return getById<Season>("Season", input.id);
    }),

  // Get active season
  getActive: publicProcedure.query(async (): Promise<Season | null> => {
    return getFirst<Season>("Season", { where: { isActive: true } });
  }),

  // Count seasons
  count: publicProcedure
    .input(z.object({ where: seasonWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Season", input) };
    }),
});
