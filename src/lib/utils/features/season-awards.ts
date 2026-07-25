import {
  AWARD_CATALOG_BY_KEY,
  AWARD_GROUP_ORDER,
  getAwardLabel,
  getTeamAwardTeam,
  PLAYER_TROPHY_ICON_AWARDS,
} from "@gshl-lib/config/awards";
import { AwardsList, SeasonType } from "../domain/constants";
import type {
  AllStarAwardKey,
  AllStarTeamCard,
  AllStarWinner,
  PlayerAwardSection,
  PlayerAwardWinner,
  AwardsList as AwardsListType,
  GSHLTeam,
  Player,
  PlayerAward,
  PlayerTotalStatLine,
  SeasonAwardWinnerCard,
  SeasonType as SeasonTypeValue,
  TeamAward,
} from "@gshl-types";
import { normalizeIdList } from "../core/ids";
import { formatPlayerPositionList } from "../domain/player";

export const ALL_STAR_AWARD_ORDER = [
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
  AwardsList.PLAYOFF_AS,
] as const;

const ALL_STAR_AWARD_KEYS = new Set<AwardsListType>(ALL_STAR_AWARD_ORDER);

const PLAYER_AWARD_ORDER: AwardsListType[] = [
  AwardsList.CROSBY,
  AwardsList.OVECHKIN,
  AwardsList.GRETZKY,
  AwardsList.LIDSTROM,
  AwardsList.BRODEUR,
  AwardsList.HART,
  AwardsList.NORRIS,
  AwardsList.VEZINA,
  AwardsList.ROCKET,
  AwardsList.ART_ROSS,
  AwardsList.CALDER,
  AwardsList.SELKE,
  AwardsList.LADY_BYNG,
];

/**
 * Returns all star season type.
 *
 * @param awardKey - The award key to use.
 * @returns The requested all star season type.
 */
export function getAllStarSeasonType(
  awardKey: AwardsListType,
): SeasonTypeValue | undefined {
  switch (awardKey) {
    case AwardsList.FIRST_AS:
    case AwardsList.SECOND_AS:
      return SeasonType.REGULAR_SEASON;
    case AwardsList.PLAYOFF_AS:
      return SeasonType.PLAYOFFS;
  }
}

/**
 * Returns owner display name.
 *
 * @param team - The team to use.
 * @returns The requested owner display name.
 */
export function getOwnerDisplayName(team: GSHLTeam | undefined): string | null {
  if (!team) return null;

  const nickname = String(team.ownerNickname ?? "").trim();
  if (nickname) return nickname;

  const fullName = [team.ownerFirstName, team.ownerLastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");

  return fullName || null;
}

/**
 * Returns all star title.
 *
 * @param awardKey - The award key to use.
 * @returns The requested all star title.
 */
export function getAllStarTitle(awardKey: AllStarAwardKey): string {
  switch (awardKey) {
    case AwardsList.FIRST_AS:
      return "First Team All-Stars";
    case AwardsList.SECOND_AS:
      return "Second Team All-Stars";
    case AwardsList.PLAYOFF_AS:
      return "Playoff All-Stars";
  }
}

/**
 * Returns all star card class.
 *
 * @param awardKey - The award key to use.
 * @returns The requested all star card class.
 */
export function getAllStarCardClass(awardKey: AllStarAwardKey): string {
  switch (awardKey) {
    case AwardsList.FIRST_AS:
      return "border-amber-200 bg-gradient-to-b from-amber-50 to-white";
    case AwardsList.SECOND_AS:
      return "border-slate-200 bg-gradient-to-b from-slate-100 to-white";
    case AwardsList.PLAYOFF_AS:
      return "border-orange-200 bg-gradient-to-b from-orange-50 to-white";
  }
}

/**
 * Builds season award cards.
 *
 * @param awards - The awards to use.
 * @param teams - The teams to use.
 * @returns The assembled season award cards.
 */
export function buildSeasonAwardCards(
  awards: TeamAward[],
  teams: GSHLTeam[],
): SeasonAwardWinnerCard[] {
  return awards
    .map((award) => {
      const catalog = AWARD_CATALOG_BY_KEY.get(award.award);
      if (!catalog) return null;

      const winningTeam = getTeamAwardTeam(award, teams);
      const ownerDisplayName = getOwnerDisplayName(winningTeam);

      return {
        id: String(award.id),
        award,
        catalog,
        winnerName:
          winningTeam?.name?.trim() ?? ownerDisplayName ?? "Winner not found",
        winnerDetail:
          winningTeam?.name?.trim() && ownerDisplayName
            ? ownerDisplayName
            : (winningTeam?.confName?.trim() ?? null),
        logoUrl: winningTeam?.logoUrl ?? null,
      } satisfies SeasonAwardWinnerCard;
    })
    .filter((card): card is SeasonAwardWinnerCard => card !== null)
    .sort((left, right) => {
      const groupDelta =
        AWARD_GROUP_ORDER.indexOf(left.catalog.group) -
        AWARD_GROUP_ORDER.indexOf(right.catalog.group);
      if (groupDelta !== 0) return groupDelta;
      return left.catalog.sortOrder - right.catalog.sortOrder;
    });
}

/**
 * Builds all star team cards.
 *
 * @param awards - The awards to use.
 * @param players - The players to use.
 * @param playerTotals - The player totals to use.
 * @param teams - The teams to use.
 * @returns The assembled all star team cards.
 */
export function buildAllStarTeamCards(
  awards: PlayerAward[],
  players: Player[],
  playerTotals: PlayerTotalStatLine[],
  teams: GSHLTeam[],
): AllStarTeamCard[] {
  const playerById = new Map(
    players.map((player) => [String(player.id), player.fullName]),
  );
  const teamById = new Map(teams.map((team) => [String(team.id), team]));

  return ALL_STAR_AWARD_ORDER.map((awardKey) => {
    const winners = awards
      .filter((award) => award.award === awardKey)
      .map((award) => {
        const playerId = String(award.playerId);
        const playerTotal = playerTotals.find((row) => {
          return String(row.playerId) === playerId;
        });
        const gshlTeamIds = normalizeIdList(playerTotal?.gshlTeamIds);
        const gshlTeams = gshlTeamIds
          .map((teamId) => teamById.get(teamId))
          .filter((team): team is GSHLTeam => Boolean(team));
        const primaryTeam = gshlTeams[0] ?? null;
        const joinedTeamNames = gshlTeams
          .map((team) => team.name)
          .filter((teamName): teamName is string => Boolean(teamName))
          .join(", ");

        return {
          playerId,
          playerName: playerById.get(playerId) ?? `Player ${playerId}`,
          positions: formatPlayerPositionList(playerTotal?.nhlPos),
          teamName: joinedTeamNames || null,
          teamLogoUrl: primaryTeam?.logoUrl ?? null,
        } satisfies AllStarWinner;
      })
      .sort((left, right) => left.playerName.localeCompare(right.playerName));

    return {
      awardKey,
      title: getAllStarTitle(awardKey),
      winners,
    };
  });
}

/**
 * Builds grouped player-award winners for the season awards page.
 */
export function buildPlayerAwardSections(
  awards: PlayerAward[],
  players: Player[],
  playerTotals: PlayerTotalStatLine[],
  teams: GSHLTeam[],
): PlayerAwardSection[] {
  const playersById = new Map(
    players.map((player) => [String(player.id), player]),
  );
  const totalsByPlayerId = new Map(
    playerTotals.map((total) => [String(total.playerId), total]),
  );
  const teamsById = new Map(teams.map((team) => [String(team.id), team]));
  const awardKeys = [
    ...new Set(
      awards
        .map((award) => award.award)
        .filter(
          (award): award is AwardsListType => !ALL_STAR_AWARD_KEYS.has(award),
        ),
    ),
  ].sort((left, right) => {
    const leftIndex = PLAYER_AWARD_ORDER.indexOf(left);
    const rightIndex = PLAYER_AWARD_ORDER.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (
        (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
      );
    }
    return getAwardLabel(left).localeCompare(getAwardLabel(right));
  });

  return awardKeys.map((awardKey): PlayerAwardSection => {
    const winners = awards
      .filter((award) => award.award === awardKey)
      .map((award): PlayerAwardWinner => {
        const playerId = String(award.playerId);
        const player = playersById.get(playerId);
        const total = totalsByPlayerId.get(playerId);
        const team = (total?.gshlTeamIds ?? [])
          .map((teamId) => teamsById.get(String(teamId)))
          .find((candidate): candidate is GSHLTeam => Boolean(candidate));

        return {
          playerId,
          playerName: player?.fullName ?? `Player ${playerId}`,
          positions: formatPlayerPositionList(total?.nhlPos ?? player?.nhlPos),
          teamName: team?.name ?? null,
          teamLogoUrl: team?.logoUrl ?? null,
        };
      })
      .sort((left, right) => left.playerName.localeCompare(right.playerName));
    const iconAward = PLAYER_TROPHY_ICON_AWARDS.get(awardKey) ?? awardKey;

    return {
      awardKey,
      title: getAwardLabel(awardKey),
      iconUrl: AWARD_CATALOG_BY_KEY.get(iconAward)?.imageUrl ?? null,
      winners,
    };
  });
}
