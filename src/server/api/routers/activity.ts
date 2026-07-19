import { z } from "zod";

import type {
  Contract,
  Franchise,
  Player,
  PlayerDayStatLine,
  Team,
} from "@gshl-types";
import { buildLeagueActivity } from "@gshl-utils";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { getMany } from "../sheets-store";

export const activityRouter = createTRPCRouter({
  getRecent: publicProcedure
    .input(
      z.object({
        seasonId: z.string().min(1),
        take: z.number().int().positive().max(30).default(12),
      }),
    )
    .query(async ({ input }) => {
      const [contracts, playerDays, players, teams, franchises] =
        await Promise.all([
          getMany<Contract>("Contract"),
          getMany<PlayerDayStatLine>("PlayerDayStatLine", {
            where: { seasonId: input.seasonId },
          }),
          getMany<Player>("Player"),
          getMany<Team>("Team", { where: { seasonId: input.seasonId } }),
          getMany<Franchise>("Franchise"),
        ]);

      return buildLeagueActivity({
        contracts,
        playerDays,
        players,
        teams,
        franchises,
        limit: input.take,
      });
    }),
});
