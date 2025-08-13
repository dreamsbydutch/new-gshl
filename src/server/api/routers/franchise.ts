import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Franchise } from "@gshl-types";

// Franchise router
const franchiseWhereSchema = z
  .object({
    name: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

const franchiseCreateSchema = z.object({
  name: z.string(),
  isActive: z.boolean().default(true),
});

const franchiseUpdateSchema = z.object({
  name: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const franchiseRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: franchiseWhereSchema }))
    .query(async ({ input }): Promise<Franchise[]> => {
      return optimizedSheetsAdapter.findMany(
        "Franchise",
        input,
      ) as unknown as Promise<Franchise[]>;
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Franchise | null> => {
      return optimizedSheetsAdapter.findUnique("Franchise", {
        where: { id: input.id },
      }) as unknown as Promise<Franchise | null>;
    }),

  create: publicProcedure
    .input(franchiseCreateSchema)
    .mutation(async ({ input }): Promise<Franchise> => {
      return optimizedSheetsAdapter.create("Franchise", {
        data: input,
      }) as unknown as Promise<Franchise>;
    }),

  update: publicProcedure
    .input(idSchema.extend({ data: franchiseUpdateSchema }))
    .mutation(async ({ input }): Promise<Franchise> => {
      return optimizedSheetsAdapter.update("Franchise", {
        where: { id: input.id },
        data: input.data,
      }) as unknown as Promise<Franchise>;
    }),

  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Franchise> => {
      return optimizedSheetsAdapter.delete("Franchise", {
        where: { id: input.id },
      }) as unknown as Promise<Franchise>;
    }),

  count: publicProcedure
    .input(z.object({ where: franchiseWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("Franchise", input);
      return { count };
    }),
});
