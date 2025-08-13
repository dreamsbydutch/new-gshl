// Transformed types for the sheets adapter
import type * as DB from "./database";

export type TransformedSeason = DB.Season;

export type TransformedConference = DB.Conference;

export type TransformedWeek = DB.Week;

export type TransformedMatchup = DB.Matchup;

export type TransformedEvent = DB.Event;

export type TransformedOwner = DB.Owner;

export type TransformedFranchise = DB.Franchise;

export type TransformedTeam = DB.Team;

export type TransformedPlayer = DB.Player;

export type TransformedContract = DB.Contract;

// Statistics transformed types
export type TransformedPlayerDayStatLine = DB.PlayerDayStatLine;

export type TransformedPlayerWeekStatLine = DB.PlayerWeekStatLine;

export type TransformedPlayerSplitStatLine = DB.PlayerSplitStatLine;

export type TransformedPlayerTotalStatLine = DB.PlayerTotalStatLine;

export type TransformedPlayerNHLStatLine = DB.PlayerNHLStatLine;

export type TransformedTeamDayStatLine = DB.TeamDayStatLine;

export type TransformedTeamWeekStatLine = DB.TeamWeekStatLine;

export type TransformedTeamSeasonStatLine = DB.TeamSeasonStatLine;

// Model map for generic operations
export interface TransformedModelMap {
  Season: TransformedSeason;
  Conference: TransformedConference;
  Week: TransformedWeek;
  Matchup: TransformedMatchup;
  Event: TransformedEvent;
  Owner: TransformedOwner;
  Franchise: TransformedFranchise;
  Team: TransformedTeam;
  Player: TransformedPlayer;
  Contract: TransformedContract;
  PlayerDayStatLine: TransformedPlayerDayStatLine;
  PlayerWeekStatLine: TransformedPlayerWeekStatLine;
  PlayerSplitStatLine: TransformedPlayerSplitStatLine;
  PlayerTotalStatLine: TransformedPlayerTotalStatLine;
  PlayerNHLStatLine: TransformedPlayerNHLStatLine;
  TeamDayStatLine: TransformedTeamDayStatLine;
  TeamWeekStatLine: TransformedTeamWeekStatLine;
  TeamSeasonStatLine: TransformedTeamSeasonStatLine;
}

export type ModelName = keyof TransformedModelMap;
