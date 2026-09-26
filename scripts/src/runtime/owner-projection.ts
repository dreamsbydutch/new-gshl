/** Predictive owner history, deliberately separate from the achievement ladder. */
type Row = Record<string, unknown>;

export const OWNER_PROJECTION_CONFIG = {
  seasons: 4,
  halfLifeSeasons: 2,
  priorGames: 20,
  winRateScale: 0.15,
} as const;

export type OwnerProjectionInput = {
  season: Row;
  seasons: Row[];
  teams: Row[];
  historicalTeams: Row[];
  franchises: Row[];
  teamSeasons: Row[];
};

export function projectOwners(input: OwnerProjectionInput) {
  const id = (row: Row) => String(row.id ?? row._id ?? "");
  const yearBySeason = new Map(
    input.seasons.map((season) => [id(season), Number(season.year)]),
  );
  const owners = new Map(
    input.franchises.map((franchise) => [
      id(franchise),
      String(franchise.ownerId ?? ""),
    ]),
  );
  const ownerOf = (team: Row) =>
    String(team.ownerId ?? owners.get(String(team.franchiseId)) ?? "");
  const teamById = new Map(
    input.historicalTeams.map((team) => [id(team), team]),
  );
  const history = new Map<string, { wins: number; games: number }>();
  for (const row of input.teamSeasons) {
    const distance =
      Number(input.season.year) -
      (yearBySeason.get(String(row.seasonId)) ?? Infinity);
    if (
      row.seasonType !== "RS" ||
      distance < 1 ||
      distance > OWNER_PROJECTION_CONFIG.seasons
    )
      continue;
    const team = teamById.get(String(row.gshlTeamId));
    const owner = team ? ownerOf(team) : "";
    const wins = Number(row.teamW ?? 0),
      losses = Number(row.teamL ?? 0),
      ties = Number(row.teamT ?? 0);
    const games = wins + losses + ties;
    if (
      !owner ||
      !Number.isFinite(games) ||
      games <= 0 ||
      Math.min(wins, losses, ties) < 0
    )
      continue;
    const weight =
      2 ** (-(distance - 1) / OWNER_PROJECTION_CONFIG.halfLifeSeasons);
    const total = history.get(owner) ?? { wins: 0, games: 0 };
    total.wins += weight * (wins + 0.5 * ties);
    total.games += weight * games;
    history.set(owner, total);
  }
  return new Map(
    input.teams.map((team) => {
      const total = history.get(ownerOf(team)) ?? { wins: 0, games: 0 };
      const winRate =
        (total.wins + OWNER_PROJECTION_CONFIG.priorGames * 0.5) /
        (total.games + OWNER_PROJECTION_CONFIG.priorGames);
      return [
        id(team),
        {
          score: (winRate - 0.5) / OWNER_PROJECTION_CONFIG.winRateScale,
          winRate,
          weightedGames: total.games,
        },
      ];
    }),
  );
}
