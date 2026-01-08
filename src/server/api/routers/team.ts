import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { idSchema, baseQuerySchema } from "./_schemas";
import type {
  NHLTeam,
  Player,
  Team,
  GSHLTeam,
  Franchise,
  Owner,
  Conference,
} from "@gshl-types";
import { getById, getCount, getMany } from "../sheets-store";

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
    getMany<Franchise>("Franchise", {}),
    getMany<Owner>("Owner", {}),
    getMany<Conference>("Conference", {}),
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
      const teams = await getMany<Team>("Team", {
        ...rest,
        where: normalizeConferenceFields(where),
      });

      if (!teams || teams.length === 0) {
        return [];
      }

      return enrichTeamsWithRelations(teams);
    }),

  // Get single team by ID
  getById: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<GSHLTeam | null> => {
      const team = await getById<Team>("Team", input.id);

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
      return getMany<Team>("Team", { where: { confId: input.conferenceId } });
    }),

  // Get teams by franchise
  getByFranchise: publicProcedure
    .input(z.object({ franchiseId: z.string() }))
    .query(async ({ input }): Promise<Team[]> => {
      return getMany<Team>("Team", {
        where: { franchiseId: input.franchiseId },
      });
    }),

  // Get team roster (players)
  getRoster: publicProcedure
    .input(idSchema)
    .query(async ({ input }): Promise<Player[]> => {
      return getMany<Player>("Player", { where: { teamId: input.id } });
    }),

  getNHLTeams: publicProcedure.query(async (): Promise<NHLTeam[]> => {
    // Sheet name is case-sensitive; underlying sheet is named 'NHLTeam'
    return getMany<NHLTeam>("NHLTeam");
  }),

  // Count teams
  count: publicProcedure
    .input(z.object({ where: teamWhereSchema }))
    .query(async ({ input }): Promise<{ count: number }> => {
      return {
        count: await getCount("Team", {
          where: normalizeConferenceFields(input.where),
        }),
      };
    }),
});
