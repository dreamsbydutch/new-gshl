import { z } from "zod";
import {
  commissionerProcedure,
  createTRPCRouter,
  publicProcedure,
} from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Season } from "@gshl-types";
import { getById, getCount, getFirst, getMany } from "../sheets-store";
import { minimalSheetsWriter } from "@gshl-sheets";

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

  setDraftStartAt: commissionerProcedure
    .input(
      z.object({
        seasonId: z.string().min(1),
        draftStartAt: z.string().datetime({ offset: true }),
      }),
    )
    .mutation(async ({ input }) => {
      const draftStartAt = new Date(input.draftStartAt).toISOString();
      await minimalSheetsWriter.updateById("Season", input.seasonId, {
        draftStartAt,
        updatedAt: new Date(),
      });
      return { seasonId: input.seasonId, draftStartAt };
    }),

  backfillLegacyDraftStart: commissionerProcedure.mutation(async () => {
    const season = await getFirst<Season>("Season", { where: { year: 2025 } });
    if (!season || season.draftStartAt) return { updated: false };
    const draftStartAt = "2025-10-05T00:00:00.000Z";
    await minimalSheetsWriter.updateById("Season", season.id, {
      draftStartAt,
      updatedAt: new Date(),
    });
    return { updated: true, seasonId: season.id, draftStartAt };
  }),

  // Count seasons
  count: publicProcedure
    .input(z.object({ where: seasonWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Season", input) };
    }),
});
