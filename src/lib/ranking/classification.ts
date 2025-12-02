import { PositionGroup, SeasonType } from "../types/enums";
import type {
  AggregationLevel,
  EntityType,
  ModelClassification,
  StatLine,
} from "./types";

const SEASON_PHASE_DEFAULT = SeasonType.REGULAR_SEASON;
const POSITION_GROUP_VALUES = new Set<PositionGroup>([
  PositionGroup.F,
  PositionGroup.D,
  PositionGroup.G,
]);

const SEASON_PHASE_ALIASES: Record<string, SeasonType> = {
  REGULAR_SEASON: SeasonType.REGULAR_SEASON,
  REGULAR: SeasonType.REGULAR_SEASON,
  RS: SeasonType.REGULAR_SEASON,
  PLAYOFFS: SeasonType.PLAYOFFS,
  PO: SeasonType.PLAYOFFS,
  LOSERS_TOURNAMENT: SeasonType.LOSERS_TOURNAMENT,
  LOSERS: SeasonType.LOSERS_TOURNAMENT,
  LT: SeasonType.LOSERS_TOURNAMENT,
};

const normalizeRawValue = (value: unknown): string | null => {
  if (typeof value === "string" || typeof value === "number") {
    const normalized = String(value).trim().toUpperCase();
    return normalized.length > 0 ? normalized : null;
  }
  return null;
};

function detectEntityType(line: StatLine): EntityType {
  if (line.entityType === "team") return "team";
  if (line.entityType === "player") return "player";
  if ("playerId" in line && line.playerId) return "player";
  if ("gshlTeamId" in line && line.gshlTeamId) return "team";
  if ("teamId" in line && line.teamId) return "team";
  return "player";
}

function normalizePosGroup(
  value: unknown,
  entityType: EntityType,
): PositionGroup | null {
  if (entityType === "team") return PositionGroup.TEAM;
  const normalized = normalizeRawValue(value);
  if (!normalized) return null;
  return POSITION_GROUP_VALUES.has(normalized as PositionGroup)
    ? (normalized as PositionGroup)
    : null;
}

function detectAggregationLevel(
  line: StatLine,
  entityType: EntityType,
): AggregationLevel {
  const hasDate = Boolean(line.date);
  const hasWeekId = Boolean(line.weekId);
  const hasSeasonType =
    typeof line.seasonType === "string" && line.seasonType !== "";
  const hasDays =
    "days" in line && line.days !== undefined && line.days !== null;
  const hasTeamList = "gshlTeamIds" in line && Array.isArray(line.gshlTeamIds);
  const hasNhlFields =
    "seasonRating" in line ||
    "overallRating" in line ||
    "salary" in line ||
    "QS" in line ||
    "RBS" in line;

  if (entityType === "player") {
    if (hasNhlFields) return "playerNhl";
    if (hasDate) return "playerDay";
    if (hasWeekId && hasDays) return "playerWeek";
    if (hasSeasonType && line.gshlTeamId) return "playerSplit";
    if (hasTeamList) return "playerTotal";
    if (hasSeasonType) return "playerTotal";
    return hasWeekId ? "playerWeek" : "playerDay";
  }

  if (hasDate) return "teamDay";
  if (hasWeekId) return "teamWeek";
  return "teamSeason";
}

function normalizeSeasonPhase(value: unknown): SeasonType {
  const normalized = normalizeRawValue(value);
  if (!normalized) return SEASON_PHASE_DEFAULT;
  return SEASON_PHASE_ALIASES[normalized] ?? SEASON_PHASE_DEFAULT;
}

export function resolveSeasonPhase(
  line: StatLine,
  weekTypeLookup?: Record<string, SeasonType>,
): SeasonType {
  if (line.seasonPhase) return normalizeSeasonPhase(line.seasonPhase);
  if (line.seasonType) return normalizeSeasonPhase(line.seasonType);
  const weekPhase = line.weekId ? weekTypeLookup?.[line.weekId] : undefined;
  if (weekPhase) return weekPhase;
  return SEASON_PHASE_DEFAULT;
}

export function classifyStatLine(
  line: StatLine,
  weekTypeLookup?: Record<string, SeasonType>,
): ModelClassification | null {
  const seasonId = line.seasonId ? String(line.seasonId) : "";
  if (!seasonId) return null;

  const entityType = detectEntityType(line);
  const aggregationLevel = detectAggregationLevel(line, entityType);
  const posGroup = normalizePosGroup(
    line.posGroup ?? line.POS_GROUP,
    entityType,
  );
  if (!posGroup) return null;

  const seasonPhase = resolveSeasonPhase(line, weekTypeLookup);

  return {
    seasonId,
    posGroup,
    aggregationLevel,
    entityType,
    seasonPhase,
  };
}

export function buildModelKey(meta: ModelClassification): string {
  return [
    meta.seasonPhase,
    meta.seasonId,
    meta.aggregationLevel,
    meta.posGroup,
  ].join(":");
}
