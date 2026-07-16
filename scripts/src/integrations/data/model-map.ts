import type { SHEETS_CONFIG } from "../sheets/config/config";

export type ModelName = keyof typeof SHEETS_CONFIG.SHEETS;

export const MODEL_TO_CONVEX_TABLE = {
  Season: "seasons",
  Conference: "conferences",
  Franchise: "franchises",
  Team: "teams",
  Owner: "owners",
  Player: "players",
  Contract: "contracts",
  Week: "weeks",
  Matchup: "matchups",
  Event: "events",
  Awards: "awards",
  DraftPick: "draftPicks",
  nhlTeam: "nhlTeams",
  NHLTeam: "nhlTeams",
  PlayerDayStatLine: "playerDayStatLines",
  PlayerWeekStatLine: "playerWeekStatLines",
  PlayerSplitStatLine: "playerSplitStatLines",
  PlayerTotalStatLine: "playerTotalStatLines",
  PlayerCareerSplitStatLine: "playerCareerSplitStatLines",
  PlayerCareerTotalStatLine: "playerCareerTotalStatLines",
  PlayerNHLStatLine: "playerNhlStatLines",
  TeamDayStatLine: "teamDayStatLines",
  TeamWeekStatLine: "teamWeekStatLines",
  TeamSeasonStatLine: "teamSeasonStatLines",
} as const satisfies Record<ModelName, string>;

export const CONVEX_TABLE_TO_MODEL = Object.fromEntries(
  Object.entries(MODEL_TO_CONVEX_TABLE).map(([model, table]) => [table, model]),
) as Record<string, ModelName>;

export function getConvexTableName(modelName: ModelName): string {
  return MODEL_TO_CONVEX_TABLE[modelName];
}
