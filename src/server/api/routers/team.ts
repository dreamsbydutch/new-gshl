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
const teamWhereFiltersSchema = z.object({
  name: z.string().optional(),
  abbreviation: z.string().optional(),
  seasonId: z.string().optional(),
  franchiseId: z.string().optional(),
  conferenceId: z.string().optional(),
  isActive: z.boolean().optional(),
  yahooId: z.string().optional(),
  confId: z.string().optional(),
});

const teamWhereSchema = teamWhereFiltersSchema.optional();

const teamCreateSchema = z
  .object({
    name: z.string(),
    abbreviation: z.string(),
    seasonId: z.string(),
    franchiseId: z.string(),
    conferenceId: z.string().optional(),
    confId: z.string().optional(),
    isActive: z.boolean().default(true),
    yahooId: z.string().optional(),
    logoUrl: z.string().optional(),
    primaryColor: z.string().optional(),
    secondaryColor: z.string().optional(),
    city: z.string().optional(),
  })
  .refine(
    (data) => {
      const resolved = data.confId ?? data.conferenceId;
      return typeof resolved === "string" && resolved.trim().length > 0;
    },
    {
      message: "confId or conferenceId is required",
      path: ["confId"],
    },
  );

const teamUpdateSchema = z.object({
  name: z.string().optional(),
  abbreviation: z.string().optional(),
  seasonId: z.string().optional(),
  franchiseId: z.string().optional(),
  conferenceId: z.string().optional(),
  confId: z.string().optional(),
  isActive: z.boolean().optional(),
  yahooId: z.string().optional(),
  logoUrl: z.string().optional(),
  primaryColor: z.string().optional(),
  secondaryColor: z.string().optional(),
  city: z.string().optional(),
});

type ConferenceFieldPayload = {
  confId?: string | null;
  conferenceId?: string | null;
  [key: string]: unknown;
};

const hasEntityId = <T extends { id?: string | number | null }>(
  entity: T,
): entity is T & { id: string | number } => {
  return typeof entity.id === "string" || typeof entity.id === "number";
};

const normalizeIdString = (
  value: string | number | null | undefined,
): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }
  if (typeof value === "number") {
    return value.toString();
  }
  return undefined;
};

function normalizeConferenceFields<T extends ConferenceFieldPayload>(
  payload?: T | null,
): (Omit<T, "conferenceId"> & { confId?: string | null }) | undefined {
  if (!payload) return undefined;
  const { conferenceId, ...rest } = payload;
  const normalized = {
    ...rest,
  } as Omit<T, "conferenceId"> & { confId?: string | null };

  if (!normalizeIdString(normalized.confId) && conferenceId) {
    normalized.confId = normalizeIdString(conferenceId) ?? null;
  }

  return normalized;
}

async function enrichTeamsWithRelations(teams: Team[]): Promise<GSHLTeam[]> {
  if (!teams.length) return [];

  const [franchises, owners, conferences] = await Promise.all([
    optimizedSheetsAdapter.findMany("Franchise", {}) as unknown as Franchise[],
    optimizedSheetsAdapter.findMany("Owner", {}) as unknown as Owner[],
    optimizedSheetsAdapter.findMany(
      "Conference",
      {},
    ) as unknown as Conference[],
  ]);

  const franchiseMap = new Map(
    franchises
      .filter(hasEntityId)
      .map((franchise) => [franchise.id.toString(), franchise]),
  );

  const ownerMap = new Map(
    owners.filter(hasEntityId).map((owner) => [owner.id.toString(), owner]),
  );

  const conferenceMap = new Map(
    conferences
      .filter(hasEntityId)
      .map((conference) => [conference.id.toString(), conference]),
  );

  return teams.map((team): GSHLTeam => {
    const teamFranchiseId = normalizeIdString(team.franchiseId);
    const franchise = teamFranchiseId
      ? franchiseMap.get(teamFranchiseId)
      : undefined;
    const ownerId = normalizeIdString(franchise?.ownerId);
    const owner = ownerId ? ownerMap.get(ownerId) : undefined;
    const resolvedConfId =
      normalizeIdString(team.confId) ??
      normalizeIdString(franchise?.confId) ??
      null;
    const conference = resolvedConfId
      ? conferenceMap.get(resolvedConfId)
      : undefined;

    return {
      id: team.id,
      seasonId: team.seasonId,
      franchiseId: team.franchiseId,
      name: franchise?.name ?? null,
      abbr: franchise?.abbr ?? null,
      logoUrl: franchise?.logoUrl ?? null,
      isActive: franchise?.isActive ?? false,
      yahooId: team?.yahooId ?? null,
      confId: resolvedConfId,
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
}

export const teamRouter = createTRPCRouter({
  // Get all teams with filtering and pagination
  getAll: publicProcedure
    .input(
      baseQuerySchema.extend({
        where: teamWhereSchema,
      }),
    )
    .query(async ({ input }): Promise<GSHLTeam[]> => {
      const { where, ...rest } = input;
      const teams = (await optimizedSheetsAdapter.findMany("Team", {
        ...rest,
        where: normalizeConferenceFields(where),
      })) as unknown as Team[];

      if (!teams || teams.length === 0) {
        return [];
      }

      return enrichTeamsWithRelations(teams);
    }),

  // Get single team by ID
  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<GSHLTeam | null> => {
      const team = (await optimizedSheetsAdapter.findUnique("Team", {
        where: { id: input.id },
      })) as unknown as Team | null;

      if (!team) {
        return null;
      }

      const [enriched] = await enrichTeamsWithRelations([team]);
      return enriched ?? null;
    }),

  // Get teams by conference
  getByConference: publicProcedure
    .input(z.object({ conferenceId: z.string() }))
    .query(async ({ input }): Promise<Team[]> => {
      return optimizedSheetsAdapter.findMany("Team", {
        where: { confId: input.conferenceId },
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
      const normalized = normalizeConferenceFields(input)!;
      return optimizedSheetsAdapter.create("Team", {
        data: normalized as unknown as Omit<
          Team,
          "id" | "createdAt" | "updatedAt"
        >,
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
      const normalizedData = normalizeConferenceFields(input.data) ?? {};
      return optimizedSheetsAdapter.update("Team", {
        where: { id: input.id },
        data: normalizedData as unknown as Partial<Team>,
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
      const count = await optimizedSheetsAdapter.count("Team", {
        where: normalizeConferenceFields(input.where),
      });
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
      const normalizedData = input.data
        .map((entry) => normalizeConferenceFields(entry))
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
      return optimizedSheetsAdapter.createMany("Team", {
        data: normalizedData as unknown as Array<
          Omit<Team, "id" | "createdAt" | "updatedAt">
        >,
      }) as unknown as Promise<{ count: number }>;
    }),
});
