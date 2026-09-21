export type CompositeKeyModelName =
  | "PlayerDayStatLine"
  | "PlayerWeekStatLine"
  | "PlayerSplitStatLine"
  | "PlayerTotalStatLine"
  | "PlayerCareerSplitStatLine"
  | "PlayerCareerTotalStatLine"
  | "PlayerNHLStatLine"
  | "TeamDayStatLine"
  | "TeamWeekStatLine"
  | "TeamSeasonStatLine";

export function getCompositeKeyColumnsForModel(
  modelName: CompositeKeyModelName,
): readonly string[] {
  switch (modelName) {
    case "PlayerDayStatLine":
      return ["playerId", "date"];
    case "PlayerWeekStatLine":
      return ["playerId", "weekId", "gshlTeamId"];
    case "PlayerSplitStatLine":
      return ["playerId", "seasonId", "gshlTeamId", "seasonType"];
    case "PlayerTotalStatLine":
      return ["playerId", "seasonId", "seasonType"];
    case "PlayerCareerSplitStatLine":
      return ["playerId", "gshlTeamId", "seasonType"];
    case "PlayerCareerTotalStatLine":
      return ["playerId", "seasonType"];
    case "PlayerNHLStatLine":
      return ["playerId", "seasonId"];
    case "TeamDayStatLine":
      return ["seasonId", "gshlTeamId", "date"];
    case "TeamWeekStatLine":
      return ["seasonId", "gshlTeamId", "weekId"];
    case "TeamSeasonStatLine":
      return ["seasonId", "gshlTeamId", "seasonType"];
  }
}

type DatabaseValue =
  | string
  | number
  | boolean
  | Date
  | null
  | undefined
  | unknown[]
  | Record<string, unknown>;

export type DatabaseRecord = Record<string, DatabaseValue>;

function normalizeMultiValueTokens(value: unknown): string[] {
  if (value === null || value === undefined || value === "") return [];
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeMultiValueTokens(entry));
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.flatMap((entry) => normalizeMultiValueTokens(entry));
      }
    } catch {
      // Fall through to CSV parsing for plain comma-separated values.
    }
    return trimmed
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);
  }

  return [String(value).trim()].filter(Boolean);
}

export function serializeCsvMultiValue(value: unknown): string {
  return normalizeMultiValueTokens(value).join(",");
}
