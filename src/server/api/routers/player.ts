import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { minimalSheetsWriter } from "@gshl-sheets";
import { idSchema, baseQuerySchema } from "./_schemas";
import type { Player } from "@gshl-types";
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
          (player as unknown as Player).firstName
            ?.toLowerCase()
            .includes(searchTerm) ||
          (player as unknown as Player).lastName
            ?.toLowerCase()
            .includes(searchTerm),
      ) as unknown as Player[];
    }),

  // Update player
  update: publicProcedure
    .input(
      idSchema.extend({
        data: playerUpdateSchema,
      }),
    )
    .mutation(async ({ input }): Promise<Player> => {
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
