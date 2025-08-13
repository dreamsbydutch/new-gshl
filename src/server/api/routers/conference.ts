import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { baseQuerySchema, idSchema } from "./_schemas";
import { Conference } from "@gshl-types";
import { optimizedSheetsAdapter } from "@gshl-sheets";

// Conference router
const conferenceWhereSchema = z
  .object({
    name: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

const conferenceCreateSchema = z.object({
  name: z.string(),
  isActive: z.boolean().default(true),
});

const conferenceUpdateSchema = z.object({
  name: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const conferenceRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: conferenceWhereSchema }))
    .query(async ({ input }): Promise<Conference[]> => {
      return optimizedSheetsAdapter.findMany(
        "Conference",
        input,
      ) as unknown as Promise<Conference[]>;
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Conference | null> => {
      return optimizedSheetsAdapter.findUnique("Conference", {
        where: { id: input.id },
      }) as unknown as Promise<Conference | null>;
    }),

  create: publicProcedure
    .input(conferenceCreateSchema)
    .mutation(async ({ input }): Promise<Conference> => {
      return optimizedSheetsAdapter.create("Conference", {
        data: input,
      }) as unknown as Promise<Conference>;
    }),

  update: publicProcedure
    .input(idSchema.extend({ data: conferenceUpdateSchema }))
    .mutation(async ({ input }): Promise<Conference> => {
      return optimizedSheetsAdapter.update("Conference", {
        where: { id: input.id },
        data: input.data,
      }) as unknown as Promise<Conference>;
    }),

  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Conference> => {
      return optimizedSheetsAdapter.delete("Conference", {
        where: { id: input.id },
      }) as unknown as Promise<Conference>;
    }),

  count: publicProcedure
    .input(z.object({ where: conferenceWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("Conference", input);
      return { count };
    }),
});
