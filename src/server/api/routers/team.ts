import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { optimizedSheetsAdapter } from "@gshl-sheets";
import { idSchema, baseQuerySchema, batchDeleteSchema } from "./_schemas";
import type {
  NHLTeam,
  Player,
  Team,
  GSHLTeam,
  Franchise,
  Owner,
  Conference,
} from "@gshl-types";

// Team-specific schemas
const teamWhereSchema = z
  .object({
    name: z.string().optional(),
    abbreviation: z.string().optional(),
    seasonId: z.string().optional(),
    franchiseId: z.string().optional(),
    conferenceId: z.string().optional(),
    isActive: z.boolean().optional(),
  })
  .optional();

const teamCreateSchema = z.object({
  name: z.string(),
  abbreviation: z.string(),
  seasonId: z.string(),
  franchiseId: z.string(),
  conferenceId: z.string(),
  isActive: z.boolean().default(true),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  city: z.string().optional(),
});

const teamUpdateSchema = z.object({
  name: z.string().optional(),
  abbreviation: z.string().optional(),
  seasonId: z.string().optional(),
  franchiseId: z.string().optional(),
  conferenceId: z.string().optional(),
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
    .query(async ({ input }): Promise<GSHLTeam[]> => {
      // Get basic team data
      const teams = (await optimizedSheetsAdapter.findMany(
        "Team",
        input,
      )) as unknown as Team[];

      if (!teams || teams.length === 0) {
        return [];
      }

      // Get related data for enrichment
      const [franchises, owners, conferences] = await Promise.all([
        optimizedSheetsAdapter.findMany(
          "Franchise",
          {},
        ) as unknown as Franchise[],
        optimizedSheetsAdapter.findMany("Owner", {}) as unknown as Owner[],
        optimizedSheetsAdapter.findMany(
          "Conference",
          {},
        ) as unknown as Conference[],
      ]);

      // Enrich team data with franchise, owner, and conference information
      return teams.map((team): GSHLTeam => {
        const franchise = franchises.find((f) => f.id === team.franchiseId);
        const owner = owners.find((o) => o.id === franchise?.ownerId);
        const conference = conferences.find((c) => c.id === team.confId);

        return {
          id: team.id,
          seasonId: team.seasonId,
          franchiseId: team.franchiseId,
          name: franchise?.name ?? null,
          abbr: franchise?.abbr ?? null,
          logoUrl: franchise?.logoUrl ?? null,
          isActive: franchise?.isActive ?? false,
          confName: conference?.name ?? null,
          confAbbr: conference?.abbr ?? null,
          confLogoUrl: conference?.logoUrl ?? null,
          ownerId: owner?.id ?? null,
          ownerFirstName: owner?.firstName ?? null,
          ownerLastName: owner?.lastName ?? null,
          ownerNickname: owner?.nickName ?? null,
          ownerEmail: owner?.email ?? null,
          ownerOwing: owner?.owing ?? null,
          ownerIsActive: owner?.isActive ?? false,
        };
      });
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
    .input(z.object({ conferenceId: z.string() }))
    .query(async ({ input }): Promise<Team[]> => {
      return optimizedSheetsAdapter.findMany("Team", {
        where: { conferenceId: input.conferenceId },
      }) as unknown as Promise<Team[]>;
    }),

  // Get teams by franchise
  getByFranchise: publicProcedure
    .input(z.object({ franchiseId: z.string() }))
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
