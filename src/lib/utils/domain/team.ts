import type { Conference, Franchise, GSHLTeam, Owner, Team } from "@gshl-types";

export type TeamRelations = {
  franchises?: Franchise[];
  conferences?: Conference[];
  owners?: Owner[];
};

const defaultTeam: GSHLTeam = {
  id: "0",
  seasonId: "0",
  franchiseId: "0",
  name: null,
  abbr: null,
  logoUrl: null,
  isActive: false,
  yahooId: null,
  confId: null,
  confName: null,
  confAbbr: null,
  confLogoUrl: null,
  ownerId: null,
  ownerFirstName: null,
  ownerLastName: null,
  ownerNickname: null,
  ownerEmail: null,
  ownerOwing: null,
  ownerIsActive: false,
};

const isGshlTeam = (team: Team | GSHLTeam): team is GSHLTeam =>
  "ownerFirstName" in team;

export function enrichTeam(
  team: Team | GSHLTeam | null | undefined,
  relations: TeamRelations,
): GSHLTeam {
  if (!team) return defaultTeam;
  if (isGshlTeam(team)) return team;

  const { franchises = [], conferences = [], owners = [] } = relations;
  const franchise = franchises.find((f) => f.id === team.franchiseId);
  const conference = conferences.find((c) => c.id === team.confId);
  const owner = owners.find((o) => o.id === franchise?.ownerId);

  return {
    id: team.id,
    seasonId: team.seasonId,
    franchiseId: team.franchiseId,
    name: franchise?.name ?? null,
    abbr: franchise?.abbr ?? null,
    logoUrl: franchise?.logoUrl ?? null,
    isActive: franchise?.isActive ?? false,
    yahooId: team?.yahooId ?? null,
    confId: team?.confId ?? null,
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
}

export function enrichTeams(
  teams: Array<Team | GSHLTeam> | null | undefined,
  relations: TeamRelations,
): GSHLTeam[] {
  if (!teams?.length) return [];
  return teams.map((team) => enrichTeam(team, relations));
}

/**
 * Finds a team by its unique identifier.
 *
 * @param teams - Collection of teams to search
 * @param teamId - The unique identifier of the team to find
 * @returns The matching team, or `undefined` if not found
 *
 * @example
 * ```ts
 * const team = findTeamById(allTeams, "team-123");
 * if (team) {
 *   console.log(team.name);
 * }
 * ```
 */
export const findTeamById = (
  teams: GSHLTeam[],
  teamId: string,
): GSHLTeam | undefined => {
  return teams.find((team) => team.id === teamId);
};

/**
 * Finds multiple teams by their identifiers.
 *
 * @param teams - Collection of teams to search
 * @param teamIds - Array of team identifiers to find
 * @returns Array of matching teams (may be shorter than input if some IDs not found)
 *
 * @example
 * ```ts
 * const selectedTeams = findTeamsByIds(allTeams, ["team-1", "team-2", "team-3"]);
 * ```
 */
export const findTeamsByIds = (
  teams: GSHLTeam[],
  teamIds: string[],
): GSHLTeam[] => {
  return teams.filter((team) => teamIds.includes(team.id));
};

/**
 * Calculates fantasy points from a stats record using GSHL scoring rules.
 *
 * Scoring weights:
 * - Goals: 3 points
 * - Assists: 2 points
 * - Shots: 0.1 points
 * - Hits: 0.1 points
 * - Blocks: 0.2 points
 * - Wins (goalies): 3 points
 * - Saves: 0.1 points
 * - Shutouts: 2 points
 *
 * @param stats - Record of stat names to values
 * @returns Total fantasy points
 */
export function calculateFantasyPoints(stats: Record<string, number>): number {
  const scoring = {
    goals: 3,
    assists: 2,
    shots: 0.1,
    hits: 0.1,
    blocks: 0.2,
    wins: 3,
    saves: 0.1,
    shutouts: 2,
  } as const;

  return Object.entries(stats).reduce((total, [stat, value]) => {
    const weight = scoring[stat as keyof typeof scoring] ?? 0;
    return total + value * weight;
  }, 0);
}

/**
 * Calculates a team's win-loss-tie record from matchups.
 *
 * @param matchups - Array of matchup objects with team IDs and results
 * @param teamId - The team ID to calculate the record for
 * @returns Object with wins, losses, and ties counts
 */
export function calculateTeamRecord(
  matchups: Array<{
    homeTeamId: string;
    awayTeamId: string;
    homeWin?: boolean | null;
    awayWin?: boolean | null;
    tie?: boolean | null;
  }>,
  teamId: string,
): { wins: number; losses: number; ties: number } {
  return matchups.reduce(
    (record, matchup) => {
      if (matchup.homeTeamId === teamId) {
        if (matchup.homeWin) record.wins += 1;
        else if (matchup.awayWin) record.losses += 1;
        else if (matchup.tie) record.ties += 1;
      } else if (matchup.awayTeamId === teamId) {
        if (matchup.awayWin) record.wins += 1;
        else if (matchup.homeWin) record.losses += 1;
        else if (matchup.tie) record.ties += 1;
      }
      return record;
    },
    { wins: 0, losses: 0, ties: 0 },
  );
}
