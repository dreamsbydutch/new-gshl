import { z } from "zod";
import type { TeamAward } from "@gshl-types";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { baseQuerySchema, idSchema } from "./_schemas";
import { getById, getCount, getMany } from "../sheets-store";

const whereSchema = z
  .object({
    id: z.string().optional(),
    seasonId: z.string().optional(),
    gshlTeamId: z.string().optional(),
    award: z.string().optional(),
  })
  .optional();

export const teamAwardRouter = createTRPCRouter({
  getAll: publicProcedure
    .input(baseQuerySchema.extend({ where: whereSchema }))
    .query(
      ({ input }): Promise<TeamAward[]> =>
        getMany<TeamAward>("TeamAwards", input),
    ),
  getById: publicProcedure
    .input(idSchema)
    .query(
      ({ input }): Promise<TeamAward | null> =>
        getById<TeamAward>("TeamAwards", input.id),
    ),
  count: publicProcedure
    .input(z.object({ where: whereSchema }))
    .query(async ({ input }) => ({
      count: await getCount("TeamAwards", input),
    })),
});
