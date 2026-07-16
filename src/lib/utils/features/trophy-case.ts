import {
  AWARD_CATALOG_BY_KEY,
  AWARD_GROUP_ORDER,
} from "@gshl-lib/config/awards";
import type {
  AwardCatalogEntry,
  AwardGroupKey,
  BuildTrophyCaseDataInput,
  BuildTrophyCaseDataResult,
  TrophyCaseCard,
  TrophyCaseProps,
} from "@gshl-types";

const groupOrderMap = new Map(
  AWARD_GROUP_ORDER.map((group, index) => [group, index]),
);

export function getSeasonYearMap(seasons: TrophyCaseProps["seasons"]) {
  return new Map(seasons.map((season) => [String(season.id), season.year]));
}

export function formatYearRange(startYear: number, endYear: number): string {
  if (startYear === endYear) return String(startYear);
  return Math.floor(startYear / 100) === Math.floor(endYear / 100)
    ? `${startYear}-${String(endYear).slice(-2)}`
    : `${startYear}-${endYear}`;
}

export function formatYearRanges(years: Array<number | string>): string {
  const normalizedYears = Array.from(
    new Set(years.map(Number).filter(Number.isFinite)),
  ).sort((left, right) => left - right);
  if (normalizedYears.length === 0) return years.map(String).join(", ");

  const ranges: string[] = [];
  let rangeStart = normalizedYears[0]!;
  let rangeEnd = rangeStart;
  for (const currentYear of normalizedYears.slice(1)) {
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

export function getSummaryLineClass(group: AwardGroupKey) {
  switch (group) {
    case "TEAM TROPHIES":
      return "text-xl sm:text-2xl";
    case "TIER 1 AWARDS":
      return "text-lg sm:text-xl";
    case "TIER 2 AWARDS":
      return "text-base sm:text-lg";
  }
}

export function buildTrophyCaseData({
  teamAwards,
  allTeams,
  currentTeam,
  seasons,
}: BuildTrophyCaseDataInput): BuildTrophyCaseDataResult {
  const seasonYearMap = getSeasonYearMap(seasons);
  const franchiseTeamIds = new Set(
    allTeams
      .filter(
        (team) => String(team.franchiseId) === String(currentTeam.franchiseId),
      )
      .map((team) => String(team.id)),
  );
  const teamById = new Map(allTeams.map((team) => [String(team.id), team]));

  const cards = teamAwards
    .filter((award) => franchiseTeamIds.has(String(award.teamId)))
    .map((award) => {
      const catalog = AWARD_CATALOG_BY_KEY.get(award.award);
      if (!catalog) return null;
      const historicalTeam = teamById.get(String(award.teamId));
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
      return (
        groupDelta ||
        left.catalog.sortOrder - right.catalog.sortOrder ||
        Number(right.seasonYear) - Number(left.seasonYear)
      );
    });

  const summary = new Map<
    string,
    { catalog: AwardCatalogEntry; years: Array<number | string> }
  >();
  for (const card of cards) {
    const item = summary.get(card.catalog.key) ?? {
      catalog: card.catalog,
      years: [],
    };
    item.years.push(card.seasonYear);
    summary.set(card.catalog.key, item);
  }

  const summaryLines = Array.from(summary.values())
    .map(({ catalog, years }) => ({
      awardKey: catalog.key,
      group: catalog.group,
      sortOrder: catalog.sortOrder,
      text: resolveSummaryText(
        years.length,
        years.slice().sort((a, b) => Number(b) - Number(a))[0] ?? "",
        catalog.summaryLabel,
        years,
      ),
    }))
    .sort(
      (left, right) =>
        (groupOrderMap.get(left.group) ?? 0) -
          (groupOrderMap.get(right.group) ?? 0) ||
        left.sortOrder - right.sortOrder,
    );

  return { cards, summaryLines };
}
