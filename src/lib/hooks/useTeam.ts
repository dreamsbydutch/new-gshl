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
        const conference = conferences?.find((c) => c.id === t.confId);
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

export function useTeamById(teamId: number): {
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
  } = api.franchise.getById.useQuery({ id: team?.franchiseId ?? 0 });
  const {
    data: conference,
    isLoading: isLoadingConference,
    error: errorConference,
  } = api.conference.getById.useQuery({ id: team?.confId ?? 0 });
  const {
    data: owner,
    isLoading: isLoadingOwner,
    error: errorOwner,
  } = api.owner.getById.useQuery({ id: franchise?.ownerId ?? 0 });
  return {
    data: {
      id: team?.id ?? 0,
      seasonId: team?.seasonId ?? 0,
      franchiseId: team?.franchiseId ?? 0,
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

export function useTeamsBySeasonId(seasonId: number): {
  data: GSHLTeam[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teams,
    isLoading: isTeamsLoading,
    error: errorTeams,
  } = api.team.getAll.useQuery({
    where: { seasonId },
    orderBy: { seasonId: "asc" },
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
        const conference = conferences?.find((c) => c.id === t.confId);
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

export function useTeamsByFranchiseId(franchiseId: number): {
  data: GSHLTeam[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teams,
    isLoading: isTeamsLoading,
    error: errorTeams,
  } = api.team.getAll.useQuery({
    where: { franchiseId },
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
  } = api.conference.getById.useQuery({ id: franchise?.confId ?? 0 });
  const {
    data: owner,
    isLoading: isOwnerLoading,
    error: errorOwner,
  } = api.owner.getById.useQuery({ id: franchise?.ownerId ?? 0 });
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

export function useTeamsByOwnerId(ownerId: number): {
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
  } = api.owner.getById.useQuery({ id: ownerId ?? 0 });
  return {
    data:
      teams
        ?.map((t) => {
          const franchise = franchises?.find((f) => f.id === t.franchiseId);
          if (franchise?.ownerId !== ownerId) return null;
          const conference = conferences?.find((c) => c.id === t.confId);
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

export function useTeamDaysByTeamId(gshlTeamId: number): {
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

export function useTeamDaysByWeekId(weekId: number): {
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
  gshlTeamId: number,
  seasonId: number,
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

export function useTeamWeeksByTeamId(gshlTeamId: number): {
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

export function useTeamWeeksByWeekId(weekId: number): {
  data: TeamWeekStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamWeeks,
    isLoading,
    error,
  } = api.teamStats.weekly.getByWeek.useQuery({ weekId });

  return {
    data: teamWeeks ?? [],
    isLoading,
    error,
  };
}

export function useTeamWeeksBySeasonId(seasonId: number): {
  data: TeamWeekStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamWeeks,
    isLoading,
    error,
  } = api.teamStats.weekly.getAll.useQuery({
    where: { seasonId },
  });

  return {
    data: teamWeeks ?? [],
    isLoading,
    error,
  };
}

export function useTeamWeeksByTeamAndSeason(
  gshlTeamId: number,
  seasonId: number,
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

export function useTeamSeasonsByTeamId(gshlTeamId: number): {
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

export function useTeamSeasonsBySeasonId(seasonId: number): {
  data: TeamSeasonStatLine[];
  isLoading: boolean;
  error: HookError;
} {
  const {
    data: teamSeasons,
    isLoading,
    error,
  } = api.teamStats.season.getBySeason.useQuery(
    { seasonId },
    { enabled: !!seasonId && seasonId > 0 },
  );

  return {
    data: teamSeasons ?? [],
    isLoading,
    error,
  };
}

export function useTeamSeasonByTeamAndSeason(
  gshlTeamId: number,
  seasonId: number,
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
  seasonId: number,
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
      seasonId,
      seasonType: seasonTypeEnum!,
    },
    { enabled: !!seasonId && seasonId > 0 && !!seasonTypeEnum },
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
  const {
    data: nhlTeams,
    isLoading,
    error,
  } = api.team.getNHLTeams.useQuery();

  return {
    data: nhlTeams ?? [],
    isLoading,
    error,
  };
}