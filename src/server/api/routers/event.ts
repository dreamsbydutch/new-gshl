import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Event } from "@gshl-types";

// Event router
const eventWhereSchema = z
  .object({
    seasonId: z.number().int().optional(),
    type: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

const eventCreateSchema = z.object({
  seasonId: z.number().int(),
  name: z.string(),
  type: z.string(),
  date: z.date(),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
});

const eventUpdateSchema = z.object({
  seasonId: z.number().int().optional(),
  name: z.string().optional(),
  type: z.string().optional(),
  date: z.date().optional(),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
});

export const eventRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: eventWhereSchema }))
    .query(async ({ input }): Promise<Event[]> => {
      return optimizedSheetsAdapter.findMany(
        "Event",
        input,
      ) as unknown as Promise<Event[]>;
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Event | null> => {
      return optimizedSheetsAdapter.findUnique("Event", {
        where: { id: input.id },
      }) as unknown as Promise<Event | null>;
    }),

  getBySeason: publicProcedure
    .input(z.object({ seasonId: z.number().int() }))
    .query(async ({ input }): Promise<Event[]> => {
      return optimizedSheetsAdapter.findMany("Event", {
        where: { seasonId: input.seasonId },
      }) as unknown as Promise<Event[]>;
    }),

  create: publicProcedure
    .input(eventCreateSchema)
    .mutation(async ({ input }): Promise<Event> => {
      return optimizedSheetsAdapter.create("Event", {
        data: input,
      }) as unknown as Promise<Event>;
    }),

  update: publicProcedure
    .input(idSchema.extend({ data: eventUpdateSchema }))
    .mutation(async ({ input }): Promise<Event> => {
      return optimizedSheetsAdapter.update("Event", {
        where: { id: input.id },
        data: input.data,
      }) as unknown as Promise<Event>;
    }),

  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Event> => {
      return optimizedSheetsAdapter.delete("Event", {
        where: { id: input.id },
      }) as unknown as Promise<Event>;
    }),

  count: publicProcedure
    .input(z.object({ where: eventWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("Event", input);
      return { count };
    }),
});
