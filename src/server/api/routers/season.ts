import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema, batchDeleteSchema } from "./_schemas";
import { Season } from "@gshl-types";

// Season-specific schemas
const seasonWhereSchema = z
  .object({
    year: z.number().int().optional(),
    isActive: z.boolean().optional(),
    name: z.string().optional(),
  })
  .optional();

const seasonCreateSchema = z.object({
  year: z.number().int(),
  name: z.string(),
  isActive: z.boolean().default(false),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

const seasonUpdateSchema = z.object({
  year: z.number().int().optional(),
  name: z.string().optional(),
  isActive: z.boolean().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
});

export const seasonRouter = createTRPCRouter({
  // Get all seasons with filtering and pagination
  getAll: publicProcedure
    .input(
      baseQuerySchema.extend({
        where: seasonWhereSchema,
      }),
    )
    .query(async ({ input }): Promise<Season[]> => {
      return optimizedSheetsAdapter.findMany(
        "Season",
        input,
      ) as unknown as Promise<Season[]>;
    }),

  // Get single season by ID
  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Season | null> => {
      return optimizedSheetsAdapter.findUnique("Season", {
        where: { id: input.id },
      }) as unknown as Promise<Season | null>;
    }),

  // Get active season
  getActive: publicProcedure.query(async (): Promise<Season | null> => {
    return optimizedSheetsAdapter.findFirst("Season", {
      where: { isActive: true },
    }) as unknown as Promise<Season | null>;
  }),

  // Create new season
  create: publicProcedure
    .input(seasonCreateSchema)
    .mutation(async ({ input }): Promise<Season> => {
      return optimizedSheetsAdapter.create("Season", {
        data: input,
      }) as unknown as Promise<Season>;
    }),

  // Update season
  update: publicProcedure
    .input(
      idSchema.extend({
        data: seasonUpdateSchema,
      }),
    )
    .mutation(async ({ input }): Promise<Season> => {
      return optimizedSheetsAdapter.update("Season", {
        where: { id: input.id },
        data: input.data,
      }) as unknown as Promise<Season>;
    }),

  // Delete season
  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Season> => {
      return optimizedSheetsAdapter.delete("Season", {
        where: { id: input.id },
      }) as unknown as Promise<Season>;
    }),

  // Count seasons
  count: publicProcedure
    .input(z.object({ where: seasonWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("Season", input);
      return { count };
    }),

  // Batch delete seasons
  batchDelete: publicProcedure
    .input(batchDeleteSchema)
    .mutation(async ({ input }): Promise<{ count: number }> => {
      return optimizedSheetsAdapter.batchDelete(
        "Season",
        input.ids.map((id) => ({ where: { id } })),
      ) as unknown as Promise<{ count: number }>;
    }),
});
