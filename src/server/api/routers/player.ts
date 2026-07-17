import { z } from "zod";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  ownerOrCommissionerProcedure,
  publicProcedure,
} from "../trpc";
import { minimalSheetsWriter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import { RosterPosition, type Player } from "@gshl-types";
import { getById, getCount, getMany } from "../sheets-store";

const normalizeGshlTeamId = (
  value: string | null | undefined,
): string | undefined => {
  if (value === undefined) return undefined;
  return value ?? "";
};

const normalizeLineupPos = (
  value: string | null | undefined,
): string | undefined => {
  if (value === undefined) return undefined;
  return value ?? "";
};

// Player-specific schemas
const playerWhereSchema = z
  .object({
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    position: z.string().optional(),
    teamId: z.number().int().optional(),
    gshlTeamId: z.string().optional(),
    isActive: z.boolean().optional(),
    nhlTeam: z.string().optional(),
    lineupPos: z.string().optional(),
  })
  .optional();

const playerUpdateSchema = z.object({
  yahooId: z.string().optional(),
  nhlApiId: z.string().nullable().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  position: z.string().optional(),
  teamId: z.number().int().optional(),
  gshlTeamId: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
  nhlTeam: z.string().optional(),
  jerseyNumber: z.number().int().optional(),
  height: z.string().optional(),
  weight: z.number().optional(),
  birthDate: z.date().optional(),
  birthPlace: z.string().optional(),
  lineupPos: z.string().nullable().optional(),
});

export const playerRouter = createTRPCRouter({
  // Get all players with filtering and pagination
  getAll: publicProcedure
    .input(
      baseQuerySchema.extend({
        where: playerWhereSchema,
      }),
    )
    .query(async ({ input }): Promise<Player[]> => {
      return getMany<Player>("Player", input);
    }),

  // Get single player by ID
  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Player | null> => {
      return getById<Player>("Player", input.id);
    }),

  // Get players by team
  getByTeam: publicProcedure
    .input(z.object({ teamId: z.number().int() }))
    .query(async ({ input }): Promise<Player[]> => {
      return getMany<Player>("Player", { where: { teamId: input.teamId } });
    }),

  // Get players by position
  getByPosition: publicProcedure
    .input(z.object({ position: z.string() }))
    .query(async ({ input }): Promise<Player[]> => {
      return getMany<Player>("Player", { where: { position: input.position } });
    }),

  // Search players by name
  search: publicProcedure
    .input(
      z.object({
        query: z.string(),
        take: z.number().int().positive().max(50).optional(),
      }),
    )
    .query(async ({ input }): Promise<Player[]> => {
      // This is a simple implementation - you might want to implement
      // more sophisticated search in the sheets adapter
      const players = await getMany<Player>("Player", {
        take: input.take ?? 25,
      });

      const searchTerm = input.query.toLowerCase();
      return players.filter(
        (player) =>
          player.firstName?.toLowerCase().includes(searchTerm) ||
          player.lastName?.toLowerCase().includes(searchTerm),
      );
    }),

  // Update player
  update: ownerOrCommissionerProcedure
    .input(
      idSchema.extend({
        data: playerUpdateSchema,
      }),
    )
    .mutation(async ({ ctx, input }): Promise<Player> => {
      const user = ctx.session?.user;
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED" });
      if (user.role === "owner") {
        const changedFields = Object.entries(input.data)
          .filter(([, value]) => value !== undefined)
          .map(([key]) => key);
        if (
          changedFields.length !== 1 ||
          changedFields[0] !== "lineupPos" ||
          !Object.values(RosterPosition).includes(
            input.data.lineupPos as RosterPosition,
          ) ||
          !user.ownerId
        ) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }

        const [player, franchises] = await Promise.all([
          getById<Player>("Player", input.id),
          getMany<{ id: string }>("Franchise", {
            where: { ownerId: user.ownerId, isActive: true },
          }),
        ]);
        const franchiseIds = new Set(franchises.map((franchise) => franchise.id));
        if (!player?.gshlTeamId || !franchiseIds.has(String(player.gshlTeamId))) {
          throw new TRPCError({ code: "FORBIDDEN" });
        }
      }
      const { gshlTeamId, lineupPos, ...rest } = input.data;
      const payload = {
        ...rest,
        ...(gshlTeamId !== undefined
          ? { gshlTeamId: normalizeGshlTeamId(gshlTeamId) }
          : {}),
        ...(lineupPos !== undefined
          ? { lineupPos: normalizeLineupPos(lineupPos) }
          : {}),
      };

      await minimalSheetsWriter.updateById("Player", input.id, payload);

      const updated = await getById<Player>("Player", input.id);
      if (!updated)
        throw new Error(`Player with id ${input.id} not found after update`);
      return updated;
    }),

  // Count players
  count: publicProcedure
    .input(z.object({ where: playerWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return { count: await getCount("Player", input) };
    }),
});
