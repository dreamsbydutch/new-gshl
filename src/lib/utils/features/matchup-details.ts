import type {
  CategoryResult,
  MatchupPlayerStat,
  PlayerStatColumn,
  PlayerStatCategoryKey,
  PlayerStatColumnKey,
  PlayerStatContextKey,
  PlayerStatRow,
  StarPlayer,
} from "@gshl-types";
import type {
  GSHLTeam,
  MatchupCategoryConfig,
  TeamWeekStatLine,
} from "@gshl-types";
import { formatPlayerPositionList } from "../domain/player";

type MatchupStatCategoryConfig = MatchupCategoryConfig & {
  field: PlayerStatCategoryKey;
};

export const MATCHUP_CATEGORY_MAP: Record<
  PlayerStatCategoryKey,
  MatchupStatCategoryConfig
> = {
  G: { field: "G", label: "G" },
  A: { field: "A", label: "A" },
  P: { field: "P", label: "P" },
  PM: { field: "PM", label: "+/-" },
  PIM: { field: "PIM", label: "PIM" },
  PPP: { field: "PPP", label: "PPP" },
  SOG: { field: "SOG", label: "SOG" },
  HIT: { field: "HIT", label: "HIT" },
  BLK: { field: "BLK", label: "BLK" },
  W: { field: "W", label: "W" },
  GA: { field: "GA", label: "GA" },
  GAA: { field: "GAA", label: "GAA", isInverse: true, precision: 2 },
  SV: { field: "SV", label: "SV" },
  SA: { field: "SA", label: "SA" },
  SVP: { field: "SVP", label: "SV%", precision: 3 },
  SO: { field: "SO", label: "SO" },
} as const;

export const FALLBACK_MATCHUP_CATEGORIES: MatchupStatCategoryConfig[] = [
  MATCHUP_CATEGORY_MAP.G,
  MATCHUP_CATEGORY_MAP.A,
  MATCHUP_CATEGORY_MAP.P,
  MATCHUP_CATEGORY_MAP.PPP,
  MATCHUP_CATEGORY_MAP.SOG,
  MATCHUP_CATEGORY_MAP.HIT,
  MATCHUP_CATEGORY_MAP.BLK,
  MATCHUP_CATEGORY_MAP.W,
  MATCHUP_CATEGORY_MAP.GAA,
  MATCHUP_CATEGORY_MAP.SVP,
];

const PLAYER_STAT_IDENTITY_COLUMNS: ReadonlyArray<
  PlayerStatColumn & {
    key: "player" | "pos" | "nhlTeam";
  }
> = [
  { key: "player", label: "Player", className: "min-w-[180px]" },
  { key: "pos", label: "Pos", className: "min-w-[72px]" },
  { key: "nhlTeam", label: "NHL" },
];

const PLAYER_STAT_CONTEXT_COLUMNS: ReadonlyArray<
  PlayerStatColumn & {
    key: "date" | "opp" | "score" | "days" | "GP" | "GS" | "Rating";
  }
> = [
  { key: "date", label: "Date", className: "whitespace-nowrap" },
  { key: "opp", label: "Opp" },
  { key: "score", label: "Score" },
  { key: "days", label: "Days" },
  { key: "GP", label: "GP" },
  { key: "GS", label: "GS" },
  { key: "Rating", label: "Rating" },
];

const PLAYER_STAT_TRAILING_COLUMNS: ReadonlyArray<
  PlayerStatColumn & {
    key: "Rating";
  }
> = [];

const PLAYER_STAT_CATEGORY_COLUMNS: Record<
  PlayerStatCategoryKey,
  PlayerStatColumn & { key: PlayerStatCategoryKey }
> = {
  G: { key: "G", label: "G" },
  A: { key: "A", label: "A" },
  P: { key: "P", label: "P" },
  PM: { key: "PM", label: "+/-" },
  PIM: { key: "PIM", label: "PIM" },
  PPP: { key: "PPP", label: "PPP" },
  SOG: { key: "SOG", label: "SOG" },
  HIT: { key: "HIT", label: "HIT" },
  BLK: { key: "BLK", label: "BLK" },
  W: { key: "W", label: "W" },
  GA: { key: "GA", label: "GA" },
  GAA: { key: "GAA", label: "GAA" },
  SV: { key: "SV", label: "SV" },
  SA: { key: "SA", label: "SA" },
  SVP: { key: "SVP", label: "SV%" },
  SO: { key: "SO", label: "SO" },
};

const NON_NUMERIC_PLAYER_STAT_KEYS = new Set([
  "player",
  "pos",
  "nhlTeam",
  "date",
  "opp",
  "score",
]);

type SeasonCategoryList = readonly string[] | undefined;
type NumericStatValue = string | number | null | undefined;
type PlayerStatCellValue = PlayerStatRow[
  | PlayerStatContextKey
  | PlayerStatCategoryKey];

/**
 * Normalizes season category.
 *
 * @param category - The category to use.
 * @returns The normalized season category.
 */
function normalizeSeasonCategory(
  category: string,
): PlayerStatCategoryKey | null {
  const value = category.trim().toUpperCase();
  if (!value) return null;
  if (value === "SV%") return "SVP";

  return value in MATCHUP_CATEGORY_MAP
    ? (value as PlayerStatCategoryKey)
    : null;
}

/**
 * Checks whether player stat category key.
 *
 * @param field - The field to use.
 * @returns The resulting player stat category key.
 */
function isPlayerStatCategoryKey(
  field: MatchupCategoryConfig["field"],
): field is PlayerStatCategoryKey {
  return field in MATCHUP_CATEGORY_MAP;
}

/**
 * Resolves matchup categories.
 *
 * @param categories - The categories to use.
 * @returns The resolved matchup categories.
 */
export function resolveMatchupCategories(
  categories?: SeasonCategoryList,
): MatchupStatCategoryConfig[] {
  const normalized =
    categories?.map((category) => normalizeSeasonCategory(category)) ?? [];

  const resolved = normalized
    .filter((category): category is PlayerStatCategoryKey => Boolean(category))
    .map((category) => MATCHUP_CATEGORY_MAP[category])
    .filter((category): category is MatchupStatCategoryConfig =>
      Boolean(category),
    );

  return resolved.length > 0 ? resolved : FALLBACK_MATCHUP_CATEGORIES;
}

/**
 * Checks whether player stat field exists.
 *
 * @param players - The players to use.
 * @param key - The key to use for the operation.
 * @returns True when player stat field; otherwise false.
 */
function hasPlayerStatField(
  players: PlayerStatRow[],
  key: PlayerStatContextKey | PlayerStatCategoryKey,
): boolean {
  return players.some((player) => {
    const value = player[key];
    if (value === undefined || value === null) return false;
    if (typeof value === "string") return value.trim() !== "";
    return true;
  });
}

/**
 * Builds player stat columns.
 *
 * @returns The assembled player stat columns.
 */
export function buildPlayerStatColumns({
  players,
  categories,
}: {
  players: PlayerStatRow[];
  categories?: SeasonCategoryList;
}): PlayerStatColumn[] {
  const resolvedColumns: PlayerStatColumn[] = [...PLAYER_STAT_IDENTITY_COLUMNS];

  for (const column of PLAYER_STAT_CONTEXT_COLUMNS) {
    if (column.key === "GP" || hasPlayerStatField(players, column.key)) {
      resolvedColumns.push(column);
    }
  }

  for (const category of resolveMatchupCategories(categories)) {
    resolvedColumns.push(PLAYER_STAT_CATEGORY_COLUMNS[category.field]);
  }

  for (const column of PLAYER_STAT_TRAILING_COLUMNS) {
    if (hasPlayerStatField(players, column.key)) {
      resolvedColumns.push(column);
    }
  }

  return resolvedColumns.filter((column, index, columns) => {
    return columns.findIndex((entry) => entry.key === column.key) === index;
  });
}

export const PLAYER_STAT_COLUMNS = buildPlayerStatColumns({
  players: [],
});

/**
 * Converts input into stat number.
 *
 * @param value - The source value to process.
 * @returns The converted stat number.
 */
export function toStatNumber(value: NumericStatValue): number {
  const numericValue =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : value == null
          ? 0
          : Number.NaN;
  return Number.isFinite(numericValue) ? numericValue : 0;
}

/**
 * Formats stat value for display.
 *
 * @param value - The source value to process.
 * @param precision - The precision to use.
 * @returns The formatted stat value.
 */
export function formatStatValue(
  value: NumericStatValue,
  precision?: number,
): string {
  const numericValue = toStatNumber(value);
  if (precision !== undefined) {
    return numericValue.toFixed(precision);
  }
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2);
}

/**
 * Resolves category winner.
 *
 * @param homeValue - The home value to use.
 * @param awayValue - The away value to use.
 * @param isInverse - The is inverse to use.
 * @returns The resolved category winner.
 */
export function resolveCategoryWinner(
  homeValue: number,
  awayValue: number,
  isInverse = false,
): "home" | "away" | "tie" {
  if (isInverse) {
    if (homeValue > 0 && awayValue > 0) {
      if (homeValue < awayValue) return "home";
      if (awayValue < homeValue) return "away";
    }
    return "tie";
  }

  if (homeValue > awayValue) return "home";
  if (awayValue > homeValue) return "away";
  return "tie";
}

/**
 * Determines whether win category happened.
 *
 * @param teamValue - The team value to use.
 * @param opponentValue - The opponent value to use.
 * @param isInverse - The is inverse to use.
 * @returns True when win category; otherwise false.
 */
export function didWinCategory(
  teamValue: number,
  opponentValue: number,
  isInverse = false,
): boolean {
  return resolveCategoryWinner(teamValue, opponentValue, isInverse) === "home";
}

/**
 * Returns stat cell class.
 *
 * @param won - The won to use.
 * @returns The requested stat cell class.
 */
export function getStatCellClass(won: boolean): string {
  return `py-1 text-center ${won ? "font-semibold" : "font-light text-gray-400"}`;
}

/**
 * Returns score cell class.
 *
 * @param won - The won to use.
 * @returns The requested score cell class.
 */
export function getScoreCellClass(won: boolean): string {
  return `justify-center py-1 text-center text-lg ${won ? "font-semibold" : "font-light text-gray-400"}`;
}

/**
 * Converts input into category number.
 *
 * @param stats - The stats to use.
 * @param category - The category to use.
 * @returns The converted category number.
 */
export function toCategoryNumber(
  stats: TeamWeekStatLine,
  category: MatchupCategoryConfig,
): number {
  if (!isPlayerStatCategoryKey(category.field)) return 0;
  return toStatNumber(stats[category.field]);
}

/**
 * Formats category value for display.
 *
 * @param stats - The stats to use.
 * @param category - The category to use.
 * @returns The formatted category value.
 */
export function formatCategoryValue(
  stats: TeamWeekStatLine,
  category: MatchupCategoryConfig,
): string {
  if (!isPlayerStatCategoryKey(category.field)) return "0";
  return formatStatValue(stats[category.field], category.precision);
}

/**
 * Formats week range for display.
 *
 * @param startDate - The start date to use.
 * @param endDate - The end date to use.
 * @returns The formatted week range.
 */
export function formatWeekRange(
  startDate?: string,
  endDate?: string,
): string | null {
  if (!startDate || !endDate) return null;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    month: "short",
    day: "numeric",
  });

  return `${formatter.format(new Date(startDate))} - ${formatter.format(new Date(endDate))}`;
}

/**
 * Formats matchup player name for display.
 *
 * @param player - The player to use.
 * @returns The formatted matchup player name.
 */
export function formatMatchupPlayerName(player: PlayerStatRow): string {
  const fullName = player.fullName?.trim();
  if (fullName) {
    return fullName;
  }

  const fallbackName = [player.firstName, player.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  return fallbackName || "Unknown Player";
}

/**
 * Formats matchup player positions for display.
 *
 * @param player - The player to use.
 * @returns The formatted matchup player positions.
 */
export function formatMatchupPlayerPositions(player: PlayerStatRow): string {
  if (Array.isArray(player.nhlPos) && player.nhlPos.length > 0) {
    return player.nhlPos.join("/");
  }
  return String(player.posGroup ?? "-");
}

/**
 * Returns star players.
 *
 * @param players - The players to use.
 * @param teamLookup - The team lookup to use.
 * @returns The requested star players.
 */
export function getStarPlayers(
  players: MatchupPlayerStat[],
  teamLookup: Map<string, GSHLTeam>,
): StarPlayer[] {
  return players
    .filter((player) => {
      return (
        toStatNumber(player.GP) > 0 ||
        toStatNumber(player.G) > 0 ||
        toStatNumber(player.A) > 0 ||
        toStatNumber(player.W) > 0 ||
        toStatNumber(player.SV) > 0
      );
    })
    .sort((left, right) => {
      const ratingDelta =
        toStatNumber(right.Rating) - toStatNumber(left.Rating);
      if (ratingDelta !== 0) return ratingDelta;

      const pointsDelta = toStatNumber(right.P) - toStatNumber(left.P);
      if (pointsDelta !== 0) return pointsDelta;

      const winsDelta = toStatNumber(right.W) - toStatNumber(left.W);
      if (winsDelta !== 0) return winsDelta;

      const savesDelta = toStatNumber(right.SV) - toStatNumber(left.SV);
      if (savesDelta !== 0) return savesDelta;

      return formatMatchupPlayerName(left).localeCompare(
        formatMatchupPlayerName(right),
      );
    })
    .slice(0, 3)
    .map((player, index) => ({
      ...player,
      starRank: (index + 1) as 1 | 2 | 3,
      team: teamLookup.get(String(player.gshlTeamId)) ?? null,
      numericRating: toStatNumber(player.Rating),
    }));
}

/**
 * Renders player stat cell.
 *
 * @param player - The player to use.
 * @param key - The key to use for the operation.
 * @returns The rendered player stat cell.
 */
export function renderPlayerStatCell(
  player: PlayerStatRow,
  key: PlayerStatColumnKey,
): string {
  if (key === "player") {
    return formatMatchupPlayerName(player);
  }

  if (key === "pos") {
    return formatPlayerPositionList(
      player.nhlPos,
      String(player.posGroup ?? player.dailyPos ?? "-"),
    );
  }

  if (key === "GAA") {
    return formatStatValue(player[key], 2);
  }

  if (key === "SVP" || key === "Rating") {
    return formatStatValue(player[key], 3);
  }

  const value: PlayerStatCellValue = player[key];
  if (value == null || value === "") {
    return NON_NUMERIC_PLAYER_STAT_KEYS.has(key) ? "-" : "0";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "-";
}

/**
 * Builds category results.
 *
 * @param homeTeamStats - The home team stats to use.
 * @param awayTeamStats - The away team stats to use.
 * @param matchupCategories - The matchup categories to use.
 * @returns The assembled category results.
 */
export function buildCategoryResults(
  homeTeamStats: TeamWeekStatLine,
  awayTeamStats: TeamWeekStatLine,
  matchupCategories: MatchupCategoryConfig[],
): CategoryResult[] {
  return matchupCategories.map((category) => {
    if (!isPlayerStatCategoryKey(category.field)) {
      return {
        key: String(category.field),
        label: category.label,
        homeValue: "0",
        awayValue: "0",
        winner: "tie",
      };
    }

    const homeValue = toStatNumber(homeTeamStats[category.field]);
    const awayValue = toStatNumber(awayTeamStats[category.field]);
    return {
      key: String(category.field),
      label: category.label,
      homeValue: formatStatValue(
        homeTeamStats[category.field],
        category.precision,
      ),
      awayValue: formatStatValue(
        awayTeamStats[category.field],
        category.precision,
      ),
      winner: resolveCategoryWinner(homeValue, awayValue, category.isInverse),
    };
  });
}
