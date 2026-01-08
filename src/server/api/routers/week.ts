import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Week } from "@gshl-types";
import { getById, getCount, getFirst, getMany } from "../sheets-store";

// Week-specific schemas
const weekWhereSchema = z
  .object({
    id: z.string().optional(),
    seasonId: z.string().optional(),
    weekNum: z.number().int().optional(),
    isActive: z.boolean().optional(),
    isPlayoffs: z.boolean().optional(),
  })
  .optional();

export const weekRouter = createTRPCRouter({
  // Get all weeks with filtering
  getAll: publicProcedure
    .input(
      baseQuerySchema.extend({
        where: weekWhereSchema,
      }),
    )
    .query(async ({ input }): Promise<Week[]> => {
      return getMany<Week>("Week", input);
    }),

  // Get single week by ID
  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Week | null> => {
      return getById<Week>("Week", input.id);
    }),

  // Get weeks by season
  getBySeason: publicProcedure
    .input(z.object({ seasonId: z.string() }))
    .query(async ({ input }): Promise<Week[]> => {
      return getMany<Week>("Week", {
        where: { seasonId: input.seasonId },
        orderBy: { weekNum: "asc" },
      });
    }),

  // Get active week
  getActive: publicProcedure.query(async (): Promise<Week | null> => {
    return getFirst<Week>("Week", { where: { isActive: true } });
  }),

  // Count weeks
  count: publicProcedure
    .input(z.object({ where: weekWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Week", input) };
    }),
});
