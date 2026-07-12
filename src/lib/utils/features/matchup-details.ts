import type {
  CategoryResult,
  MatchupPlayerStat,
  PlayerStatColumn,
  PlayerStatColumnKey,
  StarPlayer,
} from "@gshl-types";
import type {
  GSHLTeam,
  MatchupCategoryConfig,
  TeamWeekStatLine,
} from "@gshl-types";
import { formatPlayerPositionList } from "../domain/player";

export const MATCHUP_CATEGORY_MAP: Record<string, MatchupCategoryConfig> = {
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
};

export const FALLBACK_MATCHUP_CATEGORIES: MatchupCategoryConfig[] = [
  MATCHUP_CATEGORY_MAP.G!,
  MATCHUP_CATEGORY_MAP.A!,
  MATCHUP_CATEGORY_MAP.P!,
  MATCHUP_CATEGORY_MAP.PPP!,
  MATCHUP_CATEGORY_MAP.SOG!,
  MATCHUP_CATEGORY_MAP.HIT!,
  MATCHUP_CATEGORY_MAP.BLK!,
  MATCHUP_CATEGORY_MAP.W!,
  MATCHUP_CATEGORY_MAP.GAA!,
  MATCHUP_CATEGORY_MAP.SVP!,
];

export const PLAYER_STAT_COLUMNS: PlayerStatColumn[] = [
  { key: "player", label: "Player", className: "min-w-[180px]" },
  { key: "pos", label: "Pos", className: "min-w-[72px]" },
  { key: "nhlTeam", label: "NHL" },
  { key: "days", label: "Days" },
  { key: "GP", label: "GP" },
  { key: "GS", label: "GS" },
  { key: "G", label: "G" },
  { key: "A", label: "A" },
  { key: "P", label: "P" },
  { key: "PM", label: "+/-" },
  { key: "PIM", label: "PIM" },
  { key: "PPP", label: "PPP" },
  { key: "SOG", label: "SOG" },
  { key: "HIT", label: "HIT" },
  { key: "BLK", label: "BLK" },
  { key: "W", label: "W" },
  { key: "GA", label: "GA" },
  { key: "GAA", label: "GAA" },
  { key: "SV", label: "SV" },
  { key: "SA", label: "SA" },
  { key: "SVP", label: "SV%" },
  { key: "SO", label: "SO" },
  { key: "Rating", label: "Rating" },
];

function normalizeSeasonCategory(category: unknown): string | null {
  if (typeof category !== "string" && typeof category !== "number") {
    return null;
  }

  const value = `${category}`.trim().toUpperCase();
  if (!value) return null;
  if (value === "SV%") return "SVP";
  return value;
}

export function resolveMatchupCategories(
  categories: unknown,
): MatchupCategoryConfig[] {
  const normalized = Array.isArray(categories)
    ? categories.map((category) => normalizeSeasonCategory(category))
    : typeof categories === "string" || typeof categories === "number"
      ? `${categories}`
          .split(",")
          .map((category) => normalizeSeasonCategory(category))
      : [];

  const resolved = normalized
    .filter((category): category is string => Boolean(category))
    .map((category) => MATCHUP_CATEGORY_MAP[category])
    .filter((category): category is MatchupCategoryConfig => Boolean(category));

  return resolved.length > 0 ? resolved : FALLBACK_MATCHUP_CATEGORIES;
}

export function toStatNumber(value: unknown): number {
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

export function formatStatValue(value: unknown, precision?: number): string {
  const numericValue = toStatNumber(value);
  if (precision !== undefined) {
    return numericValue.toFixed(precision);
  }
  return Number.isInteger(numericValue)
    ? String(numericValue)
    : numericValue.toFixed(2);
}

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

export function didWinCategory(
  teamValue: number,
  opponentValue: number,
  isInverse = false,
): boolean {
  return resolveCategoryWinner(teamValue, opponentValue, isInverse) === "home";
}

export function getStatCellClass(won: boolean): string {
  return `py-1 text-center ${won ? "font-semibold" : "font-light text-gray-400"}`;
}

export function getScoreCellClass(won: boolean): string {
  return `justify-center py-1 text-center text-lg ${won ? "font-semibold" : "font-light text-gray-400"}`;
}

export function toCategoryNumber(
  stats: TeamWeekStatLine,
  category: MatchupCategoryConfig,
): number {
  return toStatNumber(stats[category.field]);
}

export function formatCategoryValue(
  stats: TeamWeekStatLine,
  category: MatchupCategoryConfig,
): string {
  return formatStatValue(stats[category.field], category.precision);
}

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

export function formatMatchupPlayerName(player: MatchupPlayerStat): string {
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

export function formatMatchupPlayerPositions(player: MatchupPlayerStat): string {
  if (Array.isArray(player.nhlPos) && player.nhlPos.length > 0) {
    return player.nhlPos.join("/");
  }
  return String(player.posGroup ?? "-");
}

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
      const ratingDelta = toStatNumber(right.Rating) - toStatNumber(left.Rating);
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

export function renderPlayerStatCell(
  player: MatchupPlayerStat,
  key: PlayerStatColumnKey,
): string {
  if (key === "player") {
    return formatMatchupPlayerName(player);
  }

  if (key === "pos") {
    return formatPlayerPositionList(player.nhlPos, String(player.posGroup ?? "-"));
  }

  if (key === "GAA") {
    return formatStatValue(player[key], 2);
  }

  if (key === "SVP" || key === "Rating") {
    return formatStatValue(player[key], 3);
  }

  return String(player[key] ?? "0");
}

export function buildCategoryResults(
  homeTeamStats: TeamWeekStatLine,
  awayTeamStats: TeamWeekStatLine,
  matchupCategories: MatchupCategoryConfig[],
): CategoryResult[] {
  return matchupCategories.map((category) => {
    const homeValue = toStatNumber(homeTeamStats[category.field]);
    const awayValue = toStatNumber(awayTeamStats[category.field]);
    return {
      key: String(category.field),
      label: category.label,
      homeValue: formatStatValue(homeTeamStats[category.field], category.precision),
      awayValue: formatStatValue(awayTeamStats[category.field], category.precision),
      winner: resolveCategoryWinner(homeValue, awayValue, category.isInverse),
    };
  });
}
