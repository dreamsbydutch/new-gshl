import type {
  StandingsPowerHistory,
  StandingsTeamCardViewModel,
  StandingsTeamGameContext,
  StandingsTopPlayer,
} from "../../src/lib/types";
import { utcTimestampToDateKey } from "./timestamps";

type NumericStat = number | string | null | undefined;

type StandingsTeamStatSource = {
  gshlTeamId: string;
  powerRk?: NumericStat;
  G?: NumericStat;
  A?: NumericStat;
  P?: NumericStat;
  PPP?: NumericStat;
  SOG?: NumericStat;
  HIT?: NumericStat;
  BLK?: NumericStat;
  W?: NumericStat;
  GAA?: NumericStat;
  SVP?: NumericStat;
};

type StandingsMatchupSource = {
  _id: string;
  weekId: string;
  homeTeamId: string;
  awayTeamId: string;
  homeScore?: number | null;
  awayScore?: number | null;
  isComplete?: boolean | null;
};

type StandingsWeekSource = {
  _id: string;
  weekNum: number | string;
};

type StandingsOpponentSource = {
  id: string;
  name: string;
  logoUrl?: string | null;
};

type StandingsPlayerTotalSource = {
  gshlTeamIds?: readonly string[] | null;
  playerId: string;
  nhlPos?: readonly string[] | null;
  posGroup: string;
  Rating?: NumericStat;
  P?: NumericStat;
  W?: NumericStat;
};

type StandingsPlayerSplitSource = {
  seasonId: string;
  playerId: string;
  seasonType: string;
};

type StandingsPlayerSource = {
  _id: string;
  fullName: string;
};

type StandingsOwnerSource = {
  firstName: string;
  lastName: string;
  nickName?: string | null;
};

type StandingsConferenceSource = {
  name: string;
  abbr: string;
};

type StandingsPowerWeekSource = {
  [key: string]: unknown;
  _id: string;
  weekNum: number | string;
  weekType: string;
  startDate?: string | number | null;
};

type StandingsPowerStatSource = {
  [key: string]: unknown;
  gshlTeamId: string;
  weekId: string;
  powerRating?: NumericStat;
  powerRk?: NumericStat;
};

const CATEGORY_FIELDS = [
  { key: "G", label: "G", direction: "desc" },
  { key: "A", label: "A", direction: "desc" },
  { key: "P", label: "P", direction: "desc" },
  { key: "PPP", label: "PPP", direction: "desc" },
  { key: "SOG", label: "SOG", direction: "desc" },
  { key: "HIT", label: "HIT", direction: "desc" },
  { key: "BLK", label: "BLK", direction: "desc" },
  { key: "W", label: "W", direction: "desc" },
  { key: "GAA", label: "GAA", direction: "asc" },
  { key: "SVP", label: "SV%", direction: "desc" },
] as const;

function numeric(value: NumericStat): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizedNumeric(value: NumericStat): number | null {
  const result = Number(value);
  return value !== null && value !== "" && Number.isFinite(result)
    ? result
    : null;
}

/** Projects the exact week and power fields consumed by the standings chart. */
export function projectStandingsPowerHistory(options: {
  weeks: readonly StandingsPowerWeekSource[];
  weeklyStats: readonly StandingsPowerStatSource[];
}): StandingsPowerHistory {
  return {
    weeks: options.weeks.map((week) => ({
      id: String(week._id),
      weekNum: Number(week.weekNum),
      weekType:
        week.weekType as StandingsPowerHistory["weeks"][number]["weekType"],
      startDate: utcTimestampToDateKey(week.startDate) ?? "",
    })),
    weeklyStats: options.weeklyStats.flatMap((stat) => {
      const powerRk = normalizedNumeric(stat.powerRk);
      if (powerRk === null || powerRk <= 0) return [];

      return [
        {
          gshlTeamId: String(stat.gshlTeamId),
          weekId: String(stat.weekId),
          powerRating: normalizedNumeric(stat.powerRating),
          powerRk,
        },
      ];
    }),
  };
}

function categoryValue(value: NumericStat): number | string | null {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  return typeof value === "string" && value !== "" ? value : null;
}

function statLabelValue(value: NumericStat): number | string {
  return value === null || value === undefined || value === "" ? 0 : value;
}

function weekNumber(
  weekNumById: ReadonlyMap<string, number>,
  weekId: string,
): number {
  return weekNumById.get(weekId) ?? Number.MAX_SAFE_INTEGER;
}

/** Selects only the two latest finals and next two games shown in the card. */
export function selectStandingsDetailMatchups<T extends StandingsMatchupSource>(
  teamId: string,
  matchups: readonly T[],
  weeks: readonly StandingsWeekSource[],
): T[] {
  const weekNumById = new Map(
    weeks.map((week) => [String(week._id), Number(week.weekNum)] as const),
  );
  const ordered = [...matchups]
    .filter(
      (matchup) =>
        String(matchup.homeTeamId) === teamId ||
        String(matchup.awayTeamId) === teamId,
    )
    .sort(
      (left, right) =>
        weekNumber(weekNumById, String(left.weekId)) -
        weekNumber(weekNumById, String(right.weekId)),
    );

  return [
    ...ordered
      .filter((matchup) => matchup.isComplete)
      .slice(-2)
      .reverse(),
    ...ordered.filter((matchup) => !matchup.isComplete).slice(0, 2),
  ];
}

/** Selects the same three rating-first player totals used by the snapshot. */
export function selectStandingsTopPlayerTotals<
  T extends StandingsPlayerTotalSource,
>(teamId: string, franchiseId: string, playerTotals: readonly T[]): T[] {
  const acceptedTeamIds = new Set([teamId, franchiseId]);

  return [...playerTotals]
    .filter((total) =>
      (total.gshlTeamIds ?? []).some((candidateId) =>
        acceptedTeamIds.has(String(candidateId)),
      ),
    )
    .sort((left, right) => {
      const ratingDifference =
        Number(right.Rating ?? 0) - Number(left.Rating ?? 0);
      return ratingDifference !== 0
        ? ratingDifference
        : Number(right.P ?? 0) - Number(left.P ?? 0);
    })
    .slice(0, 3);
}

/**
 * Selects the distinct indexed total-stat lookups represented by one team's
 * season split rows. First-seen order stays stable for deterministic reads.
 */
export function selectStandingsPlayerTotalLookupSplits<
  T extends StandingsPlayerSplitSource,
>(seasonId: string, playerSplits: readonly T[]): T[] {
  const seen = new Set<string>();

  return playerSplits.filter((split) => {
    if (String(split.seasonId) !== seasonId) return false;

    const key = JSON.stringify([String(split.playerId), split.seasonType]);
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function buildCategoryRanks(
  teamId: string,
  teamStats: readonly StandingsTeamStatSource[],
) {
  const selectedStats = teamStats.find(
    (row) => String(row.gshlTeamId) === teamId,
  );
  if (!selectedStats) return [];

  return CATEGORY_FIELDS.flatMap(({ direction, key, label }) => {
    const value = categoryValue(selectedStats[key]);
    if (value === null) return [];

    const rankedRows = [...teamStats].sort((left, right) => {
      const leftValue = numeric(left[key]);
      const rightValue = numeric(right[key]);
      if (direction === "asc") {
        return (leftValue ?? Infinity) - (rightValue ?? Infinity);
      }
      return (rightValue ?? -Infinity) - (leftValue ?? -Infinity);
    });
    const rank =
      rankedRows.findIndex((row) => String(row.gshlTeamId) === teamId) + 1;
    return rank > 0 ? [{ label, value, rank }] : [];
  })
    .sort((left, right) => left.rank - right.rank)
    .slice(0, 6);
}

function projectGame(
  teamId: string,
  matchup: StandingsMatchupSource,
  weekNumById: ReadonlyMap<string, number>,
  opponentById: ReadonlyMap<string, StandingsOpponentSource>,
): StandingsTeamGameContext {
  const isHome = String(matchup.homeTeamId) === teamId;
  const opponentId = String(isHome ? matchup.awayTeamId : matchup.homeTeamId);
  const opponent = opponentById.get(opponentId);
  const teamScore = isHome ? matchup.homeScore : matchup.awayScore;
  const opponentScore = isHome ? matchup.awayScore : matchup.homeScore;
  const hasScore = teamScore != null && opponentScore != null;
  let resultLabel = isHome ? "vs" : "@";
  let resultTone: StandingsTeamGameContext["resultTone"] = "upcoming";

  if (matchup.isComplete) {
    if (!hasScore || teamScore === opponentScore) {
      resultTone = "tie";
    } else {
      resultTone = teamScore > opponentScore ? "win" : "loss";
    }

    const resultPrefix =
      resultTone === "win" ? "W" : resultTone === "loss" ? "L" : "T";
    resultLabel = hasScore
      ? `${resultPrefix} ${teamScore}-${opponentScore}`
      : "Final";
  }

  return {
    id: String(matchup._id),
    isComplete: Boolean(matchup.isComplete),
    opponentLogoUrl: opponent?.logoUrl ?? null,
    opponentName: opponent?.name ?? "Opponent",
    resultLabel,
    resultTone,
    weekLabel: `W${weekNumById.get(String(matchup.weekId)) ?? "-"}`,
  };
}

function projectTopPlayers(
  playerTotals: readonly StandingsPlayerTotalSource[],
  players: readonly StandingsPlayerSource[],
): StandingsTopPlayer[] {
  const playerById = new Map(
    players.map((player) => [String(player._id), player] as const),
  );

  return playerTotals.map((total) => {
    const player = playerById.get(String(total.playerId));
    const isGoalie = String(total.posGroup) === "G";
    return {
      id: String(total.playerId),
      name: player?.fullName ?? "Unknown player",
      position: (total.nhlPos ?? []).join("/") || String(total.posGroup ?? ""),
      ratingLabel: Number.isFinite(Number(total.Rating))
        ? `${Number(total.Rating).toFixed(1)} RTG`
        : "—",
      statLabel: isGoalie
        ? `${statLabelValue(total.W)} W`
        : `${statLabelValue(total.P)} PTS`,
    };
  });
}

export function projectStandingsTeamDetail(options: {
  teamId: string;
  owner: StandingsOwnerSource | null;
  conference: StandingsConferenceSource | null;
  teamStats: readonly StandingsTeamStatSource[];
  matchups: readonly StandingsMatchupSource[];
  weeks: readonly StandingsWeekSource[];
  opponents: readonly StandingsOpponentSource[];
  playerTotals: readonly StandingsPlayerTotalSource[];
  players: readonly StandingsPlayerSource[];
}): StandingsTeamCardViewModel {
  const {
    conference,
    matchups,
    opponents,
    owner,
    players,
    playerTotals,
    teamId,
    teamStats,
    weeks,
  } = options;
  const selectedStats = teamStats.find(
    (row) => String(row.gshlTeamId) === teamId,
  );
  const powerRank = Number(selectedStats?.powerRk);
  const ownerName =
    [
      owner?.nickName,
      [owner?.firstName, owner?.lastName].filter(Boolean).join(" "),
    ].find((value) => value?.trim()) ?? "Owner unavailable";
  const selectedMatchups = selectStandingsDetailMatchups(
    teamId,
    matchups,
    weeks,
  );
  const weekNumById = new Map(
    weeks.map((week) => [String(week._id), Number(week.weekNum)] as const),
  );
  const opponentById = new Map(
    opponents.map((opponent) => [String(opponent.id), opponent] as const),
  );
  const games = selectedMatchups.map((matchup) =>
    projectGame(teamId, matchup, weekNumById, opponentById),
  );

  return {
    categoryRanks: buildCategoryRanks(teamId, teamStats),
    conferenceLabel: conference?.name ?? conference?.abbr ?? "Independent",
    ownerName,
    powerRank: Number.isFinite(powerRank) && powerRank > 0 ? powerRank : null,
    previousGames: games.filter((game) => game.isComplete),
    topPlayers: projectTopPlayers(playerTotals, players),
    upcomingGames: games.filter((game) => !game.isComplete),
  };
}
