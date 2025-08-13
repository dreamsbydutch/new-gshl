import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import { Week } from "@gshl-types";

// Week-specific schemas
const weekWhereSchema = z
  .object({
    id: z.number().int().optional(),
    seasonId: z.number().int().optional(),
    weekNum: z.number().int().optional(),
    isActive: z.boolean().optional(),
    isPlayoffs: z.boolean().optional(),
  })
  .optional();

const weekCreateSchema = z.object({
  seasonId: z.number().int(),
  weekNum: z.number().int(),
  startDate: z.date(),
  endDate: z.date(),
  isActive: z.boolean().default(false),
  isPlayoffs: z.boolean().default(false),
});

const weekUpdateSchema = z.object({
  seasonId: z.number().int().optional(),
  weekNum: z.number().int().optional(),
  startDate: z.date().optional(),
  endDate: z.date().optional(),
  isActive: z.boolean().optional(),
  isPlayoffs: z.boolean().optional(),
});

export const weekRouter = createTRPCRouter({
  // Get all weeks with filtering
  getAll: publicProcedure
    .input(
      baseQuerySchema.extend({
        where: weekWhereSchema,
      }),
    )
    .query(async ({ input }): Promise<Week[]> => {
      return optimizedSheetsAdapter.findMany(
        "Week",
        input,
      ) as unknown as Promise<Week[]>;
    }),

  // Get single week by ID
  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Week | null> => {
      return optimizedSheetsAdapter.findUnique("Week", {
        where: { id: input.id },
      }) as unknown as Promise<Week | null>;
    }),

  // Get weeks by season
  getBySeason: publicProcedure
    .input(z.object({ seasonId: z.number().int() }))
    .query(async ({ input }): Promise<Week[]> => {
      return optimizedSheetsAdapter.findMany("Week", {
        where: { seasonId: input.seasonId },
        orderBy: { weekNumber: "asc" } as any,
      }) as unknown as Promise<Week[]>;
    }),

  // Get active week
  getActive: publicProcedure.query(async (): Promise<Week | null> => {
    return optimizedSheetsAdapter.findFirst("Week", {
      where: { isActive: true },
    }) as unknown as Promise<Week | null>;
  }),

  // Create new week
  create: publicProcedure
    .input(weekCreateSchema)
    .mutation(async ({ input }): Promise<Week> => {
      return optimizedSheetsAdapter.create("Week", {
        data: input,
      }) as unknown as Promise<Week>;
    }),

  // Update week
  update: publicProcedure
    .input(
      idSchema.extend({
        data: weekUpdateSchema,
      }),
    )
    .mutation(async ({ input }): Promise<Week> => {
      return optimizedSheetsAdapter.update("Week", {
        where: { id: input.id },
        data: input.data,
      }) as unknown as Promise<Week>;
    }),

  // Delete week
  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Week> => {
      return optimizedSheetsAdapter.delete("Week", {
        where: { id: input.id },
      }) as unknown as Promise<Week>;
    }),

  // Count weeks
  count: publicProcedure
    .input(z.object({ where: weekWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("Week", input);
      return { count };
    }),
});
