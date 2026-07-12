import {
  AWARD_CATALOG_BY_KEY,
  AWARD_GROUP_ORDER,
} from "@gshl-lib/config/awards";
import { AwardsList, SeasonType } from "@gshl-types";
import type {
  AllStarAwardKey,
  AllStarCountLine,
  AllStarRowData,
  AwardCatalogEntry,
  AwardGroupKey,
  BuildTrophyCaseDataInput,
  BuildTrophyCaseDataResult,
  TrophyCaseCard,
  TrophyCaseProps,
} from "@gshl-types";
import { normalizeIdList } from "../core/ids";
import {
  findNhlTeamByAbbreviation,
  getPlayerNhlAbbreviation,
} from "../domain/player";
import { ALL_STAR_AWARD_ORDER, getAllStarTitle } from "./season-awards";

const groupOrderMap = new Map(
  AWARD_GROUP_ORDER.map((group, index) => [group, index]),
);
const allStarOrderMap = new Map(
  ALL_STAR_AWARD_ORDER.map((award, index) => [award, index]),
);

export function getSeasonYearMap(cards: TrophyCaseProps["seasons"]) {
  return new Map(cards.map((season) => [String(season.id), season.year]));
}

export function formatYearRange(startYear: number, endYear: number): string {
  if (startYear === endYear) {
    return String(startYear);
  }

  const startCentury = Math.floor(startYear / 100);
  const endCentury = Math.floor(endYear / 100);
  if (startCentury === endCentury) {
    return `${startYear}-${String(endYear).slice(-2)}`;
  }

  return `${startYear}-${endYear}`;
}

export function formatYearRanges(years: Array<number | string>): string {
  const normalizedYears = Array.from(
    new Set(
      years
        .map((year) => Number(year))
        .filter((year) => Number.isFinite(year))
        .sort((left, right) => left - right),
    ),
  );

  if (normalizedYears.length === 0) {
    return years.map(String).join(", ");
  }

  const ranges: string[] = [];
  let rangeStart = normalizedYears[0]!;
  let rangeEnd = normalizedYears[0]!;

  for (let index = 1; index < normalizedYears.length; index += 1) {
    const currentYear = normalizedYears[index]!;

    if (currentYear === rangeEnd + 1) {
      rangeEnd = currentYear;
      continue;
    }

    ranges.push(formatYearRange(rangeStart, rangeEnd));
    rangeStart = currentYear;
    rangeEnd = currentYear;
  }

  ranges.push(formatYearRange(rangeStart, rangeEnd));
  return ranges.join(", ");
}

export function resolveSummaryText(
  count: number,
  latestYear: number | string,
  summaryLabel: string,
  years: Array<number | string>,
) {
  const trimmedLabel = summaryLabel.trim();
  const hasSuffix = /(winner|champ|champion)$/i.test(trimmedLabel);

  if (count > 1) {
    const baseText = hasSuffix
      ? `${count}-time ${trimmedLabel}`
      : `${count}-time ${trimmedLabel} Winner`;
    const formattedYears = formatYearRanges(years);

    return formattedYears ? `${baseText} (${formattedYears})` : baseText;
  }

  return hasSuffix
    ? `${latestYear} ${trimmedLabel}`
    : `${latestYear} ${trimmedLabel} Winner`;
}

export function getAllStarSeasonType(awardKey: AllStarAwardKey): SeasonType {
  switch (awardKey) {
    case AwardsList.FIRST_AS:
    case AwardsList.SECOND_AS:
      return SeasonType.REGULAR_SEASON;
    case AwardsList.PLAYOFF_AS:
      return SeasonType.PLAYOFFS;
  }
}

export function getAllStarRowClass(awardKey: AllStarAwardKey): string {
  switch (awardKey) {
    case AwardsList.FIRST_AS:
      return "bg-amber-50/70 hover:!bg-amber-100/50";
    case AwardsList.SECOND_AS:
      return "bg-slate-100/70 hover:!bg-slate-200/50";
    case AwardsList.PLAYOFF_AS:
      return "bg-orange-50/70 hover:!bg-orange-100/50";
  }
}

export function getSummaryLineClass(group: AwardGroupKey) {
  switch (group) {
    case "TEAM TROPHIES":
      return "text-xl sm:text-2xl";
    case "TIER 1 AWARDS":
      return "text-lg sm:text-xl";
    case "TIER 2 AWARDS":
      return "text-base sm:text-lg";
    default:
      return "text-lg sm:text-xl";
  }
}

export function buildAllStarData(props: TrophyCaseProps): {
  counts: AllStarCountLine[];
  rows: AllStarRowData[];
} {
  const ownerId = String(props.currentTeam.ownerId ?? "");
  const seasonYearMap = getSeasonYearMap(props.seasons);

  const counts = ALL_STAR_AWARD_ORDER.map((awardKey) => ({
    awardKey,
    label: getAllStarTitle(awardKey),
    count: 0,
  }));

  if (!ownerId) {
    return { counts, rows: [] };
  }

  const countByAwardKey = new Map<AllStarAwardKey, number>(
    counts.map((item) => [item.awardKey, item.count]),
  );
  const ownerTeamIdBySeason = new Map(
    props.allTeams
      .filter((team) => String(team.ownerId ?? "") === ownerId)
      .map((team) => [String(team.seasonId), String(team.id)]),
  );
  const playerNameById = new Map(
    props.players.map((player) => [String(player.id), player.fullName]),
  );
  const rows: AllStarRowData[] = [];

  for (const award of props.allAwards) {
    const awardKey = String(award.award) as AllStarAwardKey;
    const seasonType = getAllStarSeasonType(awardKey);
    if (!seasonType) continue;

    const seasonId = String(award.seasonId);
    const ownerTeamId = ownerTeamIdBySeason.get(seasonId);
    if (!ownerTeamId) continue;

    const playerTotal = props.playerTotals.find((row) => {
      return (
        String(row.playerId) === String(award.winnerId) &&
        String(row.seasonId) === seasonId &&
        String(row.seasonType) === String(seasonType) &&
        normalizeIdList(row.gshlTeamIds).includes(ownerTeamId)
      );
    });

    if (!playerTotal) continue;

    const playerId = String(award.winnerId);
    rows.push({
      awardKey,
      seasonId,
      seasonYear: seasonYearMap.get(seasonId) ?? award.seasonId,
      playerId,
      playerName: playerNameById.get(playerId) ?? `Player ${playerId}`,
      playerTotal,
      nhlTeam: findNhlTeamByAbbreviation(
        props.nhlTeams,
        getPlayerNhlAbbreviation(playerTotal.nhlTeam) ?? "",
      ),
    });
    countByAwardKey.set(awardKey, (countByAwardKey.get(awardKey) ?? 0) + 1);
  }

  return {
    counts: counts.map((item) => ({
      ...item,
      count: countByAwardKey.get(item.awardKey) ?? 0,
    })),
    rows: rows.sort((left, right) => {
      const awardDelta =
        (allStarOrderMap.get(left.awardKey) ?? 0) -
        (allStarOrderMap.get(right.awardKey) ?? 0);
      if (awardDelta !== 0) return awardDelta;

      const yearDelta = Number(right.seasonYear) - Number(left.seasonYear);
      if (yearDelta !== 0) return yearDelta;

      return left.playerName.localeCompare(right.playerName);
    }),
  };
}

export function buildTrophyCaseData({
  awards,
  allAwards,
  allTeams,
  currentTeam,
  nhlTeams,
  playerTotals,
  players,
  seasons,
}: BuildTrophyCaseDataInput): BuildTrophyCaseDataResult {
  const seasonYearMap = getSeasonYearMap(seasons);

  const cards = awards
    .map((award) => {
      const awardKey = String(award.award);
      const catalog = AWARD_CATALOG_BY_KEY.get(
        awardKey as AwardCatalogEntry["key"],
      );
      if (!catalog) {
        return null;
      }

      const historicalTeam =
        allTeams.find(
          (team) =>
            String(team.seasonId) === String(award.seasonId) &&
            String(team.ownerId ?? "") === String(award.winnerId),
        ) ?? null;

      return {
        id: String(award.id),
        award,
        catalog,
        seasonYear: seasonYearMap.get(String(award.seasonId)) ?? award.seasonId,
        franchiseLogoUrl:
          historicalTeam?.logoUrl ?? currentTeam.logoUrl ?? null,
      } satisfies TrophyCaseCard;
    })
    .filter((card): card is TrophyCaseCard => card !== null)
    .sort((left, right) => {
      const groupDelta =
        (groupOrderMap.get(left.catalog.group) ?? 0) -
        (groupOrderMap.get(right.catalog.group) ?? 0);
      if (groupDelta !== 0) return groupDelta;

      const awardDelta = left.catalog.sortOrder - right.catalog.sortOrder;
      if (awardDelta !== 0) return awardDelta;

      return Number(right.seasonYear) - Number(left.seasonYear);
    });

  const summaryLines = Array.from(
    cards.reduce(
      (map, card) => {
        const existing = map.get(card.catalog.key);
        const numericYear = Number(card.seasonYear);

        if (!existing) {
          map.set(card.catalog.key, {
            awardKey: card.catalog.key,
            group: card.catalog.group,
            sortOrder: card.catalog.sortOrder,
            count: 1,
            latestYear: Number.isFinite(numericYear)
              ? numericYear
              : card.seasonYear,
            years: [Number.isFinite(numericYear) ? numericYear : card.seasonYear],
            summaryLabel: card.catalog.summaryLabel,
          });
          return map;
        }

        existing.count += 1;
        existing.years.push(
          Number.isFinite(numericYear) ? numericYear : card.seasonYear,
        );
        if (
          typeof existing.latestYear === "number" &&
          Number.isFinite(numericYear) &&
          numericYear > existing.latestYear
        ) {
          existing.latestYear = numericYear;
        }

        return map;
      },
      new Map<
        string,
        {
          awardKey: AwardCatalogEntry["key"];
          group: AwardGroupKey;
          sortOrder: number;
          count: number;
          latestYear: number | string;
          years: Array<number | string>;
          summaryLabel: string;
        }
      >(),
    ),
  )
    .map(([, item]) => ({
      awardKey: item.awardKey,
      group: item.group,
      sortOrder: item.sortOrder,
      text: resolveSummaryText(
        item.count,
        item.latestYear,
        item.summaryLabel,
        item.years
          .slice()
          .sort((left, right) => Number(left) - Number(right)),
      ),
    }))
    .sort((left, right) => {
      const groupDelta =
        (groupOrderMap.get(left.group) ?? 0) - (groupOrderMap.get(right.group) ?? 0);
      if (groupDelta !== 0) return groupDelta;
      return left.sortOrder - right.sortOrder;
    });

  const { counts: allStarCounts, rows: allStarRows } = buildAllStarData({
    awards,
    allAwards,
    allTeams,
    currentTeam,
    nhlTeams,
    playerTotals,
    players,
    seasons,
  });

  return {
    cards,
    summaryLines,
    allStarCounts,
    allStarRows,
  };
}
