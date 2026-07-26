import {
  AWARD_CATALOG_BY_KEY,
  AWARD_GROUP_ORDER,
  getTeamAwardTeam,
} from "@gshl-lib/config/awards";
import type {
  AwardCatalogEntry,
  BuildTrophyCaseDataInput,
  BuildTrophyCaseDataResult,
  TrophyCaseCard,
  TrophyCaseProps,
  TrophyCupShowcaseLayout,
} from "@gshl-types";

const groupOrderMap = new Map(
  AWARD_GROUP_ORDER.map((group, index) => [group, index]),
);
const FEATURED_CUP_WIDTH = 85;
const FEATURED_CUP_OVERLAP_STEP = 60;
const FEATURED_CUP_MAX_WIDTH = 640;

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

export function buildTrophyCupShowcaseLayout(
  count: number,
): TrophyCupShowcaseLayout {
  if (count <= 0) return { maxWidth: 0, positions: [] };

  const slotOrder: number[] = [];
  if (count % 2 === 1) {
    const centerSlot = Math.floor(count / 2);
    slotOrder.push(centerSlot);
    for (let distance = 1; slotOrder.length < count; distance += 1) {
      slotOrder.push(centerSlot - distance);
      if (slotOrder.length < count) slotOrder.push(centerSlot + distance);
    }
  } else {
    const leftCenterSlot = count / 2 - 1;
    const rightCenterSlot = count / 2;
    for (let distance = 0; slotOrder.length < count; distance += 1) {
      slotOrder.push(leftCenterSlot - distance);
      if (slotOrder.length < count) {
        slotOrder.push(rightCenterSlot + distance);
      }
    }
  }

  const hasDepth = count >= 4;
  const maximumDistance = Math.max((count - 1) / 2, 1);
  const minimumDistance = count % 2 === 0 ? 0.5 : 0;
  const depthRange = Math.max(maximumDistance - minimumDistance, 1);
  const maxWidth =
    count === 1
      ? FEATURED_CUP_WIDTH
      : count === 2
        ? FEATURED_CUP_WIDTH * 2 + 15
        : count === 3
          ? FEATURED_CUP_WIDTH * 3 + 20
          : Math.min(
              FEATURED_CUP_WIDTH + FEATURED_CUP_OVERLAP_STEP * (count - 1),
              FEATURED_CUP_MAX_WIDTH,
            );

  return {
    maxWidth,
    positions: slotOrder.map((slotIndex, itemIndex) => {
      const distanceFromCenter = Math.abs(slotIndex - (count - 1) / 2);
      const prominence =
        1 - (distanceFromCenter - minimumDistance) / depthRange;

      return {
        itemIndex,
        slotIndex,
        offsetRatio: count === 1 ? 0.5 : slotIndex / (count - 1),
        translateY: hasDepth ? Math.round(prominence * 16) : 0,
        scale: hasDepth ? 0.84 + prominence * 0.16 : 1,
        zIndex: hasDepth ? Math.round(prominence * 100) + 1 : 1,
      };
    }),
  };
}

export function buildTrophyCaseData({
  teamAwards,
  allTeams,
  currentTeam,
  seasons,
}: BuildTrophyCaseDataInput): BuildTrophyCaseDataResult {
  const seasonYearMap = getSeasonYearMap(seasons);
  const ownerId = String(currentTeam.ownerId ?? "");
  const ownerTeamIds = new Set(
    allTeams
      .filter((team) =>
        ownerId
          ? String(team.ownerId ?? "") === ownerId
          : String(team.franchiseId) === String(currentTeam.franchiseId),
      )
      .map((team) => String(team.id)),
  );
  const cards = teamAwards
    .filter(
      (award) =>
        String(award.ownerId) === ownerId ||
        ownerTeamIds.has(String(award.teamId ?? "")),
    )
    .map((award) => {
      const catalog = AWARD_CATALOG_BY_KEY.get(award.award);
      if (!catalog) return null;
      const historicalTeam = getTeamAwardTeam(award, allTeams);
      return {
        id: String(award.id),
        award,
        catalog,
        seasonYear: seasonYearMap.get(String(award.seasonId)) ?? award.seasonId,
        franchiseLogoUrl:
          historicalTeam?.logoUrl ?? currentTeam.logoUrl ?? null,
        franchiseName: historicalTeam?.name ?? null,
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

  const groupedCards = new Map<
    string,
    { catalog: AwardCatalogEntry; cards: TrophyCaseCard[] }
  >();
  for (const card of cards) {
    const item = groupedCards.get(card.catalog.key) ?? {
      catalog: card.catalog,
      cards: [],
    };
    item.cards.push(card);
    groupedCards.set(card.catalog.key, item);
  }

  const awardSections = Array.from(groupedCards.values())
    .map(({ catalog, cards: awardCards }) => ({
      awardKey: catalog.key,
      catalog,
      cards: awardCards,
      winnerLabel: `${awardCards.length}-time winner`,
      seasonRange: formatYearRanges(awardCards.map((card) => card.seasonYear)),
    }))
    .sort(
      (left, right) =>
        (groupOrderMap.get(left.catalog.group) ?? 0) -
          (groupOrderMap.get(right.catalog.group) ?? 0) ||
        left.catalog.sortOrder - right.catalog.sortOrder,
    );

  return { cards, awardSections };
}
