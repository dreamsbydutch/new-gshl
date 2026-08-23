export const LEAGUE_WIRE_PREVIEW_LIMIT = 8;
export const LEAGUE_WIRE_QUERY_LIMIT = 24;

export function selectLeagueWirePosts<T extends { kind: string }>(
  posts: readonly T[],
  expanded: boolean,
) {
  if (expanded) return [...posts];

  const selectedIndexes: number[] = [];
  const selectedKinds = new Set<string>();
  for (const [index, post] of posts.entries()) {
    if (selectedKinds.has(post.kind)) continue;
    selectedIndexes.push(index);
    selectedKinds.add(post.kind);
    if (selectedIndexes.length === LEAGUE_WIRE_PREVIEW_LIMIT) break;
  }
  if (selectedIndexes.length < LEAGUE_WIRE_PREVIEW_LIMIT) {
    const selected = new Set(selectedIndexes);
    for (const index of posts.keys()) {
      if (selected.has(index)) continue;
      selectedIndexes.push(index);
      if (selectedIndexes.length === LEAGUE_WIRE_PREVIEW_LIMIT) break;
    }
  }
  return selectedIndexes
    .sort((left, right) => left - right)
    .map((index) => posts[index]!);
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

export interface LeagueWireStarStoryEntry extends LeagueWireStarCandidate {
  playerName: string;
}

function leagueWireStarStatLine(star: LeagueWireStarStoryEntry) {
  if (star.wins > 0 || star.saves > 0) {
    return [
      star.wins > 0 ? `${star.wins} W` : "",
      star.saves > 0 ? `${star.saves} SV` : "",
    ]
      .filter(Boolean)
      .join(", ");
  }
  if (star.points > 0) return `${star.points} P`;
  return `${star.rating.toFixed(1)} rating`;
}

export function buildLeagueWireThreeStarsStory(
  weekLabel: string,
  stars: readonly LeagueWireStarStoryEntry[],
) {
  if (stars.length < 3) return null;
  const featured = stars.slice(0, 3);
  return {
    title: `${featured[0]!.playerName} leads ${weekLabel}'s three stars`,
    summary: featured
      .map(
        (star, index) =>
          `${index + 1}. ${star.playerName} (${leagueWireStarStatLine(star)})`,
      )
      .join("; "),
  };
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
