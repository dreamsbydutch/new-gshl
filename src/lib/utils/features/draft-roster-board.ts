import type {
  DraftRosterConferenceView,
  DraftRosterTeamView,
  Franchise,
  GSHLTeam,
  Player,
  RosterPosition as RosterPositionType,
  Season,
} from "@gshl-types";
import { RosterPosition } from "../domain/constants";
import { buildCurrentRoster } from "./team-roster";

export const DRAFT_ROSTER_PRIMARY_WEIGHT = 1.22;
export const DRAFT_ROSTER_SECONDARY_WEIGHT = 1.14;
export const DRAFT_ROSTER_UTILITY_WEIGHT = 1.07;
export const DRAFT_ROSTER_BENCH_WEIGHT = 1;
export const DRAFT_ROSTER_BENCH_SLOTS = 4;

export const DRAFT_ROSTER_LINEUP_SLOTS: readonly {
  position: RosterPositionType;
  eligible: readonly RosterPositionType[];
  weight: number;
}[] = [
  {
    position: RosterPosition.LW,
    eligible: [RosterPosition.LW],
    weight: DRAFT_ROSTER_PRIMARY_WEIGHT,
  },
  {
    position: RosterPosition.C,
    eligible: [RosterPosition.C],
    weight: DRAFT_ROSTER_PRIMARY_WEIGHT,
  },
  {
    position: RosterPosition.RW,
    eligible: [RosterPosition.RW],
    weight: DRAFT_ROSTER_PRIMARY_WEIGHT,
  },
  {
    position: RosterPosition.D,
    eligible: [RosterPosition.D],
    weight: DRAFT_ROSTER_PRIMARY_WEIGHT,
  },
  {
    position: RosterPosition.D,
    eligible: [RosterPosition.D],
    weight: DRAFT_ROSTER_PRIMARY_WEIGHT,
  },
  {
    position: RosterPosition.LW,
    eligible: [RosterPosition.LW],
    weight: DRAFT_ROSTER_SECONDARY_WEIGHT,
  },
  {
    position: RosterPosition.C,
    eligible: [RosterPosition.C],
    weight: DRAFT_ROSTER_SECONDARY_WEIGHT,
  },
  {
    position: RosterPosition.RW,
    eligible: [RosterPosition.RW],
    weight: DRAFT_ROSTER_SECONDARY_WEIGHT,
  },
  {
    position: RosterPosition.D,
    eligible: [RosterPosition.D],
    weight: DRAFT_ROSTER_SECONDARY_WEIGHT,
  },
  {
    position: RosterPosition.G,
    eligible: [RosterPosition.G],
    weight: DRAFT_ROSTER_SECONDARY_WEIGHT,
  },
  {
    position: RosterPosition.Util,
    eligible: [
      RosterPosition.LW,
      RosterPosition.C,
      RosterPosition.RW,
      RosterPosition.D,
    ],
    weight: DRAFT_ROSTER_UTILITY_WEIGHT,
  },
];

export const DRAFT_ROSTER_FULL_TEAM_WEIGHT =
  DRAFT_ROSTER_LINEUP_SLOTS.reduce((total, slot) => total + slot.weight, 0) +
  DRAFT_ROSTER_BENCH_SLOTS * DRAFT_ROSTER_BENCH_WEIGHT;

function getPositionWeights(lineupPos: string): readonly number[] {
  if (
    lineupPos === RosterPosition.LW ||
    lineupPos === RosterPosition.C ||
    lineupPos === RosterPosition.RW
  ) {
    return [DRAFT_ROSTER_PRIMARY_WEIGHT, DRAFT_ROSTER_SECONDARY_WEIGHT];
  }
  if (lineupPos === RosterPosition.D) {
    return [
      DRAFT_ROSTER_PRIMARY_WEIGHT,
      DRAFT_ROSTER_PRIMARY_WEIGHT,
      DRAFT_ROSTER_SECONDARY_WEIGHT,
    ];
  }
  if (lineupPos === RosterPosition.G) {
    return [DRAFT_ROSTER_SECONDARY_WEIGHT];
  }
  if (lineupPos === RosterPosition.Util) {
    return [DRAFT_ROSTER_UTILITY_WEIGHT];
  }
  return [];
}

function calculateDraftRosterTalentMetrics(
  roster: readonly {
    lineupPos?: string | null;
    overallRating?: string | number | null;
  }[],
): { points: number; weight: number } {
  let weightedRating = 0;
  const ratingsByLineupPosition = new Map<string, number[]>();
  const benchRatings: number[] = [];

  for (const player of roster) {
    if (player.overallRating === null || player.overallRating === undefined) {
      continue;
    }
    const rating = Number(player.overallRating);
    if (!Number.isFinite(rating)) continue;

    if (player.lineupPos === RosterPosition.BN) {
      benchRatings.push(rating);
      continue;
    }
    if (typeof player.lineupPos !== "string") continue;
    if (getPositionWeights(player.lineupPos).length === 0) continue;

    const positionRatings = ratingsByLineupPosition.get(player.lineupPos) ?? [];
    positionRatings.push(rating);
    ratingsByLineupPosition.set(player.lineupPos, positionRatings);
  }

  for (const [lineupPos, ratings] of ratingsByLineupPosition) {
    const positionWeights = getPositionWeights(lineupPos);
    ratings.sort((left, right) => right - left);

    for (const [index, rating] of ratings.entries()) {
      const weight = positionWeights[index];
      if (weight === undefined) {
        benchRatings.push(rating);
        continue;
      }
      weightedRating += rating * weight;
    }
  }

  benchRatings.sort((left, right) => right - left);
  for (const rating of benchRatings.slice(0, DRAFT_ROSTER_BENCH_SLOTS)) {
    weightedRating += rating * DRAFT_ROSTER_BENCH_WEIGHT;
  }

  return {
    points: weightedRating,
    weight: DRAFT_ROSTER_FULL_TEAM_WEIGHT,
  };
}

export function calculateDraftRosterTalentPoints(
  roster: readonly {
    lineupPos?: string | null;
    overallRating?: string | number | null;
  }[],
): number {
  return calculateDraftRosterTalentMetrics(roster).points;
}

export function calculateDraftRosterTalentRating(
  roster: readonly {
    lineupPos?: string | null;
    overallRating?: string | number | null;
  }[],
): number | null {
  const { points, weight } = calculateDraftRosterTalentMetrics(roster);
  return weight > 0 ? points / weight : null;
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
