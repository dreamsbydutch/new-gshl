/**
 * Feature Utilities
 * -----------------
 * Component-specific utility functions for individual features.
 * Each file corresponds to a specific UI component or feature area.
 */

export * from "./contract-table";
export * from "./draft-board-list";
export * from "./draft-admin";

// locker-room-header exports (including TeamInfoProps)
export * from "./locker-room-header";

// standings-container exports (has TeamInfoProps conflict - aliased as StandingsTeamInfoProps)
export {
  CONFERENCE_ABBREVIATIONS,
  CONFERENCE_TITLES,
  STANDINGS_TYPES,
  OVERALL_SEED_FIELDS,
  CONFERENCE_SEED_FIELDS,
  WILDCARD_FIELDS,
  LOSERS_TOURNEY_FIELDS,
  WILDCARD_TEAM_LIMITS,
  groupTeamsByStandingsType,
  filterTeamsByConference,
  getOrdinalSuffix,
  calculatePercentage,
  formatSeedPosition,
} from "./standings-container";
export type {
  StandingsType,
  StandingsOption,
  StandingsGroup,
  StandingsContainerProps,
  StandingsItemProps,
  TeamInfoProps as StandingsTeamInfoProps,
  PlayoffProbType,
} from "./standings-container";

export * from "./team-draft-pick-list";

// team-history exports (has GameType - aliased from TeamHistoryGameType)
export {
  GAME_TYPE_OPTIONS,
  SEASON_OPTIONS,
  SEASON_SPLIT_INITIAL,
  PLAYOFF_TRANSITION_YEAR,
  removeDuplicates,
  calculateWinLossRecord,
  calculateWinPercentage,
  parseGameTypeValue,
  parseNumericValue,
  buildOwnerOptions,
  getMatchupHeaderText,
  getMatchupBackgroundColor,
  getScoreColor,
} from "./team-history";
export type {
  GameType as TeamHistoryGameType,
  WinLoss,
  MatchupDataType,
  TeamHistoryProps,
  FilterDropdownsProps,
  RecordDisplayProps,
  MatchupListProps,
  TeamHistoryMatchupLineProps,
} from "./team-history";

export * from "./team-roster";

// team-schedule exports (has GameType conflict)
export {
  GAME_TYPE_STYLES,
  RESULT_STYLES,
  filterTeamMatchups,
  sortMatchupsByWeek,
  findWeekById,
  getGameLocation,
  getGameTypeDisplay,
  getConferenceColor,
  formatOpponentDisplay,
  shouldShowRank,
  isGameCompleted,
  didTeamWin,
  getResultStyleClass,
  formatTeamScore,
} from "./team-schedule";
export type {
  TeamScheduleItemProps,
  OpponentDisplayProps,
  GameResultProps,
  WeekDisplayProps,
  GameLocation,
  GameType as TeamScheduleGameType,
  GameTypeDisplay,
  ConferenceConfig,
} from "./team-schedule";

// weekly-schedule exports (has GameType conflict)
export {
  WEEKLY_CONFERENCES,
  BACKGROUND_CLASSES,
  DEFAULT_BACKGROUND_CLASS,
  filterMatchupsByWeek,
  sortMatchupsByRating,
  getGameBackgroundClass,
  shouldDisplayRanking,
  isMatchupCompleted,
  getScoreClass,
  isValidMatchup,
} from "./weekly-schedule";
export type {
  WeekScheduleItemProps,
  TeamDisplayProps,
  ScoreDisplayProps,
  GameType as WeeklyGameType,
  ConferenceAbbr,
  GameTypeConfig,
} from "./weekly-schedule";
