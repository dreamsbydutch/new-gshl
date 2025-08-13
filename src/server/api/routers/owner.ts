import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Owner } from "@gshl-types";

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

const ownerCreateSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  nickName: z.string(),
  email: z.string().email().optional(),
  owing: z.number().default(0),
  isActive: z.boolean().default(true),
});

const ownerUpdateSchema = z.object({
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  nickName: z.string().optional(),
  email: z.string().email().optional(),
  owing: z.number().optional(),
  isActive: z.boolean().optional(),
});

export const ownerRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: ownerWhereSchema }))
    .query(async ({ input }): Promise<Owner[]> => {
      return optimizedSheetsAdapter.findMany(
        "Owner",
        input,
      ) as unknown as Promise<Owner[]>;
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Owner | null> => {
      return optimizedSheetsAdapter.findUnique("Owner", {
        where: { id: input.id },
      }) as unknown as Promise<Owner | null>;
    }),

  create: publicProcedure
    .input(ownerCreateSchema)
    .mutation(async ({ input }): Promise<Owner> => {
      return optimizedSheetsAdapter.create("Owner", {
        data: input,
      }) as unknown as Promise<Owner>;
    }),

  update: publicProcedure
    .input(idSchema.extend({ data: ownerUpdateSchema }))
    .mutation(async ({ input }): Promise<Owner> => {
      return optimizedSheetsAdapter.update("Owner", {
        where: { id: input.id },
        data: input.data,
      }) as unknown as Promise<Owner>;
    }),

  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Owner> => {
      return optimizedSheetsAdapter.delete("Owner", {
        where: { id: input.id },
      }) as unknown as Promise<Owner>;
    }),

  count: publicProcedure
    .input(z.object({ where: ownerWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("Owner", input);
      return { count };
    }),
});
