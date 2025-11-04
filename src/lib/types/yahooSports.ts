/**
 * Yahoo Fantasy Sports (NHL) Type Definitions
 * -------------------------------------------------------------
 * Centralized collection of TypeScript types that model the Yahoo Fantasy Sports
 * REST v2 resources relevant to a fantasy hockey league. The interfaces mirror the
 * raw response shape returned by the public API (XML converted to JSON) while also
 * exposing ergonomic unions and helpers for application code.
 *
 * The API groups data under resource collections (games, leagues, teams, players,
 * transactions, users). Each section below documents the structure of those
 * resources plus the derived metadata returned by Yahoo. All exported types are
 * safe to import from "@/lib/types" via the root barrel file once registered there.
 */

// ============================================================================
// Base primitives & helpers
// ============================================================================

/**
 * Boolean flags in Yahoo responses can be returned as strings ("0" | "1"),
 * numbers (0 | 1), or actual booleans once normalized. This union keeps calling
 * code tolerant of any variant.
 */
export type YahooBooleanFlag = 0 | 1 | "0" | "1" | boolean;

/**
 * Numeric values in the API are frequently serialized as strings. Consumers can
 * continue treating them as strings or coerce them to numbers when needed.
 */
export type YahooNumericValue = string | number;

/**
 * Enumeration of coverage windows available across stats, points, and standings
 * endpoints in Yahoo's fantasy API.
 */
export type YahooCoverageType =
  | "season"
  | "week"
  | "date"
  | "lastweek"
  | "lastmonth"
  | "projected";

/**
 * Scoring styles supported by Yahoo fantasy leagues.
 */
export type YahooScoringType = "head" | "points" | "rotisserie";

/**
 * Draft lifecycle flags returned on league resources.
 */
export type YahooDraftStatus = "predraft" | "postdraft" | "inprogress";

/**
 * Draft room types supported by Yahoo.
 */
export type YahooDraftType = "live" | "auto" | "offline" | "timed";

/**
 * League matchup status values returned by scoreboard/matchup endpoints.
 */
export type YahooMatchupStatus =
  | "pre"
  | "live"
  | "postevent"
  | "cancelled"
  | "pending";

/**
 * Transaction activity types surfaced by the transactions resource.
 */
export type YahooTransactionType =
  | "add"
  | "drop"
  | "add/drop"
  | "trade"
  | "pending_trade"
  | "completed_trade"
  | "waiver"
  | "commish"
  | "keeper";

/**
 * Potential transaction state values representing lifecycle progress.
 */
export type YahooTransactionStatus =
  | "successful"
  | "failed"
  | "pending"
  | "proposed"
  | "cancelled"
  | "vetoed";

/**
 * Yahoo fantasy hockey roster position tokens.
 */
export type YahooHockeyRosterPosition =
  | "C"
  | "LW"
  | "RW"
  | "F"
  | "W"
  | "D"
  | "G"
  | "Util"
  | "BN"
  | "IR"
  | "IR+";

/**
 * Position grouping flags returned in stat categories and roster metadata for NHL.
 */
export type YahooHockeyPositionType = "P" | "G";

/**
 * Game codes identify the professional league. For NHL this is always "nhl".
 */
export type YahooHockeyGameCode = "nhl";

// ============================================================================
// Response wrapper metadata
// ============================================================================

/**
 * Metadata envelope returned on every Yahoo fantasy response (mapped from XML
 * attributes when converted to JSON).
 */
export interface YahooFantasyMetadata {
  /** Duration (in ms) Yahoo reports for generating the response. */
  time?: string;
  /** Copyright attribution required by Yahoo and STATS, LLC. */
  copyright?: string;
  /** Locale hint reported via xml:lang. */
  language?: string;
  /** Original Yahoo URI for the requested resource. */
  yahooUri?: string;
}

/**
 * Generic wrapper for Yahoo fantasy responses. The `payload` property mirrors the
 * nested resource tree (game, league, etc.) while `meta` carries the shared
 * response metadata.
 */
export interface YahooFantasyResponse<TPayload> {
  meta?: YahooFantasyMetadata;
  payload: TPayload;
}

// ============================================================================
// Game resource types
// ============================================================================

/**
 * A single Yahoo fantasy game (sport + season). Hockey maps to the "nhl" code.
 */
export interface YahooGame {
  game_key: string;
  game_id: string;
  code: YahooHockeyGameCode;
  name: string;
  type: string;
  url: string;
  season: string;
  is_registration_over?: YahooBooleanFlag;
  is_game_over?: YahooBooleanFlag;
  is_offseason?: YahooBooleanFlag;
  is_live_draft_lobby?: YahooBooleanFlag;
  signup_url?: string;
  league_count?: YahooNumericValue;
  team_count?: YahooNumericValue;
  roster_positions?: YahooRosterPositions;
  stat_categories?: YahooStatCategories;
  stat_modifiers?: YahooStatModifiers;
  game_weeks?: YahooGameWeeks;
}

/**
 * Collection wrapper for games as returned by `/games` endpoints.
 */
export interface YahooGamesCollection {
  game?: YahooGame | YahooGame[];
  count?: YahooNumericValue;
}

/**
 * Week boundaries for a fantasy season. Yahoo uses weeks for head-to-head hockey.
 */
export interface YahooGameWeek {
  week: string;
  display_name?: string;
  start?: string;
  end?: string;
}

/**
 * Collection wrapper for game week entries.
 */
export interface YahooGameWeeks {
  week?: YahooGameWeek | YahooGameWeek[];
}

/**
 * Metadata describing roster position slots within a game or league.
 */
export interface YahooRosterPosition {
  position: YahooHockeyRosterPosition;
  /** Number of slots for this position. */
  count?: YahooNumericValue;
  /** Indicates a bench-only position. */
  is_bench?: YahooBooleanFlag;
  /** Marks a position that can start (counts toward roster limit). */
  is_starting_position?: YahooBooleanFlag;
  /** Optional grouping (skater vs goalie). */
  position_type?: YahooHockeyPositionType;
}

/**
 * Wrapper for roster position definitions.
 */
export interface YahooRosterPositions {
  roster_position?: YahooRosterPosition | YahooRosterPosition[];
}

/**
 * Statistical scoring categories configured for a league/game.
 */
export interface YahooStatCategory {
  stat_id: number;
  name: string;
  display_name?: string;
  sort_order?: YahooNumericValue;
  position_type?: YahooHockeyPositionType;
  is_only_display_stat?: YahooBooleanFlag;
  enabled?: YahooBooleanFlag;
}

/**
 * Wrapper for stat category lists as returned by Yahoo.
 */
export interface YahooStatCategories {
  stats?: { stat: YahooStatCategory | YahooStatCategory[] };
}

/**
 * Modifier weights applied to stat categories (e.g., points per stat).
 */
export interface YahooStatModifier {
  stat_id: number;
  value: YahooNumericValue;
}

/**
 * Wrapper for stat modifier lists.
 */
export interface YahooStatModifiers {
  stats?: { stat: YahooStatModifier | YahooStatModifier[] };
}

// ============================================================================
// League resource types
// ============================================================================

/**
 * Core league metadata returned by `/league/{league_key}`.
 */
export interface YahooLeague {
  league_key: string;
  league_id: string;
  name: string;
  url: string;
  draft_status: YahooDraftStatus;
  num_teams: YahooNumericValue;
  edit_key?: string;
  current_week?: string;
  start_week?: string;
  end_week?: string;
  start_date?: string;
  end_date?: string;
  season?: string;
  logo_url?: string;
  password?: string;
  allow_add_to_dl?: YahooBooleanFlag;
  scoring_type: YahooScoringType;
  is_finished?: YahooBooleanFlag;
  settings?: YahooLeagueSettings;
  standings?: YahooLeagueStandings;
  scoreboard?: YahooLeagueScoreboard;
  teams?: YahooTeamsCollection;
  transactions?: YahooTransactionsCollection;
}

/**
 * Detailed configuration for a league including roster rules and scoring.
 */
export interface YahooLeagueSettings {
  draft_type: YahooDraftType;
  scoring_type: YahooScoringType;
  uses_faab?: YahooBooleanFlag;
  max_teams?: YahooNumericValue;
  trade_end_date?: string;
  trade_ratify_type?: string;
  trade_reject_time?: YahooNumericValue;
  playoff_start_week?: YahooNumericValue;
  uses_playoff?: YahooBooleanFlag;
  uses_playoff_reseeding?: YahooBooleanFlag;
  uses_lock_eliminated_teams?: YahooBooleanFlag;
  roster_positions?: YahooRosterPositions;
  stat_categories?: YahooStatCategories;
  stat_modifiers?: YahooStatModifiers;
  divisions?: YahooLeagueDivisions;
}

/**
 * League division metadata when the league splits teams into groups.
 */
export interface YahooLeagueDivision {
  division_id: string;
  name: string;
}

/**
 * Wrapper for league division listings.
 */
export interface YahooLeagueDivisions {
  division?: YahooLeagueDivision | YahooLeagueDivision[];
}

// ============================================================================
// Standings, scoreboard, and matchup data
// ============================================================================

/**
 * League standings structure reporting ranks for each team.
 */
export interface YahooLeagueStandings {
  teams: YahooTeamsCollection;
}

/**
 * Scoreboard response containing head-to-head matchups for a given week.
 */
export interface YahooLeagueScoreboard {
  week: string;
  matchups: YahooMatchupsCollection;
}

/**
 * Collection wrapper for matchup entries.
 */
export interface YahooMatchupsCollection {
  matchup?: YahooMatchup | YahooMatchup[];
  count?: YahooNumericValue;
}

/**
 * Head-to-head matchup between two teams.
 */
export interface YahooMatchup {
  week: string;
  status: YahooMatchupStatus;
  is_tied?: YahooBooleanFlag;
  winner_team_key?: string;
  teams: YahooMatchupTeamsCollection;
}

/**
 * Wrapper for matchup team entries.
 */
export interface YahooMatchupTeamsCollection {
  team?: YahooMatchupTeam | YahooMatchupTeam[];
  count?: YahooNumericValue;
}

/**
 * Simplified team payload as returned inside matchup collections.
 */
export interface YahooMatchupTeam {
  team_key: string;
  team_id: string;
  name: string;
  url?: string;
  team_logos?: YahooTeamLogos;
  team_points?: YahooTeamPoints;
  team_projected_points?: YahooTeamPoints;
  team_stats?: YahooTeamStats;
}

// ============================================================================
// Team resource types
// ============================================================================

/**
 * Team metadata returned by `/team/{team_key}` and team sub resources.
 */
export interface YahooTeam {
  team_key: string;
  team_id: string;
  name: string;
  url?: string;
  waiver_priority?: YahooNumericValue;
  faab_balance?: YahooNumericValue;
  number_of_moves?: YahooNumericValue;
  number_of_trades?: YahooNumericValue;
  clinched_playoffs?: YahooBooleanFlag;
  managers?: YahooTeamManagers;
  team_logos?: YahooTeamLogos;
  team_points?: YahooTeamPoints;
  team_projected_points?: YahooTeamPoints;
  team_standings?: YahooTeamStandings;
  team_stats?: YahooTeamStats;
  roster?: YahooRoster;
  matchups?: YahooMatchupsCollection;
}

/**
 * Collection wrapper for teams when returned in leagues or users resources.
 */
export interface YahooTeamsCollection {
  team?: YahooTeam | YahooTeam[];
  count?: YahooNumericValue;
}

/**
 * Team logo entries (Yahoo may provide multiple sizes).
 */
export interface YahooTeamLogo {
  size?: "small" | "medium" | "large";
  url: string;
}

/**
 * Wrapper for team logos.
 */
export interface YahooTeamLogos {
  team_logo?: YahooTeamLogo | YahooTeamLogo[];
}

/**
 * Manager metadata for a fantasy team.
 */
export interface YahooManager {
  manager_id: string;
  nickname: string;
  guid?: string;
  email?: string;
  image_url?: string;
  is_commissioner?: YahooBooleanFlag;
  is_current_login?: YahooBooleanFlag;
}

/**
 * Wrapper for manager lists.
 */
export interface YahooTeamManagers {
  manager?: YahooManager | YahooManager[];
}

/**
 * Aggregated fantasy points for a team across a coverage window.
 */
export interface YahooTeamPoints {
  coverage_type: YahooCoverageType;
  season?: string;
  week?: string;
  date?: string;
  total: YahooNumericValue;
}

/**
 * Standings rollup for a team.
 */
export interface YahooTeamStandings {
  rank?: YahooNumericValue;
  points_for?: YahooNumericValue;
  points_against?: YahooNumericValue;
  outcomes?: YahooOutcomeTotals;
  divisional_outcomes?: YahooOutcomeTotals;
}

/**
 * Match outcome totals for standings and matchup summaries.
 */
export interface YahooOutcomeTotals {
  wins?: YahooNumericValue;
  losses?: YahooNumericValue;
  ties?: YahooNumericValue;
  percentage?: string;
}

/**
 * Statistical summary for a team over a coverage window.
 */
export interface YahooTeamStats {
  coverage_type: YahooCoverageType;
  date?: string;
  week?: string;
  season?: string;
  stats?: { stat: YahooPlayerStat | YahooPlayerStat[] };
}

// ============================================================================
// Roster & player resource types
// ============================================================================

/**
 * Active roster for a team on a specific date (NHL) or week.
 */
export interface YahooRoster {
  coverage_type: YahooCoverageType;
  week?: string;
  date?: string;
  players: YahooRosterPlayersCollection;
}

/**
 * Wrapper for roster player entries.
 */
export interface YahooRosterPlayersCollection {
  player?: YahooRosterPlayer | YahooRosterPlayer[];
  count?: YahooNumericValue;
}

/**
 * Player entry within a roster payload.
 */
export interface YahooRosterPlayer {
  player_key: string;
  player_id: string;
  name: YahooPlayerName;
  editorial_player_key?: string;
  editorial_team_key?: string;
  editorial_team_full_name?: string;
  editorial_team_abbr?: string;
  uniform_number?: string;
  display_position?: string;
  position_type?: YahooHockeyPositionType;
  is_undroppable?: YahooBooleanFlag;
  eligible_positions?: YahooEligiblePositions;
  selected_position?: YahooSelectedPosition;
  starting_status?: YahooStartingStatus;
  headshot_url?: string;
  status?: string;
  has_player_notes?: YahooBooleanFlag;
}

/**
 * Player identity payload shared by roster and player endpoints.
 */
export interface YahooPlayer {
  player_key: string;
  player_id: string;
  name: YahooPlayerName;
  status?: string;
  editorial_player_key?: string;
  editorial_team_key?: string;
  editorial_team_full_name?: string;
  editorial_team_abbr?: string;
  display_position?: string;
  bye_weeks?: YahooByeWeeks;
  uniform_number?: string;
  headshot?: YahooPlayerHeadshot;
  image_url?: string;
  is_undroppable?: YahooBooleanFlag;
  position_type?: YahooHockeyPositionType;
  eligible_positions?: YahooEligiblePositions;
  player_points?: YahooPlayerPoints;
  player_stats?: YahooPlayerStats;
  ownership?: YahooPlayerOwnership;
}

/**
 * Wrapper for player collections (e.g., `/players` endpoints).
 */
export interface YahooPlayersCollection {
  player?: YahooPlayer | YahooPlayer[];
  count?: YahooNumericValue;
}

/**
 * Structured player name segments as returned by Yahoo.
 */
export interface YahooPlayerName {
  full: string;
  first?: string;
  last?: string;
  ascii_first?: string;
  ascii_last?: string;
}

/**
 * Player headshot metadata.
 */
export interface YahooPlayerHeadshot {
  url: string;
  size?: YahooNumericValue;
}

/**
 * Bye week listings (primarily for football but returned across sports).
 */
export interface YahooByeWeeks {
  week?: YahooNumericValue | YahooNumericValue[];
}

/**
 * Eligible roster positions for a player.
 */
export interface YahooEligiblePositions {
  position?: YahooHockeyRosterPosition | YahooHockeyRosterPosition[];
}

/**
 * Selected lineup position for a rostered player on a given date/week.
 */
export interface YahooSelectedPosition {
  coverage_type: YahooCoverageType;
  date?: string;
  week?: string;
  position: YahooHockeyRosterPosition;
}

/**
 * Starting status indicator for roster entries (useful for daily moves leagues).
 */
export interface YahooStartingStatus {
  coverage_type: YahooCoverageType;
  date?: string;
  is_starting: YahooBooleanFlag;
}

/**
 * Fantasy points accrued by a player for a coverage window.
 */
export interface YahooPlayerPoints {
  coverage_type: YahooCoverageType;
  season?: string;
  week?: string;
  date?: string;
  total: YahooNumericValue;
}

/**
 * Player stats payload (actual or projected) returned by player endpoints.
 */
export interface YahooPlayerStats {
  coverage_type: YahooCoverageType;
  season?: string;
  week?: string;
  date?: string;
  stats?: { stat: YahooPlayerStat | YahooPlayerStat[] };
}

/**
 * Individual stat line entry for players or teams.
 */
export interface YahooPlayerStat {
  stat_id: number;
  value: YahooNumericValue;
  display_value?: string;
  bonus?: YahooNumericValue;
}

/**
 * Ownership status information returned for players in league context.
 */
export interface YahooPlayerOwnership {
  ownership_type?: "team" | "waivers" | "freeagents";
  owner_team_key?: string;
  owner_team_name?: string;
  waiver_order?: YahooNumericValue;
  waiver_time?: string;
  is_keeper?: YahooBooleanFlag;
}

// ============================================================================
// Transactions
// ============================================================================

/**
 * Transaction metadata returned by `/transaction/{transaction_key}`.
 */
export interface YahooTransaction {
  transaction_key: string;
  transaction_id?: string;
  type: YahooTransactionType;
  status?: YahooTransactionStatus;
  timestamp?: string;
  waiver_player_key?: string;
  waiver_team_key?: string;
  waiver_priority?: YahooNumericValue;
  waiver_date?: string;
  traders?: YahooTransactionTraders;
  players?: YahooTransactionPlayersCollection;
  faab_bid?: YahooNumericValue;
}

/**
 * Collection wrapper for transaction resources.
 */
export interface YahooTransactionsCollection {
  transaction?: YahooTransaction | YahooTransaction[];
  count?: YahooNumericValue;
}

/**
 * Trader/Tradee information for pending trades.
 */
export interface YahooTransactionTraders {
  trader_team_key?: string;
  tradee_team_key?: string;
  trade_note?: string;
}

/**
 * Wrapper for transaction player entries.
 */
export interface YahooTransactionPlayersCollection {
  player?: YahooTransactionPlayer | YahooTransactionPlayer[];
  count?: YahooNumericValue;
}

/**
 * Player component of a transaction (add, drop, trade, waiver).
 */
export interface YahooTransactionPlayer {
  player_key: string;
  player_id?: string;
  name?: YahooPlayerName;
  transaction_data?: YahooTransactionPlayerData;
}

/**
 * Transaction data specifying add/drop destination and source.
 */
export interface YahooTransactionPlayerData {
  type: YahooTransactionType;
  source_type?: string;
  destination_type?: string;
  source_team_key?: string;
  destination_team_key?: string;
}

// ============================================================================
// Users
// ============================================================================

/**
 * Yahoo user metadata (only available for the authenticated user via `use_login`).
 */
export interface YahooUser {
  guid: string;
  game_count?: YahooNumericValue;
  games?: YahooUserGamesCollection;
}

/**
 * Collection wrapper for user entries.
 */
export interface YahooUsersCollection {
  user?: YahooUser | YahooUser[];
  count?: YahooNumericValue;
}

/**
 * Games the authenticated user is participating in.
 */
export interface YahooUserGame {
  game_key: string;
  game_id: string;
  name: string;
  code: string;
  type: string;
  url: string;
  season: string;
  leagues?: YahooUserLeaguesCollection;
  teams?: YahooTeamsCollection;
}

/**
 * Wrapper for user game entries.
 */
export interface YahooUserGamesCollection {
  game?: YahooUserGame | YahooUserGame[];
  count?: YahooNumericValue;
}

/**
 * League entries within a user game payload.
 */
export interface YahooUserLeague {
  league_key: string;
  league_id: string;
  name: string;
  url?: string;
  draft_status?: YahooDraftStatus;
  num_teams?: YahooNumericValue;
  scoreboards?: YahooLeagueScoreboard;
  teams?: YahooTeamsCollection;
}

/**
 * Wrapper for user league collections.
 */
export interface YahooUserLeaguesCollection {
  league?: YahooUserLeague | YahooUserLeague[];
  count?: YahooNumericValue;
}

// ============================================================================
// Convenience response aliases
// ============================================================================

/**
 * Type helper for responses that wrap a single game resource.
 */
export type YahooGameResponse = YahooFantasyResponse<{ game: YahooGame }>;

/**
 * Type helper for responses returning game collections.
 */
export type YahooGamesResponse = YahooFantasyResponse<{
  games: YahooGamesCollection;
}>;

/**
 * Type helper for single league responses.
 */
export type YahooLeagueResponse = YahooFantasyResponse<{ league: YahooLeague }>;

/**
 * Type helper for league collection endpoints.
 */
export type YahooLeaguesResponse = YahooFantasyResponse<{
  leagues: { league: YahooLeague | YahooLeague[]; count?: YahooNumericValue };
}>;

/**
 * Type helper for team collection responses.
 */
export type YahooTeamsResponse = YahooFantasyResponse<{
  teams: YahooTeamsCollection;
}>;

/**
 * Type helper for single team payloads.
 */
export type YahooTeamResponse = YahooFantasyResponse<{ team: YahooTeam }>;

/**
 * Type helper for scoreboard responses.
 */
export type YahooScoreboardResponse = YahooFantasyResponse<{
  league: YahooLeague & { scoreboard: YahooLeagueScoreboard };
}>;

/**
 * Type helper for transactions responses.
 */
export type YahooTransactionsResponse = YahooFantasyResponse<{
  league: YahooLeague & { transactions: YahooTransactionsCollection };
}>;

/**
 * Type helper for player collection responses.
 */
export type YahooPlayersResponse = YahooFantasyResponse<{
  players: YahooPlayersCollection;
}>;

/**
 * Type helper for roster responses.
 */
export type YahooRosterResponse = YahooFantasyResponse<{
  team: YahooTeam & { roster: YahooRoster };
}>;

/**
 * Type helper for user collection responses.
 */
export type YahooUsersResponse = YahooFantasyResponse<{
  users: YahooUsersCollection;
}>;
