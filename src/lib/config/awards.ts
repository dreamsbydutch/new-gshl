import type {
  AwardCatalogEntry,
  AwardGroupKey,
  AwardsList as AwardsListType,
  GSHLTeam,
  PlayerAward,
  TeamAward,
} from "@gshl-types";
import { AwardsList } from "@gshl-utils/domain/constants";

export const AWARD_GROUP_ORDER: AwardGroupKey[] = [
  "TEAM TROPHIES",
  "TIER 1 AWARDS",
  "TIER 2 AWARDS",
];

export const AWARD_CATALOG: AwardCatalogEntry[] = [
  {
    key: AwardsList.GSHL_CUP,
    group: "TEAM TROPHIES",
    fullName: "GSHL Cup",
    imageUrl:
      "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMqmHsLqnu8zTgQJHtWPjswfb4x51ZVaUmCycA",
    summaryLabel: "GSHL Cup",
    sortOrder: 1,
  },
  {
    key: AwardsList.PRESIDENT,
    group: "TEAM TROPHIES",
    fullName: "President's Trophy",
    imageUrl:
      "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMWCj22tAz9iuA7F6XIgrwRMlZ2cKBCvPfOpJx",
    summaryLabel: "President's Trophy",
    sortOrder: 2,
  },
  {
    key: AwardsList.HICKORY,
    group: "TEAM TROPHIES",
    fullName: "Hickory Trophy",
    imageUrl:
      "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMfJPQWwEnyhHQ48UTs16OM7km2lFdqZNwJbAp",
    summaryLabel: "Hickory Hotel Regular Season Champ",
    sortOrder: 3,
  },
  {
    key: AwardsList.SUNVIEW,
    group: "TEAM TROPHIES",
    fullName: "Sunview Trophy",
    imageUrl:
      "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMWBCl8LAz9iuA7F6XIgrwRMlZ2cKBCvPfOpJx",
    summaryLabel: "Sunview Regular Season Champ",
    sortOrder: 4,
  },
  {
    key: AwardsList.BROPHY,
    group: "TEAM TROPHIES",
    fullName: "Brophy Trophy",
    imageUrl:
      "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMg9Df4Vcpj089yn4QkDZ1XfqBUOEVMYizxdGF",
    summaryLabel: "Brophy Trophy",
    sortOrder: 5,
  },
  {
    key: AwardsList.HART,
    group: "TIER 1 AWARDS",
    fullName: "Hart Trophy",
    imageUrl: "/awards/hart.png",
    summaryLabel: "Hart",
    sortOrder: 1,
  },
  {
    key: AwardsList.NORRIS,
    group: "TIER 1 AWARDS",
    fullName: "Norris Trophy",
    imageUrl: "/awards/norris.png",
    summaryLabel: "Norris",
    sortOrder: 2,
  },
  {
    key: AwardsList.VEZINA,
    group: "TIER 1 AWARDS",
    fullName: "Vezina Trophy",
    imageUrl: "/awards/vezina.png",
    summaryLabel: "Vezina",
    sortOrder: 3,
  },
  {
    key: AwardsList.CALDER,
    group: "TIER 1 AWARDS",
    fullName: "Calder Trophy",
    imageUrl:
      "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiM1SEaTMbkQ75UzTFynNthwaG9omDCgPVIcMSJ",
    summaryLabel: "Calder",
    sortOrder: 4,
  },
  {
    key: AwardsList.GM_OF_THE_YEAR,
    group: "TIER 1 AWARDS",
    fullName: "General Manager of the Year",
    imageUrl:
      "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMKGU1z3ynvo3h1cd80KYVjsC6fXrutBw95TND",
    summaryLabel: "GM of the Year",
    sortOrder: 5,
  },
  {
    key: AwardsList.JACK_ADAMS,
    group: "TIER 1 AWARDS",
    fullName: "Jack Adams Award",
    imageUrl:
      "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMdF1znCGjvrNGugImeAEicjQUD0qyz2nb1B5Z",
    summaryLabel: "Jack Adams",
    sortOrder: 6,
  },
  {
    key: AwardsList.ROCKET,
    group: "TIER 2 AWARDS",
    fullName: "Rocket Richard Trophy",
    imageUrl: "/awards/rocket.png",
    summaryLabel: "Rocket Richard",
    sortOrder: 1,
  },
  {
    key: AwardsList.ART_ROSS,
    group: "TIER 2 AWARDS",
    fullName: "Art Ross Trophy",
    imageUrl: "/awards/ross.png",
    summaryLabel: "Art Ross",
    sortOrder: 2,
  },
  {
    key: AwardsList.SELKE,
    group: "TIER 2 AWARDS",
    fullName: "Selke Trophy",
    imageUrl:
      "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMXwOIFg9eUFO1XWmtTViK8j9IM3506pqAgZNJ",
    summaryLabel: "Selke",
    sortOrder: 3,
  },
  {
    key: AwardsList.LADY_BYNG,
    group: "TIER 2 AWARDS",
    fullName: "Lady Byng Trophy",
    imageUrl:
      "https://qzcw4d2n1l.ufs.sh/f/wTZjIHOpQwiMOAIBvFfEVpikMSWFd7T5JXG9tmvgbL4nl0xs",
    summaryLabel: "Lady Byng",
    sortOrder: 4,
  },
];

export const AWARD_CATALOG_BY_KEY = new Map(
  AWARD_CATALOG.map((entry) => [entry.key, entry]),
);

export const ALL_STAR_AWARD_LABELS = new Map<AwardsListType, string>([
  [AwardsList.FIRST_AS, "First Team All-Star"],
  [AwardsList.SECOND_AS, "Second Team All-Star"],
  [AwardsList.PLAYOFF_AS, "Playoff All-Star"],
]);

export const ALL_STAR_MEDAL_EMOJIS = new Map<AwardsListType, string>([
  [AwardsList.FIRST_AS, "🥇"],
  [AwardsList.SECOND_AS, "🥈"],
]);

export const PLAYER_TROPHY_LABELS = new Map<AwardsListType, string>([
  [AwardsList.CROSBY, "Player MVP"],
  [AwardsList.LIDSTROM, "Best Dman"],
  [AwardsList.BRODEUR, "Best G"],
  [AwardsList.GRETZKY, "Most Pts"],
  [AwardsList.OVECHKIN, "Most G"],
  [AwardsList.CONN_SMYTHE, "Playoff MVP"],
]);

export const PLAYER_TROPHY_ICON_AWARDS = new Map<
  AwardsListType,
  AwardsListType
>([
  [AwardsList.CROSBY, AwardsList.HART],
  [AwardsList.LIDSTROM, AwardsList.NORRIS],
  [AwardsList.BRODEUR, AwardsList.VEZINA],
  [AwardsList.GRETZKY, AwardsList.ART_ROSS],
  [AwardsList.OVECHKIN, AwardsList.ROCKET],
]);

export const PLAYER_TROPHY_ICON_URLS = new Map<AwardsListType, string>([
  [AwardsList.CONN_SMYTHE, "/awards/smythe.png"],
]);

export function getAwardLabel(award: string): string {
  return (
    AWARD_CATALOG_BY_KEY.get(award as AwardsListType)?.fullName ??
    PLAYER_TROPHY_LABELS.get(award as AwardsListType) ??
    ALL_STAR_AWARD_LABELS.get(award as AwardsListType) ??
    String(award)
  );
}

export function getTeamAwardOwnerId(award: TeamAward): string {
  return String(award.ownerId ?? "");
}

export function getTeamAwardTeam(
  award: TeamAward,
  teams: readonly GSHLTeam[],
): GSHLTeam | undefined {
  const ownerId = getTeamAwardOwnerId(award);
  const ownerTeam = ownerId
    ? teams.find(
        (team) =>
          String(team.seasonId) === String(award.seasonId) &&
          String(team.ownerId ?? "") === ownerId,
      )
    : undefined;
  if (ownerTeam) return ownerTeam;
  return award.teamId
    ? teams.find((team) => String(team.id) === String(award.teamId))
    : undefined;
}

export function getTeamAwardNomineeTeams(
  award: TeamAward,
  teams: readonly GSHLTeam[],
): GSHLTeam[] {
  const nomineeOwnerIds = new Set(award.nomineeIds.map(String));
  return teams.filter(
    (team) =>
      String(team.seasonId) === String(award.seasonId) &&
      nomineeOwnerIds.has(String(team.ownerId ?? "")),
  );
}

export function getAwardTeamId(
  award: PlayerAward | TeamAward,
  teams: readonly GSHLTeam[] = [],
): string {
  if (!("ownerId" in award)) return "";
  return String(getTeamAwardTeam(award, teams)?.id ?? "");
}

export function getPlayerAwardPlayerId(award: PlayerAward): string {
  return String(award.playerId);
}
