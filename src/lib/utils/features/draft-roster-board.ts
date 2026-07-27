import type {
  DraftRosterConferenceView,
  Franchise,
  GSHLTeam,
  Season,
} from "@gshl-types";

export function selectLatestActiveFranchiseTeams(
  teams: readonly GSHLTeam[],
  franchises: readonly Franchise[],
  seasons: readonly Season[],
): GSHLTeam[] {
  const activeFranchiseIds = new Set(
    franchises
      .filter((franchise) => franchise.isActive)
      .map((franchise) => String(franchise.id)),
  );
  const seasonYearById = new Map(
    seasons.map((season) => [String(season.id), Number(season.year)]),
  );
  const latestTeamByFranchiseId = new Map<string, GSHLTeam>();

  for (const team of teams) {
    const franchiseId = String(team.franchiseId);
    if (
      !activeFranchiseIds.has(franchiseId) ||
      !team.isActive ||
      !team.ownerIsActive
    ) {
      continue;
    }

    const existing = latestTeamByFranchiseId.get(franchiseId);
    const teamSeasonYear =
      seasonYearById.get(String(team.seasonId)) ?? Number.NEGATIVE_INFINITY;
    const existingSeasonYear = existing
      ? (seasonYearById.get(String(existing.seasonId)) ??
        Number.NEGATIVE_INFINITY)
      : Number.NEGATIVE_INFINITY;

    if (!existing || teamSeasonYear > existingSeasonYear) {
      latestTeamByFranchiseId.set(franchiseId, team);
    }
  }

  return [...latestTeamByFranchiseId.values()];
}

export function groupDraftRosterTeamsByConference(
  teams: readonly GSHLTeam[],
): DraftRosterConferenceView[] {
  const conferences = new Map<string, DraftRosterConferenceView>();

  for (const team of teams) {
    const conferenceId = String(
      team.confId ?? team.confAbbr ?? team.confName ?? "unassigned",
    );
    const existing = conferences.get(conferenceId);
    if (existing) {
      existing.teams.push(team);
      continue;
    }

    conferences.set(conferenceId, {
      id: conferenceId,
      name: team.confName ?? team.confAbbr ?? "Conference",
      abbr: team.confAbbr,
      logoUrl: team.confLogoUrl,
      teams: [team],
    });
  }

  return [...conferences.values()]
    .map((conference) => ({
      ...conference,
      teams: [...conference.teams].sort((left, right) =>
        String(left.name ?? left.abbr ?? "").localeCompare(
          String(right.name ?? right.abbr ?? ""),
        ),
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
