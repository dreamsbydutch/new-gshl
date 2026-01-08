import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Contract } from "@gshl-types";
import { getById, getCount, getMany } from "../sheets-store";

// Contract router
const contractWhereSchema = z
  .object({
    playerId: z.string().optional(),
    teamId: z.string().optional(),
    seasonId: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

export const contractRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: contractWhereSchema }))
    .query(async ({ input }): Promise<Contract[]> => {
      return getMany<Contract>("Contract", input);
    }),

  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Contract | null> => {
      return getById<Contract>("Contract", input.id);
    }),

  getByPlayer: publicProcedure
    .input(z.object({ playerId: z.string() }))
    .query(async ({ input }): Promise<Contract[]> => {
      return getMany<Contract>("Contract", {
        where: { playerId: input.playerId },
      });
    }),

  getByTeam: publicProcedure
    .input(z.object({ teamId: z.string() }))
    .query(async ({ input }): Promise<Contract[]> => {
      return getMany<Contract>("Contract", { where: { teamId: input.teamId } });
    }),

  count: publicProcedure
    .input(z.object({ where: contractWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Contract", input) };
    }),
});
