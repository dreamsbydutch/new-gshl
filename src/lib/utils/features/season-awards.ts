import {
  AWARD_CATALOG_BY_KEY,
  AWARD_GROUP_ORDER,
  PLAYER_TROPHY_ICON_URLS,
  getAwardLabel,
  getTeamAwardNomineeTeams,
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
  Season,
  SeasonAwardWinnerCard,
  SeasonType as SeasonTypeValue,
  TeamAward,
} from "@gshl-types";
import { normalizeDateOnlyValue, toLocalIsoDateOnly } from "../core/date";
import { normalizeIdList } from "../core/ids";
import { formatPlayerPositionList } from "../domain/player";

export const ALL_STAR_AWARD_ORDER = [
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
] as const;

const ALL_STAR_AWARD_KEYS = new Set<AwardsListType>(ALL_STAR_AWARD_ORDER);
const EXCLUDED_AWARD_KEYS = new Set<AwardsListType>([AwardsList.PLAYOFF_AS]);

const ALL_STAR_POSITION_ORDER: Record<string, number> = {
  C: 0,
  LW: 1,
  RW: 2,
  D: 3,
  G: 4,
};

function getAllStarPositionRank(positions: readonly string[] | undefined) {
  return (
    positions?.reduce(
      (rank, candidate) =>
        Math.min(
          rank,
          ALL_STAR_POSITION_ORDER[candidate] ?? Number.MAX_SAFE_INTEGER,
        ),
      Number.MAX_SAFE_INTEGER,
    ) ?? Number.MAX_SAFE_INTEGER
  );
}

const PLAYER_AWARD_ORDER: AwardsListType[] = [
  AwardsList.CROSBY,
  AwardsList.OVECHKIN,
  AwardsList.GRETZKY,
  AwardsList.LIDSTROM,
  AwardsList.BRODEUR,
  AwardsList.CONN_SMYTHE,
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
 * Returns whether an awards page should show the live contender view.
 */
export function isSeasonAwardsInProgress(
  season: Pick<Season, "endDate"> | null,
  referenceDate: Date = new Date(),
): boolean {
  const endDate = normalizeDateOnlyValue(season?.endDate);
  return Boolean(endDate && endDate >= toLocalIsoDateOnly(referenceDate));
}

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
      const nomineeNames = getTeamAwardNomineeTeams(award, teams)
        .map((team) => team.name?.trim() ?? getOwnerDisplayName(team) ?? "")
        .filter(Boolean);

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
        nomineeNames,
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
    players.map((player) => [String(player.id), player]),
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
        const player = playerById.get(playerId);
        const gshlTeamIds = normalizeIdList(playerTotal?.gshlTeamIds);
        const gshlTeams = gshlTeamIds
          .map((teamId) => teamById.get(teamId))
          .filter((team): team is GSHLTeam => Boolean(team));
        const primaryTeam = gshlTeams[0] ?? null;
        const joinedTeamNames = gshlTeams
          .map((team) => team.name)
          .filter((teamName): teamName is string => Boolean(teamName))
          .join(", ");

        const winner = {
          playerId,
          playerName: player?.fullName ?? `Player ${playerId}`,
          positions: formatPlayerPositionList(
            playerTotal?.nhlPos ?? player?.nhlPos,
          ),
          teamName: joinedTeamNames || null,
          teamLogoUrl: primaryTeam?.logoUrl ?? null,
        } satisfies AllStarWinner;

        return {
          positionRank: getAllStarPositionRank(
            playerTotal?.nhlPos ?? player?.nhlPos,
          ),
          winner,
        };
      })
      .sort(
        (left, right) =>
          left.positionRank - right.positionRank ||
          left.winner.playerName.localeCompare(right.winner.playerName),
      )
      .map(({ winner }) => winner);

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
          (award): award is AwardsListType =>
            !ALL_STAR_AWARD_KEYS.has(award) && !EXCLUDED_AWARD_KEYS.has(award),
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
        const nomineeNames = normalizeIdList(award.nomineeIds).map(
          (nomineeId) =>
            playersById.get(nomineeId)?.fullName ?? `Player ${nomineeId}`,
        );

        return {
          playerId,
          playerName: player?.fullName ?? `Player ${playerId}`,
          positions: formatPlayerPositionList(total?.nhlPos ?? player?.nhlPos),
          teamName: team?.name ?? null,
          teamLogoUrl: team?.logoUrl ?? null,
          nomineeNames,
        };
      })
      .sort((left, right) => left.playerName.localeCompare(right.playerName));
    const iconAward = PLAYER_TROPHY_ICON_AWARDS.get(awardKey) ?? awardKey;

    return {
      awardKey,
      title: getAwardLabel(awardKey),
      iconUrl:
        PLAYER_TROPHY_ICON_URLS.get(awardKey) ??
        AWARD_CATALOG_BY_KEY.get(iconAward)?.imageUrl ??
        null,
      winners,
    };
  });
}
