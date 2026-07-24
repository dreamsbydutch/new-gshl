import type {
  GSHLTeam,
  Matchup,
  Player,
  PlayerWeekStatLine,
  TeamWeekStatLine,
  Week,
} from "@gshl-types";
import {
  filterMatchups,
  getMatchupOutcomeClass,
  isScheduleItemComplete,
  RANKING_DISPLAY_THRESHOLD,
  shouldDisplayRank,
  sortMatchups,
} from "../domain/schedule";
import { keyBy } from "../core";
import type {
  WeekScheduleItemProps,
  TeamDisplayProps,
  ScoreDisplayProps,
  WeeklyGameType,
  ConferenceAbbr,
  GameTypeConfig,
} from "@gshl-types";
import { ResignableStatus as ResignableStatusEnum } from "../domain/constants";

export type {
  WeekScheduleItemProps,
  TeamDisplayProps,
  ScoreDisplayProps,
  WeeklyGameType as GameType,
  ConferenceAbbr,
  GameTypeConfig,
};

const BACKGROUND_CLASSES = {
  // Sunview intra-conference games
  RSSVSV: "bg-sunview-50/50",
  CCSVSV: "bg-sunview-50/50",

  // Hickory Hotel intra-conference games
  RSHHHH: "bg-hotel-50/50",
  CCHHHH: "bg-hotel-50/50",

  // Inter-conference games
  RSSVHH: "bg-gradient-to-r from-sunview-50/50 to-hotel-50/50",
  NCSVHH: "bg-gradient-to-r from-sunview-50/50 to-hotel-50/50",
  RSHHSV: "bg-gradient-to-r from-hotel-50/50 to-sunview-50/50",
  NCHHSV: "bg-gradient-to-r from-hotel-50/50 to-sunview-50/50",

  // Playoff games - Quarter Finals
  QFSVSV: "bg-orange-200/30",
  QFHHHH: "bg-orange-200/30",
  QFHHSV: "bg-orange-200/30",
  QFSVHH: "bg-orange-200/30",

  // Playoff games - Semi Finals
  SFSVSV: "bg-slate-200/30",
  SFHHHH: "bg-slate-200/30",
  SFHHSV: "bg-slate-200/30",
  SFSVHH: "bg-slate-200/30",

  // Playoff games - Finals
  FSVSV: "bg-yellow-200/30",
  FHHHH: "bg-yellow-200/30",
  FHHSV: "bg-yellow-200/30",
  FSVHH: "bg-yellow-200/30",

  // Losers Tournament
  LTSVSV: "bg-brown-200/40",
  LTHHHH: "bg-brown-200/40",
  LTHHSV: "bg-brown-200/40",
  LTSVHH: "bg-brown-200/40",
} as const;

const DEFAULT_BACKGROUND_CLASS = "bg-gray-100";

/**
 * Filters matchups by week.
 *
 * @param matchups - The matchups to use.
 * @param selectedWeekId - The selected week id to use.
 * @returns The filtered matchups by week.
 */
export const filterMatchupsByWeek = (
  matchups: Matchup[],
  selectedWeekId: string | number | null,
): Matchup[] => {
  return filterMatchups(matchups, { weekId: selectedWeekId });
};

/**
 * Sorts matchups by rating.
 *
 * @param matchups - The matchups to use.
 * @returns The sorted matchups by rating.
 */
export const sortMatchupsByRating = (matchups: Matchup[]): Matchup[] => {
  return sortMatchups(matchups, { by: "rating", direction: "desc" });
};

/**
 * Collects player ids that appear in weekly stats but are not present in the
 * active-player collection.
 */
export const collectInactivePlayerIds = (
  activePlayers: Player[],
  playerWeekStats: PlayerWeekStatLine[],
): string[] => {
  if (!playerWeekStats.length) {
    return [];
  }

  const activePlayerIdSet = new Set(
    activePlayers.map((player) => player.id).filter(Boolean),
  );
  const missingIds = new Set<string>();

  for (const stat of playerWeekStats) {
    const playerId = stat.playerId?.trim();
    if (playerId && !activePlayerIdSet.has(playerId)) {
      missingIds.add(playerId);
    }
  }

  return Array.from(missingIds);
};

/**
 * Builds a player lookup map keyed by player id.
 */
export const buildPlayerLookup = (players: Player[]): Map<string, Player> => {
  return keyBy(players, (player) => player.id);
};

/**
 * Groups weekly player stat rows by GSHL team and merges in player metadata.
 */
export const buildPlayerWeekStatsByTeam = (
  playerWeekStats: PlayerWeekStatLine[],
  playerLookup: Map<string, Player>,
): Record<string, (PlayerWeekStatLine & Player)[]> => {
  return playerWeekStats.reduce<Record<string, (PlayerWeekStatLine & Player)[]>>(
    (acc, stat) => {
      const playerId = stat.playerId?.trim();
      const player = playerId ? playerLookup.get(playerId) : null;
      if (!stat.gshlTeamId) {
        return acc;
      }

      const teamRows = (acc[stat.gshlTeamId] ??= []);
      teamRows.push({
        ...stat,
        ...player,
        gshlTeamId: stat.gshlTeamId,
        firstName: player?.firstName ?? "",
        lastName: player?.lastName ?? "",
        fullName: player?.fullName ?? "",
        isActive: player?.isActive ?? false,
        isSignable: player?.isSignable ?? false,
        isResignable: player?.isResignable ?? ResignableStatusEnum.DRAFT,
      });
      return acc;
    },
    {},
  );
};

/**
 * Groups weekly team stat rows by team id.
 */
export const buildTeamWeekStatsByTeam = (
  teamWeekStats: TeamWeekStatLine[],
): Record<string, TeamWeekStatLine> => {
  return Object.fromEntries(keyBy(teamWeekStats, (stat) => stat.gshlTeamId));
};

/**
 * Returns the next week ids immediately following the selected week.
 */
export const getUpcomingWeekIds = (
  weeks: Week[],
  selectedWeekId: string | null,
  count = 2,
): string[] => {
  const currentIndex = weeks.findIndex((week) => week.id === selectedWeekId);
  if (currentIndex < 0) {
    return [];
  }

  return weeks
    .slice(currentIndex + 1, currentIndex + 1 + count)
    .map((week) => week.id)
    .filter(Boolean);
};

/**
 * Returns game background class.
 *
 * @param gameType - The game type to use.
 * @param awayTeamConf - The away team conf to use.
 * @param homeTeamConf - The home team conf to use.
 * @returns The requested game background class.
 */
export const getGameBackgroundClass = (
  gameType: string,
  awayTeamConf: string,
  homeTeamConf: string,
): string => {
  const key = gameType + awayTeamConf + homeTeamConf;
  return (
    BACKGROUND_CLASSES[key as keyof typeof BACKGROUND_CLASSES] ||
    DEFAULT_BACKGROUND_CLASS
  );
};

/**
 * Determines whether to display ranking.
 *
 * @param rank - The rank to use.
 * @returns True when display ranking; otherwise false.
 */
export const shouldDisplayRanking = (rank?: string | number): boolean => {
  return shouldDisplayRank(rank, {
    threshold: RANKING_DISPLAY_THRESHOLD,
  });
};

/**
 * Checks whether matchup completed.
 *
 * @param matchup - The matchup to use.
 * @returns True when matchup completed; otherwise false.
 */
export const isMatchupCompleted = (matchup: Matchup): boolean => {
  return isScheduleItemComplete({ matchup, mode: "scores" });
};

/**
 * Returns score class.
 *
 * @param isWinner - The is winner to use.
 * @param isLoser - The is loser to use.
 * @returns The requested score class.
 */
export const getScoreClass = (isWinner: boolean, isLoser: boolean): string => {
  return getMatchupOutcomeClass({
    isLoser,
    isWinner,
    lossClass: "text-rose-800",
    winClass: "font-bold text-emerald-700",
  });
};

/**
 * Checks whether valid matchup.
 *
 * @param matchup - The matchup to use.
 * @param homeTeam - The home team to use.
 * @param awayTeam - The away team to use.
 * @returns True when valid matchup; otherwise false.
 */
export const isValidMatchup = (
  matchup: Matchup,
  homeTeam?: GSHLTeam,
  awayTeam?: GSHLTeam,
): boolean => {
  return !!(homeTeam && awayTeam && homeTeam.id !== awayTeam.id);
};
