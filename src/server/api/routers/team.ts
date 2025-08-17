import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema, batchDeleteSchema } from "./_schemas";
import type { NHLTeam, Player, Team } from "@gshl-types";

// Team-specific schemas
const teamWhereSchema = z
  .object({
    name: z.string().optional(),
    abbreviation: z.string().optional(),
    seasonId: z.number().int().optional(),
    franchiseId: z.number().int().optional(),
    conferenceId: z.number().int().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

const teamCreateSchema = z.object({
  name: z.string(),
  abbreviation: z.string(),
  seasonId: z.number().int(),
  franchiseId: z.number().int(),
  conferenceId: z.number().int(),
  isActive: z.boolean().default(true),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  city: z.string().optional(),
});

const teamUpdateSchema = z.object({
  name: z.string().optional(),
  abbreviation: z.string().optional(),
  seasonId: z.number().int().optional(),
  franchiseId: z.number().int().optional(),
  conferenceId: z.number().int().optional(),
  isActive: z.boolean().optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  city: z.string().optional(),
});

export const teamRouter = createTRPCRouter({
  // Get all teams with filtering and pagination
  getAll: publicProcedure
    .input(
      baseQuerySchema.extend({
        where: teamWhereSchema,
      }),
    )
    .query(async ({ input }): Promise<Team[]> => {
      return optimizedSheetsAdapter.findMany(
        "Team",
        input,
      ) as unknown as Promise<Team[]>;
    }),

  // Get single team by ID
  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Team | null> => {
      return optimizedSheetsAdapter.findUnique("Team", {
        where: { id: input.id },
      }) as unknown as Promise<Team | null>;
    }),

  // Get teams by conference
  getByConference: publicProcedure
    .input(z.object({ conferenceId: z.number().int() }))
    .query(async ({ input }): Promise<Team[]> => {
      return optimizedSheetsAdapter.findMany("Team", {
        where: { conferenceId: input.conferenceId },
      }) as unknown as Promise<Team[]>;
    }),

  // Get teams by franchise
  getByFranchise: publicProcedure
    .input(z.object({ franchiseId: z.number().int() }))
    .query(async ({ input }): Promise<Team[]> => {
      return optimizedSheetsAdapter.findMany("Team", {
        where: { franchiseId: input.franchiseId },
      }) as unknown as Promise<Team[]>;
    }),

  // Get team roster (players)
  getRoster: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Player[]> => {
      return optimizedSheetsAdapter.findMany("Player", {
        where: { teamId: input.id },
      }) as unknown as Promise<Player[]>;
    }),

  getNHLTeams: publicProcedure.query(async (): Promise<NHLTeam[]> => {
    // Sheet name is case-sensitive; underlying sheet is named 'NHLTeam'
    return optimizedSheetsAdapter.findMany("NHLTeam") as unknown as Promise<
      NHLTeam[]
    >;
  }),

  // Create new team
  create: publicProcedure
    .input(teamCreateSchema)
    .mutation(async ({ input }): Promise<Team> => {
      return optimizedSheetsAdapter.create("Team", {
        data: input,
      }) as unknown as Promise<Team>;
    }),

  // Update team
  update: publicProcedure
    .input(
      idSchema.extend({
        data: teamUpdateSchema,
      }),
    )
    .mutation(async ({ input }): Promise<Team> => {
      return optimizedSheetsAdapter.update("Team", {
        where: { id: input.id },
        data: input.data,
      }) as unknown as Promise<Team>;
    }),

  // Delete team
  delete: publicProcedure
    .input(idSchema)
    .mutation(async ({ input }): Promise<Team> => {
      return optimizedSheetsAdapter.delete("Team", {
        where: { id: input.id },
      }) as unknown as Promise<Team>;
    }),

  // Count teams
  count: publicProcedure
    .input(z.object({ where: teamWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      const count = await optimizedSheetsAdapter.count("Team", input);
      return { count };
    }),

  // Batch operations
  batchDelete: publicProcedure
    .input(batchDeleteSchema)
    .mutation(async ({ input }): Promise<{ count: number }> => {
      return optimizedSheetsAdapter.batchDelete(
        "Team",
        input.ids.map((id) => ({ where: { id } })),
      ) as unknown as Promise<{ count: number }>;
    }),

  // Create multiple teams
  createMany: publicProcedure
    .input(
      z.object({
        data: z.array(teamCreateSchema),
      }),
    )
    .mutation(async ({ input }): Promise<{ count: number }> => {
      return optimizedSheetsAdapter.createMany("Team", {
        data: input.data,
      }) as unknown as Promise<{ count: number }>;
    }),
});
