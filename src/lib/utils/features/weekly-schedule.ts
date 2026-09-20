import type {
  Player,
  PlayerWeekStatLine,
  TeamWeekStatLine,
  Week,
} from "@gshl-types";
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
  return playerWeekStats.reduce<
    Record<string, (PlayerWeekStatLine & Player)[]>
  >((acc, stat) => {
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
  }, {});
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
