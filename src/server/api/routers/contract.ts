import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Contract } from "@gshl-types";

// Contract router
const contractWhereSchema = z
  .object({
    playerId: z.number().int().optional(),
    teamId: z.number().int().optional(),
    seasonId: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

const contractCreateSchema = z.object({
  playerId: z.number().int(),
  teamId: z.number().int(),
  seasonId: z.number().int(),
  salary: z.number().optional(),
  years: z.number().int().optional(),
  isActive: z.boolean().default(true),
});

const contractUpdateSchema = z.object({
  playerId: z.number().int().optional(),
  teamId: z.number().int().optional(),
  seasonId: z.number().int().optional(),
  salary: z.number().optional(),
  years: z.number().int().optional(),
  isActive: z.boolean().optional(),
});

export const contractRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: contractWhereSchema }))
    .query(async ({ input }): Promise<Contract[]> => {
      return optimizedSheetsAdapter.findMany(
        "Contract",
        input,
      ) as unknown as Promise<Contract[]>;
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Contract | null> => {
      return optimizedSheetsAdapter.findUnique("Contract", {
        where: { id: input.id },
      }) as unknown as Promise<Contract | null>;
    }),

  getByPlayer: publicProcedure
    .input(z.object({ playerId: z.number().int() }))
    .query(async ({ input }): Promise<Contract[]> => {
      return optimizedSheetsAdapter.findMany("Contract", {
        where: { playerId: input.playerId },
      }) as unknown as Promise<Contract[]>;
    }),

  getByTeam: publicProcedure
    .input(z.object({ teamId: z.number().int() }))
    .query(async ({ input }): Promise<Contract[]> => {
      return optimizedSheetsAdapter.findMany("Contract", {
        where: { teamId: input.teamId },
      }) as unknown as Promise<Contract[]>;
    }),

  create: publicProcedure
    .input(contractCreateSchema)
    .mutation(async ({ input }): Promise<Contract> => {
      return optimizedSheetsAdapter.create("Contract", {
        data: input,
      }) as unknown as Promise<Contract>;
    }),

  update: publicProcedure
    .input(idSchema.extend({ data: contractUpdateSchema }))
    .mutation(async ({ input }): Promise<Contract> => {
      return optimizedSheetsAdapter.update("Contract", {
        where: { id: input.id },
        data: input.data,
      }) as unknown as Promise<Contract>;
    }),

  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Contract> => {
      return optimizedSheetsAdapter.delete("Contract", {
        where: { id: input.id },
      }) as unknown as Promise<Contract>;
    }),

  count: publicProcedure
    .input(z.object({ where: contractWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("Contract", input);
      return { count };
    }),
});
