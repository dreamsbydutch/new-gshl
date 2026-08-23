export const LEAGUE_WIRE_PREVIEW_LIMIT = 5;
export const LEAGUE_WIRE_QUERY_LIMIT = 12;

export function selectLeagueWirePosts<T>(
  posts: readonly T[],
  expanded: boolean,
) {
  return expanded ? [...posts] : posts.slice(0, LEAGUE_WIRE_PREVIEW_LIMIT);
}

export function parseLeagueWireAssetLines(value: string) {
  return [
    ...new Set(
      value
        .split(/\r?\n/)
        .map((line) => line.trim().replace(/\s+/g, " "))
        .filter(Boolean),
    ),
  ];
}

export interface LeagueWireStarCandidate {
  playerId: string;
  teamId: string;
  rating: number;
  points: number;
  wins: number;
  saves: number;
}

export function selectLeagueWireStars(
  candidates: readonly LeagueWireStarCandidate[],
) {
  return [...candidates]
    .sort(
      (left, right) =>
        right.rating - left.rating ||
        right.points - left.points ||
        right.wins - left.wins ||
        right.saves - left.saves ||
        left.playerId.localeCompare(right.playerId),
    )
    .slice(0, 3);
}

export interface LeagueWirePowerMovement {
  teamId: string;
  currentRank: number;
  previousRank: number;
}

export function rankLeagueWirePowerMovements(
  movements: readonly LeagueWirePowerMovement[],
) {
  return movements
    .map((movement) => ({
      ...movement,
      movement: movement.previousRank - movement.currentRank,
    }))
    .filter((movement) => movement.movement !== 0)
    .sort(
      (left, right) =>
        Math.abs(right.movement) - Math.abs(left.movement) ||
        left.currentRank - right.currentRank ||
        left.teamId.localeCompare(right.teamId),
    );
}
