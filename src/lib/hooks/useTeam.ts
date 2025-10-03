import { clientApi as api } from "@gshl-trpc";
import type {
  GSHLTeam,
  TeamDayStatLine,
  TeamWeekStatLine,
  TeamSeasonStatLine,
  NHLTeam,
} from "@gshl-types";
import { SeasonType } from "@gshl-types";

type HookError = { message: string } | null;

// Enhanced franchise type with additional computed properties
export interface EnrichedFranchise {
  id: string;
  name: string;
  abbr: string;
  logoUrl: string;
  isActive: boolean;
  confId: string;
  confName: string | null;
  confAbbr: string | null;
  confLogoUrl: string | null;
  ownerId: string;
  ownerFirstName: string | null;
  ownerLastName: string | null;
  ownerNickname: string | null;
  ownerEmail: string | null;
  ownerOwing: number | null;
  ownerIsActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function useAllTeams(): {
  data: GSHLTeam[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teams,
    isLoading: isLoadingTeams,
    error: errorTeams,
  } = api.team.getAll.useQuery({ orderBy: { seasonId: "asc" } });
  const {
    data: franchises,
    isLoading: isLoadingFranchises,
    error: errorFranchises,
  } = api.franchise.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: conferences,
    isLoading: isLoadingConferences,
    error: errorConferences,
  } = api.conference.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: owners,
    isLoading: isLoadingOwners,
    error: errorOwners,
  } = api.owner.getAll.useQuery({ orderBy: { name: "asc" } });
  return {
    data:
      teams?.map((t) => {
        const franchise = franchises?.find((f) => f.id === t.franchiseId);
        const conference = conferences?.find((c) => c.name === t.confName);
        const owner = owners?.find((o) => o.id === franchise?.ownerId);
        return {
          id: t.id,
          seasonId: t.seasonId,
          franchiseId: t.franchiseId,
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
      }) ?? [],
    isLoading: [
      isLoadingTeams,
      isLoadingFranchises,
      isLoadingConferences,
      isLoadingOwners,
    ].some(Boolean),
    error:
      [errorTeams, errorFranchises, errorConferences, errorOwners].find(
        (e) => e,
      ) ?? null,
  };
}

export function useTeamById(teamId: string): {
  data: GSHLTeam;
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: team,
    isLoading: isTeamLoading,
    error: errorTeam,
  } = api.team.getById.useQuery({ id: teamId });
  const {
    data: franchise,
    isLoading: isLoadingFranchise,
    error: errorFranchise,
  } = api.franchise.getById.useQuery({ id: team?.franchiseId ?? "0" });
  const {
    data: conference,
    isLoading: isLoadingConference,
    error: errorConference,
  } = api.conference.getById.useQuery({ id: team?.confId ?? "0" });
  const {
    data: owner,
    isLoading: isLoadingOwner,
    error: errorOwner,
  } = api.owner.getById.useQuery({ id: franchise?.ownerId ?? "0" });
  return {
    data: {
      id: team?.id ?? "0",
      seasonId: team?.seasonId ?? "0",
      franchiseId: team?.franchiseId ?? "0",
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
    },
    isLoading: [
      isTeamLoading,
      isLoadingFranchise,
      isLoadingConference,
      isLoadingOwner,
    ].some(Boolean),
    error:
      [errorTeam, errorFranchise, errorConference, errorOwner].find((e) => e) ??
      null,
  };
}

export function useTeamsBySeasonId(seasonId: string): {
  data: GSHLTeam[];
  isLoading: boolean;
  error: HookError;
} {
  // Debug logging
  console.log("useTeamsBySeasonId called with:", {
    seasonId,
    type: typeof seasonId,
  });

  const {
    data: teams,
    isLoading: isTeamsLoading,
    error: errorTeams,
  } = api.team.getAll.useQuery(
    {
      where: { seasonId: String(seasonId) },
      orderBy: { seasonId: "asc" },
    },
    {
      enabled: !!seasonId && seasonId !== "",
    },
  );

  // Debug the API response
  console.log("team.getAll API response:", {
    teams: teams?.length,
    isLoading: isTeamsLoading,
    error: errorTeams,
    actualTeams: teams?.map((t) => ({
      id: t.id,
      seasonId: t.seasonId,
      name: t.name,
    })),
  });

  // Temporary debug: also try without seasonId filter to see if any teams exist
  const { data: allTeamsDebug } = api.team.getAll.useQuery({
    orderBy: { seasonId: "asc" },
  });

  console.log("All teams without filter:", {
    count: allTeamsDebug?.length,
    teams: allTeamsDebug?.map((t) => ({
      id: t.id,
      seasonId: t.seasonId,
      name: t.name,
    })),
  });
  const {
    data: franchises,
    isLoading: isLoadingFranchises,
    error: errorFranchises,
  } = api.franchise.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: conferences,
    isLoading: isLoadingConferences,
    error: errorConferences,
  } = api.conference.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: owners,
    isLoading: isLoadingOwners,
    error: errorOwners,
  } = api.owner.getAll.useQuery({ orderBy: { name: "asc" } });
  return {
    data:
      teams?.map((t) => {
        const franchise = franchises?.find((f) => f.id === t.franchiseId);
        const conference = conferences?.find((c) => c.name === t.confName);
        const owner = owners?.find((o) => o.id === franchise?.ownerId);
        return {
          id: t.id,
          seasonId: t.seasonId,
          franchiseId: t.franchiseId,
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
      }) ?? [],
    isLoading: [
      isTeamsLoading,
      isLoadingFranchises,
      isLoadingConferences,
      isLoadingOwners,
    ].some(Boolean),
    error:
      [errorTeams, errorFranchises, errorConferences, errorOwners].find(
        (e) => e,
      ) ?? null,
  };
}

export function useTeamsByFranchiseId(franchiseId: string): {
  data: GSHLTeam[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teams,
    isLoading: isTeamsLoading,
    error: errorTeams,
  } = api.team.getAll.useQuery({
    where: { franchiseId: String(franchiseId) },
    orderBy: { seasonId: "asc" },
  });
  const {
    data: franchise,
    isLoading: isFranchiseLoading,
    error: errorFranchise,
  } = api.franchise.getById.useQuery({ id: franchiseId });
  const {
    data: conference,
    isLoading: isConferenceLoading,
    error: errorConference,
  } = api.conference.getById.useQuery({ id: franchise?.confId ?? "0" });
  const {
    data: owner,
    isLoading: isOwnerLoading,
    error: errorOwner,
  } = api.owner.getById.useQuery({ id: franchise?.ownerId ?? "0" });
  return {
    data:
      teams?.map((t) => {
        return {
          id: t.id,
          seasonId: t.seasonId,
          franchiseId: t.franchiseId,
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
      }) ?? [],
    isLoading: [
      isTeamsLoading,
      isFranchiseLoading,
      isConferenceLoading,
      isOwnerLoading,
    ].some(Boolean),
    error:
      [errorTeams, errorFranchise, errorConference, errorOwner].find(
        (e) => e,
      ) ?? null,
  };
}

export function useTeamsByOwnerId(ownerId: string): {
  data: GSHLTeam[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teams,
    isLoading: isTeamsLoading,
    error: errorTeams,
  } = api.team.getAll.useQuery({ orderBy: { seasonId: "asc" } });
  const {
    data: franchises,
    isLoading: isFranchiseLoading,
    error: errorFranchise,
  } = api.franchise.getAll.useQuery({});
  const {
    data: conferences,
    isLoading: isConferenceLoading,
    error: errorConference,
  } = api.conference.getAll.useQuery({});
  const {
    data: owner,
    isLoading: isOwnerLoading,
    error: errorOwner,
  } = api.owner.getById.useQuery({ id: ownerId ?? "0" });
  return {
    data:
      teams
        ?.map((t) => {
          const franchise = franchises?.find((f) => f.id === t.franchiseId);
          if (franchise?.ownerId !== ownerId) return null;
          const conference = conferences?.find((c) => c.name === t.confName);
          return {
            id: t.id,
            seasonId: t.seasonId,
            franchiseId: t.franchiseId,
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
        })
        .filter((team): team is NonNullable<typeof team> => team !== null) ??
      [],
    isLoading: [
      isTeamsLoading,
      isFranchiseLoading,
      isConferenceLoading,
      isOwnerLoading,
    ].some(Boolean),
    error:
      [errorTeams, errorFranchise, errorConference, errorOwner].find(
        (e) => e,
      ) ?? null,
  };
}

// ============================================================================
// TEAM DAYS HOOKS
// ============================================================================

export function useAllTeamDays(): {
  data: TeamDayStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamDays,
    isLoading,
    error,
  } = api.teamStats.daily.getAll.useQuery({});

  return {
    data: teamDays ?? [],
    isLoading,
    error,
  };
}

export function useTeamDaysByTeamId(gshlTeamId: string): {
  data: TeamDayStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamDays,
    isLoading,
    error,
  } = api.teamStats.daily.getByTeam.useQuery({ gshlTeamId });

  return {
    data: teamDays ?? [],
    isLoading,
    error,
  };
}

export function useTeamDaysByWeekId(weekId: string): {
  data: TeamDayStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamDays,
    isLoading,
    error,
  } = api.teamStats.daily.getByWeek.useQuery({ weekId });

  return {
    data: teamDays ?? [],
    isLoading,
    error,
  };
}

export function useTeamDaysByDate(date: Date): {
  data: TeamDayStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamDays,
    isLoading,
    error,
  } = api.teamStats.daily.getByDate.useQuery({ date });

  return {
    data: teamDays ?? [],
    isLoading,
    error,
  };
}

export function useTeamDaysByTeamAndSeason(
  gshlTeamId: string,
  seasonId: string,
): {
  data: TeamDayStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamDays,
    isLoading,
    error,
  } = api.teamStats.daily.getByTeam.useQuery({ gshlTeamId, seasonId });

  return {
    data: teamDays ?? [],
    isLoading,
    error,
  };
}

// ============================================================================
// TEAM WEEKS HOOKS
// ============================================================================

export function useAllTeamWeeks(): {
  data: TeamWeekStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamWeeks,
    isLoading,
    error,
  } = api.teamStats.weekly.getAll.useQuery({});

  return {
    data: teamWeeks ?? [],
    isLoading,
    error,
  };
}

export function useTeamWeeksByTeamId(gshlTeamId: string): {
  data: TeamWeekStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamWeeks,
    isLoading,
    error,
  } = api.teamStats.weekly.getByTeam.useQuery({ gshlTeamId });

  return {
    data: teamWeeks ?? [],
    isLoading,
    error,
  };
}

export function useTeamWeeksByWeekId(weekId: string): {
  data: TeamWeekStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamWeeks,
    isLoading,
    error,
  } = api.teamStats.weekly.getByWeek.useQuery({ weekId: +weekId });

  return {
    data: teamWeeks ?? [],
    isLoading,
    error,
  };
}

export function useTeamWeeksBySeasonId(seasonId: string): {
  data: TeamWeekStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamWeeks,
    isLoading,
    error,
  } = api.teamStats.weekly.getAll.useQuery({
    where: { seasonId: String(seasonId) },
  });

  return {
    data: teamWeeks ?? [],
    isLoading,
    error,
  };
}

export function useTeamWeeksByTeamAndSeason(
  gshlTeamId: string,
  seasonId: string,
): {
  data: TeamWeekStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamWeeks,
    isLoading,
    error,
  } = api.teamStats.weekly.getByTeam.useQuery({ gshlTeamId, seasonId });

  return {
    data: teamWeeks ?? [],
    isLoading,
    error,
  };
}

// ============================================================================
// TEAM SEASONS HOOKS
// ============================================================================

export function useAllTeamSeasons(): {
  data: TeamSeasonStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamSeasons,
    isLoading,
    error,
  } = api.teamStats.season.getAll.useQuery({});

  return {
    data: teamSeasons ?? [],
    isLoading,
    error,
  };
}

export function useTeamSeasonsByTeamId(gshlTeamId: string): {
  data: TeamSeasonStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamSeasons,
    isLoading,
    error,
  } = api.teamStats.season.getByTeam.useQuery({ gshlTeamId });

  return {
    data: teamSeasons ?? [],
    isLoading,
    error,
  };
}

export function useTeamSeasonsBySeasonId(seasonId: string): {
  data: TeamSeasonStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamSeasons,
    isLoading,
    error,
  } = api.teamStats.season.getBySeason.useQuery(
    { seasonId: +seasonId },
    { enabled: !!seasonId && +seasonId > 0 },
  );

  return {
    data: teamSeasons ?? [],
    isLoading,
    error,
  };
}

export function useTeamSeasonByTeamAndSeason(
  gshlTeamId: string,
  seasonId: string,
): {
  data: TeamSeasonStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamSeasons,
    isLoading,
    error,
  } = api.teamStats.season.getByTeam.useQuery({ gshlTeamId, seasonId });

  return {
    data: teamSeasons ?? [],
    isLoading,
    error,
  };
}

export function useTeamSeasonsBySeasonType(
  seasonId: string,
  seasonType: string,
): {
  data: TeamSeasonStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const seasonTypeEnum: SeasonType | undefined = Object.values(
    SeasonType,
  ).includes(seasonType as SeasonType)
    ? (seasonType as SeasonType)
    : undefined;
  const {
    data: teamSeasons,
    isLoading,
    error,
  } = api.teamStats.season.getBySeasonType.useQuery(
    {
      seasonId: +seasonId,
      seasonType: seasonTypeEnum!,
    },
    { enabled: !!seasonId && +seasonId > 0 && !!seasonTypeEnum },
  );

  return {
    data: teamSeasons ?? [],
    isLoading,
    error,
  };
}

export function useNHLTeams(): {
  data: NHLTeam[];
  isLoading: boolean;
  error: HookError;
} {
  const { data: nhlTeams, isLoading, error } = api.team.getNHLTeams.useQuery();

  return {
    data: nhlTeams ?? [],
    isLoading,
    error,
  };
}

// ============================================================================
// FRANCHISE HOOKS
// ============================================================================

/**
 * Fetches all franchises with their associated data
 */
export function useAllFranchises(): {
  data: EnrichedFranchise[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: franchises,
    isLoading: isLoadingFranchises,
    error: errorFranchises,
  } = api.franchise.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: conferences,
    isLoading: isLoadingConferences,
    error: errorConferences,
  } = api.conference.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: owners,
    isLoading: isLoadingOwners,
    error: errorOwners,
  } = api.owner.getAll.useQuery({ orderBy: { name: "asc" } });

  return {
    data:
      franchises?.map((f) => {
        const conference = conferences?.find((c) => c.id === f.confId);
        const owner = owners?.find((o) => o.id === f.ownerId);
        return {
          id: f.id,
          name: f.name,
          abbr: f.abbr,
          logoUrl: f.logoUrl,
          isActive: f.isActive,
          confId: f.confId,
          confName: conference?.name ?? null,
          confAbbr: conference?.abbr ?? null,
          confLogoUrl: conference?.logoUrl ?? null,
          ownerId: f.ownerId,
          ownerFirstName: owner?.firstName ?? null,
          ownerLastName: owner?.lastName ?? null,
          ownerNickname: owner?.nickName ?? null,
          ownerEmail: owner?.email ?? null,
          ownerOwing: owner?.owing ?? null,
          ownerIsActive: owner?.isActive ?? false,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        };
      }) ?? [],
    isLoading: [
      isLoadingFranchises,
      isLoadingConferences,
      isLoadingOwners,
    ].some(Boolean),
    error:
      [errorFranchises, errorConferences, errorOwners].find((e) => e) ?? null,
  };
}

/**
 * Fetches a single franchise by ID with associated data
 */
export function useFranchiseById(franchiseId: string): {
  data: EnrichedFranchise | null;
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: franchise,
    isLoading: isLoadingFranchise,
    error: errorFranchise,
  } = api.franchise.getById.useQuery({ id: franchiseId });
  const {
    data: conference,
    isLoading: isLoadingConference,
    error: errorConference,
  } = api.conference.getById.useQuery({ id: franchise?.confId ?? "0" });
  const {
    data: owner,
    isLoading: isLoadingOwner,
    error: errorOwner,
  } = api.owner.getById.useQuery({ id: franchise?.ownerId ?? "0" });

  return {
    data: franchise
      ? {
          id: franchise.id,
          name: franchise.name,
          abbr: franchise.abbr,
          logoUrl: franchise.logoUrl,
          isActive: franchise.isActive,
          confId: franchise.confId,
          confName: conference?.name ?? null,
          confAbbr: conference?.abbr ?? null,
          confLogoUrl: conference?.logoUrl ?? null,
          ownerId: franchise.ownerId,
          ownerFirstName: owner?.firstName ?? null,
          ownerLastName: owner?.lastName ?? null,
          ownerNickname: owner?.nickName ?? null,
          ownerEmail: owner?.email ?? null,
          ownerOwing: owner?.owing ?? null,
          ownerIsActive: owner?.isActive ?? false,
          createdAt: franchise.createdAt,
          updatedAt: franchise.updatedAt,
        }
      : null,
    isLoading: [isLoadingFranchise, isLoadingConference, isLoadingOwner].some(
      Boolean,
    ),
    error: [errorFranchise, errorConference, errorOwner].find((e) => e) ?? null,
  };
}

/**
 * Fetches franchises by conference ID with associated data
 */
export function useFranchisesByConferenceId(conferenceId: string): {
  data: EnrichedFranchise[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: franchises,
    isLoading: isLoadingFranchises,
    error: errorFranchises,
  } = api.franchise.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: conference,
    isLoading: isLoadingConference,
    error: errorConference,
  } = api.conference.getById.useQuery({ id: conferenceId });
  const {
    data: owners,
    isLoading: isLoadingOwners,
    error: errorOwners,
  } = api.owner.getAll.useQuery({ orderBy: { name: "asc" } });

  return {
    data:
      franchises
        ?.filter((f) => f.confId === conferenceId)
        .map((f) => {
          const owner = owners?.find((o) => o.id === f.ownerId);
          return {
            id: f.id,
            name: f.name,
            abbr: f.abbr,
            logoUrl: f.logoUrl,
            isActive: f.isActive,
            confId: f.confId,
            confName: conference?.name ?? null,
            confAbbr: conference?.abbr ?? null,
            confLogoUrl: conference?.logoUrl ?? null,
            ownerId: f.ownerId,
            ownerFirstName: owner?.firstName ?? null,
            ownerLastName: owner?.lastName ?? null,
            ownerNickname: owner?.nickName ?? null,
            ownerEmail: owner?.email ?? null,
            ownerOwing: owner?.owing ?? null,
            ownerIsActive: owner?.isActive ?? false,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          };
        }) ?? [],
    isLoading: [isLoadingFranchises, isLoadingConference, isLoadingOwners].some(
      Boolean,
    ),
    error:
      [errorFranchises, errorConference, errorOwners].find((e) => e) ?? null,
  };
}

/**
 * Fetches franchises by owner ID with associated data
 */
export function useFranchisesByOwnerId(ownerId: string): {
  data: EnrichedFranchise[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: franchises,
    isLoading: isLoadingFranchises,
    error: errorFranchises,
  } = api.franchise.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: conferences,
    isLoading: isLoadingConferences,
    error: errorConferences,
  } = api.conference.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: owner,
    isLoading: isLoadingOwner,
    error: errorOwner,
  } = api.owner.getById.useQuery({ id: ownerId });

  return {
    data:
      franchises
        ?.filter((f) => f.ownerId === ownerId)
        .map((f) => {
          const conference = conferences?.find((c) => c.id === f.confId);
          return {
            id: f.id,
            name: f.name,
            abbr: f.abbr,
            logoUrl: f.logoUrl,
            isActive: f.isActive,
            confId: f.confId,
            confName: conference?.name ?? null,
            confAbbr: conference?.abbr ?? null,
            confLogoUrl: conference?.logoUrl ?? null,
            ownerId: f.ownerId,
            ownerFirstName: owner?.firstName ?? null,
            ownerLastName: owner?.lastName ?? null,
            ownerNickname: owner?.nickName ?? null,
            ownerEmail: owner?.email ?? null,
            ownerOwing: owner?.owing ?? null,
            ownerIsActive: owner?.isActive ?? false,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          };
        }) ?? [],
    isLoading: [isLoadingFranchises, isLoadingConferences, isLoadingOwner].some(
      Boolean,
    ),
    error:
      [errorFranchises, errorConferences, errorOwner].find((e) => e) ?? null,
  };
}

/**
 * Fetches active franchises only with associated data
 */
export function useActiveFranchises(): {
  data: EnrichedFranchise[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: franchises,
    isLoading: isLoadingFranchises,
    error: errorFranchises,
  } = api.franchise.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: conferences,
    isLoading: isLoadingConferences,
    error: errorConferences,
  } = api.conference.getAll.useQuery({ orderBy: { name: "asc" } });
  const {
    data: owners,
    isLoading: isLoadingOwners,
    error: errorOwners,
  } = api.owner.getAll.useQuery({ orderBy: { name: "asc" } });

  return {
    data:
      franchises
        ?.filter((f) => f.isActive)
        .map((f) => {
          const conference = conferences?.find((c) => c.id === f.confId);
          const owner = owners?.find((o) => o.id === f.ownerId);
          return {
            id: f.id,
            name: f.name,
            abbr: f.abbr,
            logoUrl: f.logoUrl,
            isActive: f.isActive,
            confId: f.confId,
            confName: conference?.name ?? null,
            confAbbr: conference?.abbr ?? null,
            confLogoUrl: conference?.logoUrl ?? null,
            ownerId: f.ownerId,
            ownerFirstName: owner?.firstName ?? null,
            ownerLastName: owner?.lastName ?? null,
            ownerNickname: owner?.nickName ?? null,
            ownerEmail: owner?.email ?? null,
            ownerOwing: owner?.owing ?? null,
            ownerIsActive: owner?.isActive ?? false,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt,
          };
        }) ?? [],
    isLoading: [
      isLoadingFranchises,
      isLoadingConferences,
      isLoadingOwners,
    ].some(Boolean),
    error:
      [errorFranchises, errorConferences, errorOwners].find((e) => e) ?? null,
  };
}
