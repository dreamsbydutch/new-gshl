export type ActivityPlayer = Record<string, unknown> & {
  id: string;
};

export type ActivitySeason = Record<string, unknown> & {
  id: string;
  year?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  isActive?: unknown;
};

export type ActivityStatLine = Record<string, unknown> & {
  playerId?: unknown;
  seasonId?: unknown;
  GP?: unknown;
};

export type PlayerActivityEvidence = {
  evidenceComplete: boolean;
  currentSeasonId: string;
  currentSeasonYear: number | null;
  currentSeasonGames: number;
  previousSeasonId: string;
  previousSeasonYear: number | null;
  previousSeasonGames: number;
};

export type PlayerActivityContext = {
  currentSeasonId: string;
  currentSeasonYear: number | null;
  previousSeasonId: string;
  previousSeasonYear: number | null;
  evidenceByPlayerId: ReadonlyMap<string, PlayerActivityEvidence>;
};

function toText(value: unknown): string {
  if (
    value === null ||
    value === undefined ||
    typeof value === "object" ||
    typeof value === "symbol"
  ) {
    return "";
  }
  return String(value).trim();
}

function toNumber(value: unknown): number | null {
  const number = Number(toText(value).replace(/[,\s]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  return ["1", "true", "yes"].includes(toText(value).toLowerCase());
}

function dateOnly(value: unknown): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(toText(value));
  return match?.[1] ?? "";
}

function seasonYear(season: ActivitySeason): number | null {
  const year = toNumber(season.year);
  return year !== null && Number.isInteger(year) ? year : null;
}

function orderSeasons(seasons: readonly ActivitySeason[]): ActivitySeason[] {
  return [...seasons].sort((left, right) => {
    const leftYear = seasonYear(left) ?? Number.NEGATIVE_INFINITY;
    const rightYear = seasonYear(right) ?? Number.NEGATIVE_INFINITY;
    return leftYear - rightYear || left.id.localeCompare(right.id);
  });
}

function resolveCurrentSeason(
  seasons: readonly ActivitySeason[],
  referenceDate: Date,
): {
  current: ActivitySeason | null;
  previous: ActivitySeason | null;
} {
  const ordered = orderSeasons(seasons);
  const active = ordered.filter((season) => toBoolean(season.isActive));
  let current = active.at(-1) ?? null;
  if (!current) {
    const today = referenceDate.toISOString().slice(0, 10);
    current =
      ordered.find((season) => {
        const start = dateOnly(season.startDate);
        const end = dateOnly(season.endDate);
        return Boolean(start && end && start <= today && end >= today);
      }) ??
      ordered.at(-1) ??
      null;
  }
  const currentIndex = current
    ? ordered.findIndex((season) => season.id === current?.id)
    : -1;
  return {
    current,
    previous: currentIndex > 0 ? (ordered[currentIndex - 1] ?? null) : null,
  };
}

function gamesByPlayerForSeason(
  statLines: readonly ActivityStatLine[],
  seasonId: string,
): Map<string, number> {
  const games = new Map<string, number>();
  if (!seasonId) return games;
  for (const statLine of statLines) {
    if (toText(statLine.seasonId) !== seasonId) continue;
    const playerId = toText(statLine.playerId);
    if (!playerId) continue;
    const gp = Math.max(0, toNumber(statLine.GP) ?? 0);
    games.set(playerId, Math.max(games.get(playerId) ?? 0, gp));
  }
  return games;
}

export function buildPlayerActivityContext(options: {
  players: readonly ActivityPlayer[];
  seasons: readonly ActivitySeason[];
  statLines: readonly ActivityStatLine[];
  referenceDate: Date;
}): PlayerActivityContext {
  const { players, seasons, statLines, referenceDate } = options;
  const { current, previous } = resolveCurrentSeason(seasons, referenceDate);
  const currentSeasonId = current?.id ?? "";
  const previousSeasonId = previous?.id ?? "";
  const currentSeasonYear = current ? seasonYear(current) : null;
  const previousSeasonYear = previous ? seasonYear(previous) : null;
  const currentGames = gamesByPlayerForSeason(statLines, currentSeasonId);
  const previousGames = gamesByPlayerForSeason(statLines, previousSeasonId);
  const evidenceByPlayerId = new Map<string, PlayerActivityEvidence>();

  for (const player of players) {
    evidenceByPlayerId.set(player.id, {
      evidenceComplete: Boolean(currentSeasonId && previousSeasonId),
      currentSeasonId,
      currentSeasonYear,
      currentSeasonGames: currentGames.get(player.id) ?? 0,
      previousSeasonId,
      previousSeasonYear,
      previousSeasonGames: previousGames.get(player.id) ?? 0,
    });
  }

  return {
    currentSeasonId,
    currentSeasonYear,
    previousSeasonId,
    previousSeasonYear,
    evidenceByPlayerId,
  };
}
