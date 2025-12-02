import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema, batchDeleteSchema } from "./_schemas";
import type { Player } from "@gshl-types";

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

const playerCreateSchema = z.object({
  yahooId: z.string().optional(),
  firstName: z.string(),
  lastName: z.string(),
  position: z.string(),
  teamId: z.number().int().optional(),
  gshlTeamId: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  nhlTeam: z.string().optional(),
  jerseyNumber: z.number().int().optional(),
  height: z.string().optional(),
  weight: z.number().optional(),
  birthDate: z.date().optional(),
  birthPlace: z.string().optional(),
  lineupPos: z.string().nullable().optional(),
});

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
      return optimizedSheetsAdapter.findMany(
        "Player",
        input,
      ) as unknown as Promise<Player[]>;
    }),

  // Get single player by ID
  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Player | null> => {
      return optimizedSheetsAdapter.findUnique("Player", {
        where: { id: input.id },
      }) as unknown as Promise<Player | null>;
    }),

  // Get players by team
  getByTeam: publicProcedure
    .input(z.object({ teamId: z.number().int() }))
    .query(async ({ input }): Promise<Player[]> => {
      return optimizedSheetsAdapter.findMany("Player", {
        where: { teamId: input.teamId },
      }) as unknown as Promise<Player[]>;
    }),

  // Get players by position
  getByPosition: publicProcedure
    .input(z.object({ position: z.string() }))
    .query(async ({ input }): Promise<Player[]> => {
      return optimizedSheetsAdapter.findMany("Player", {
        where: { position: input.position },
      }) as unknown as Promise<Player[]>;
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
      const players = await optimizedSheetsAdapter.findMany("Player", {
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

  // Create new player
  create: publicProcedure
    .input(playerCreateSchema)
    .mutation(async ({ input }): Promise<Player> => {
      const { gshlTeamId, lineupPos, ...rest } = input;
      const payload = {
        ...rest,
        ...(gshlTeamId !== undefined
          ? { gshlTeamId: normalizeGshlTeamId(gshlTeamId) }
          : {}),
        ...(lineupPos !== undefined
          ? { lineupPos: normalizeLineupPos(lineupPos) }
          : {}),
      };

      return optimizedSheetsAdapter.create("Player", {
        data: payload,
      }) as unknown as Promise<Player>;
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

      return optimizedSheetsAdapter.update("Player", {
        where: { id: input.id },
        data: payload,
      }) as unknown as Promise<Player>;
    }),

  // Delete player
  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Player> => {
      return optimizedSheetsAdapter.delete("Player", {
        where: { id: input.id },
      }) as unknown as Promise<Player>;
    }),

  // Count players
  count: publicProcedure
    .input(z.object({ where: playerWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("Player", input);
      return { count };
    }),

  // Batch operations
  batchDelete: publicProcedure
    .input(batchDeleteSchema)
    .mutation(async ({ input }): Promise<{ count: number }> => {
      return optimizedSheetsAdapter.batchDelete(
        "Player",
        input.ids.map((id) => ({ where: { id } })),
      ) as unknown as Promise<{ count: number }>;
    }),

  // Create multiple players
  createMany: publicProcedure
    .input(
      z.object({
        data: z.array(playerCreateSchema),
      }),
    )
    .mutation(async ({ input }): Promise<{ count: number }> => {
      const rows = input.data.map(({ gshlTeamId, lineupPos, ...rest }) => ({
        ...rest,
        ...(gshlTeamId !== undefined
          ? { gshlTeamId: normalizeGshlTeamId(gshlTeamId) }
          : {}),
        ...(lineupPos !== undefined
          ? { lineupPos: normalizeLineupPos(lineupPos) }
          : {}),
      }));

      return optimizedSheetsAdapter.createMany("Player", {
        data: rows,
      }) as unknown as Promise<{ count: number }>;
    }),

  // Update multiple players
  updateMany: publicProcedure
    .input(
      z.object({
        where: playerWhereSchema,
        data: playerUpdateSchema,
      }),
    )
    .mutation(async ({ input }): Promise<{ count: number }> => {
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

      return optimizedSheetsAdapter.updateMany("Player", {
        where: input.where,
        data: payload,
      }) as unknown as Promise<{ count: number }>;
    }),
});
