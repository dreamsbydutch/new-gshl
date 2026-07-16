import { z } from "zod";
import type { PlayerAward } from "@gshl-types";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { baseQuerySchema, idSchema } from "./_schemas";
import { getById, getCount, getMany } from "../sheets-store";

const whereSchema = z
  .object({
    id: z.string().optional(),
    seasonId: z.string().optional(),
    playerId: z.string().optional(),
    gshlTeamId: z.string().optional(),
    award: z.string().optional(),
  })
  .optional();

export const playerAwardRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: whereSchema }))
    .query(
      ({ input }): Promise<PlayerAward[]> =>
        getMany<PlayerAward>("PlayerAwards", input),
    ),
  getById: publicProcedure
    .input(idSchema)
    .query(
      ({ input }): Promise<PlayerAward | null> =>
        getById<PlayerAward>("PlayerAwards", input.id),
    ),
  count: publicProcedure
    .input(z.object({ where: whereSchema }))
    .query(async ({ input }) => ({
      count: await getCount("PlayerAwards", input),
    })),
});
