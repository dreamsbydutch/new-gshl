import type {
  DraftRosterConferenceView,
  DraftRosterTeamView,
  Franchise,
  GSHLTeam,
  Player,
  Season,
} from "@gshl-types";
import { RosterPosition } from "../domain/constants";
import { buildCurrentRoster } from "./team-roster";

export const DRAFT_ROSTER_STARTER_WEIGHT = 2;
export const DRAFT_ROSTER_BENCH_WEIGHT = 1;

const STARTING_LINEUP_POSITIONS = new Set<string>([
  RosterPosition.LW,
  RosterPosition.C,
  RosterPosition.RW,
  RosterPosition.D,
  RosterPosition.G,
  RosterPosition.Util,
]);

export function calculateDraftRosterTalentRating(
  roster: readonly {
    lineupPos?: string | null;
    overallRating?: string | number | null;
  }[],
): number | null {
  let weightedRating = 0;
  let totalWeight = 0;

  for (const player of roster) {
    if (player.overallRating === null || player.overallRating === undefined) {
      continue;
    }
    const rating = Number(player.overallRating);
    if (!Number.isFinite(rating)) continue;

    const weight =
      typeof player.lineupPos === "string" &&
      STARTING_LINEUP_POSITIONS.has(player.lineupPos)
        ? DRAFT_ROSTER_STARTER_WEIGHT
        : player.lineupPos === RosterPosition.BN
          ? DRAFT_ROSTER_BENCH_WEIGHT
          : 0;
    if (weight === 0) continue;

    weightedRating += rating * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? weightedRating / totalWeight : null;
}

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
  players: readonly Player[],
): DraftRosterConferenceView[] {
  const conferences = new Map<string, DraftRosterConferenceView>();

  for (const team of teams) {
    const teamView: DraftRosterTeamView = {
      ...team,
      talentRating: calculateDraftRosterTalentRating(
        buildCurrentRoster([...players], team),
      ),
    };
    const conferenceId = String(
      team.confId ?? team.confAbbr ?? team.confName ?? "unassigned",
    );
    const existing = conferences.get(conferenceId);
    if (existing) {
      existing.teams.push(teamView);
      continue;
    }

    conferences.set(conferenceId, {
      id: conferenceId,
      name: team.confName ?? team.confAbbr ?? "Conference",
      abbr: team.confAbbr,
      logoUrl: team.confLogoUrl,
      teams: [teamView],
    });
  }

  return [...conferences.values()]
    .map((conference) => ({
      ...conference,
      teams: [...conference.teams].sort((left, right) => {
        if (left.talentRating === null && right.talentRating !== null) return 1;
        if (left.talentRating !== null && right.talentRating === null)
          return -1;

        const talentDifference =
          Number(right.talentRating ?? 0) - Number(left.talentRating ?? 0);
        return (
          talentDifference ||
          String(left.name ?? left.abbr ?? "").localeCompare(
            String(right.name ?? right.abbr ?? ""),
          )
        );
      }),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
