"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import {
  AWARD_CATALOG_BY_KEY,
  AWARD_GROUP_ORDER,
} from "@gshl-lib/config/awards";
import {
  NHLLogo,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gshl-ui";
import { AwardsList, SeasonType } from "@gshl-types";
import { cn, formatNumber } from "@gshl-utils";
import type {
  AwardCatalogEntry,
  AwardGroupKey,
  NHLTeam,
  PlayerTotalStatLine,
  TrophyCaseCard,
  TrophyCaseProps,
  TrophyCaseSummaryLine,
} from "@gshl-types";

type AllStarAwardKey =
  | AwardsList.FIRST_AS
  | AwardsList.SECOND_AS
  | AwardsList.PLAYOFF_AS;

interface AllStarCountLine {
  awardKey: AllStarAwardKey;
  label: string;
  count: number;
}

interface AllStarRowData {
  awardKey: AllStarAwardKey;
  seasonId: string;
  seasonYear: number | string;
  playerId: string;
  playerName: string;
  playerTotal: PlayerTotalStatLine;
  nhlTeam: NHLTeam | undefined;
}

const ALL_STAR_AWARD_ORDER = [
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
  AwardsList.PLAYOFF_AS,
] as const;

const groupOrderMap = new Map(
  AWARD_GROUP_ORDER.map((group, index) => [group, index]),
);
const allStarOrderMap = new Map(
  ALL_STAR_AWARD_ORDER.map((award, index) => [award, index]),
);

function getSeasonYearMap(cards: TrophyCaseProps["seasons"]) {
  return new Map(cards.map((season) => [String(season.id), season.year]));
}

function resolveSummaryText(
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

function formatYearRanges(years: Array<number | string>): string {
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

function formatYearRange(startYear: number, endYear: number): string {
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

function normalizeIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeIdList(entry));
  }

  const raw = String(value ?? "").trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeIdList(parsed);
    }
  } catch {
    // Fall through to CSV parsing.
  }

  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function getAllStarSeasonType(awardKey: string): SeasonType | null {
  if (awardKey === AwardsList.FIRST_AS || awardKey === AwardsList.SECOND_AS) {
    return SeasonType.REGULAR_SEASON;
  }
  if (awardKey === AwardsList.PLAYOFF_AS) {
    return SeasonType.PLAYOFFS;
  }
  return null;
}

function getAllStarLabel(awardKey: AllStarAwardKey): string {
  switch (awardKey) {
    case AwardsList.FIRST_AS:
      return "First Team All-Stars";
    case AwardsList.SECOND_AS:
      return "Second Team All-Stars";
    case AwardsList.PLAYOFF_AS:
      return "Playoff All-Stars";
  }
}

function getAllStarRowClass(awardKey: AllStarAwardKey): string {
  switch (awardKey) {
    case AwardsList.FIRST_AS:
      return "bg-amber-50/70 hover:!bg-amber-100/50";
    case AwardsList.SECOND_AS:
      return "bg-slate-100/70 hover:!bg-slate-200/50";
    case AwardsList.PLAYOFF_AS:
      return "bg-orange-50/70 hover:!bg-orange-100/50";
  }
}

function getPlayerPositions(nhlPos: PlayerTotalStatLine["nhlPos"]): string {
  return Array.isArray(nhlPos) ? nhlPos.join("/") : String(nhlPos ?? "-");
}

function getPlayerNhlAbbreviation(value: unknown): string | null {
  if (Array.isArray(value)) {
    const firstTeam = value.find(
      (team): team is string =>
        typeof team === "string" && team.trim().length > 0,
    );
    return firstTeam ?? null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const team = value.trim();
  return team.length > 0 ? team : null;
}

function buildAllStarData(props: TrophyCaseProps): {
  counts: AllStarCountLine[];
  rows: AllStarRowData[];
} {
  const ownerId = String(props.currentTeam.ownerId ?? "");
  const seasonYearMap = getSeasonYearMap(props.seasons);

  const counts = ALL_STAR_AWARD_ORDER.map((awardKey) => ({
    awardKey,
    label: getAllStarLabel(awardKey),
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
  const nhlTeamByAbbr = new Map(
    props.nhlTeams.map((team) => [team.abbreviation, team]),
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
      nhlTeam: nhlTeamByAbbr.get(getPlayerNhlAbbreviation(playerTotal.nhlTeam) ?? ""),
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

function buildTrophyCaseData({
  awards,
  allAwards,
  allTeams,
  currentTeam,
  nhlTeams,
  playerTotals,
  players,
  seasons,
}: TrophyCaseProps): {
  cards: TrophyCaseCard[];
  summaryLines: TrophyCaseSummaryLine[];
  allStarCounts: AllStarCountLine[];
  allStarRows: AllStarRowData[];
} {
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

function TrophySectionDivider({ label }: { label: string }) {
  return (
    <div className="mb-8 mt-14 flex items-center gap-4 px-4">
      <div className="h-0 w-full border-t-4 border-dotted border-gray-300" />
      <span className="shrink-0 font-barlow text-xs uppercase tracking-[0.28em] text-gray-400">
        {label}
      </span>
      <div className="h-0 w-full border-t-4 border-dotted border-gray-300" />
    </div>
  );
}

function getSummaryLineClass(group: AwardGroupKey) {
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

function TrophySummary({
  teamName,
  summaryLines,
  allStarCounts,
}: {
  teamName: string | null;
  summaryLines: TrophyCaseSummaryLine[];
  allStarCounts: AllStarCountLine[];
}) {
  const hasAnyAllStars = allStarCounts.some((item) => item.count > 0);

  if (summaryLines.length === 0 && !hasAnyAllStars) {
    return (
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {teamName ?? "This franchise"} has no awards to display yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 text-center">
      <div className="space-y-1 font-oswald leading-tight text-black">
        {summaryLines.map((line) => (
          <p key={line.awardKey} className={getSummaryLineClass(line.group)}>
            {line.text}
          </p>
        ))}
        {allStarCounts.map((line) => (
          <p key={line.awardKey} className="text-base sm:text-lg">
            {line.count} {line.label}
          </p>
        ))}
      </div>
    </div>
  );
}

function TrophyImage({
  imageUrl,
  alt,
  fallbackLabel,
}: {
  imageUrl: string;
  alt: string;
  fallbackLabel: string;
}) {
  const [errored, setErrored] = useState(false);

  if (!imageUrl || errored) {
    return (
      <div className="flex h-28 w-full items-center justify-center rounded-[2rem] border border-gray-200 bg-gradient-to-b from-gray-50 to-white px-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_28px_rgba(15,23,42,0.08)]">
        <span className="font-barlow text-sm uppercase tracking-[0.2em] text-gray-400">
          {fallbackLabel}
        </span>
      </div>
    );
  }

  return (
    <img
      className="h-28 w-full object-contain"
      src={imageUrl}
      alt={alt}
      onError={() => setErrored(true)}
    />
  );
}

function FranchiseLogo({
  logoUrl,
  teamName,
}: {
  logoUrl: string | null;
  teamName: string | null;
}) {
  const [errored, setErrored] = useState(false);

  if (!logoUrl || errored) {
    return (
      <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/80 bg-white/90 shadow-lg">
        <span className="font-barlow text-[10px] uppercase tracking-[0.2em] text-gray-400">
          GSHL
        </span>
      </div>
    );
  }

  return (
    <img
      className="h-10 w-10 rounded-xl bg-white/90 object-cover p-1 shadow-lg"
      src={logoUrl}
      alt={`${teamName ?? "Franchise"} logo`}
      onError={() => setErrored(true)}
    />
  );
}

function TrophyCard({
  card,
  teamName,
}: {
  card: TrophyCaseCard;
  teamName: string | null;
}) {
  return (
    <article className="mx-auto flex w-full max-w-[10.5rem] flex-col items-center text-center">
      <div className="relative flex w-full items-end justify-center pb-4">
        <TrophyImage
          imageUrl={card.catalog.imageUrl}
          alt={card.catalog.fullName}
          fallbackLabel={`${card.catalog.fullName} image`}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <FranchiseLogo logoUrl={card.franchiseLogoUrl} teamName={teamName} />
        </div>
      </div>
      <div className="mt-2 font-oswald text-3xl font-bold leading-none text-black">
        {card.seasonYear}
      </div>
      <div className="mt-1 font-oswald text-xl leading-tight text-black">
        {card.catalog.fullName}
      </div>
    </article>
  );
}

function AllStarTable({ rows }: { rows: AllStarRowData[] }) {
  return (
    <div>
      <TrophySectionDivider label="ALL-STAR TEAMS" />
      <div className="mx-auto max-w-6xl px-3 sm:px-6">
        {rows.length > 0 ? (
          <Table className="min-w-[720px] table-fixed border-separate border-spacing-0 text-[11px] sm:min-w-[860px] sm:text-xs [&_td]:px-0.5 [&_td]:py-1 [&_th]:h-7 [&_th]:px-0.5 [&_th]:py-1">
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-[3rem] whitespace-nowrap">Season</TableHead>
                <TableHead className="w-[8.5rem] whitespace-nowrap">Player</TableHead>
                <TableHead className="w-[2rem] whitespace-nowrap">Pos</TableHead>
                <TableHead className="w-[2rem] text-right">GP</TableHead>
                <TableHead className="w-[2rem] text-right">G</TableHead>
                <TableHead className="w-[2rem] text-right">A</TableHead>
                <TableHead className="w-[2rem] text-right">P</TableHead>
                <TableHead className="w-[2.25rem] text-right">HIT</TableHead>
                <TableHead className="w-[2.25rem] text-right">BLK</TableHead>
                <TableHead className="w-[2rem] text-right">W</TableHead>
                <TableHead className="w-[2.5rem] text-right">GAA</TableHead>
                <TableHead className="w-[2.5rem] text-right">SVP</TableHead>
                <TableHead className="w-[2rem] text-right">SO</TableHead>
                <TableHead className="w-[2.75rem] text-right">Rating</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow
                  key={`${row.awardKey}-${row.seasonId}-${row.playerId}`}
                  className={getAllStarRowClass(row.awardKey)}
                >
                  <TableCell className="whitespace-nowrap font-medium">
                    {row.seasonYear}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-medium">
                    <div className="flex items-center justify-start gap-1.5 text-left">
                      <NHLLogo
                        team={row.nhlTeam}
                        size={18}
                        className="mx-0 shrink-0"
                      />
                      <span className="truncate">
                        {row.playerName}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {getPlayerPositions(row.playerTotal.nhlPos)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.playerTotal.GP, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.playerTotal.G, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.playerTotal.A, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.playerTotal.P, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.playerTotal.HIT, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.playerTotal.BLK, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.playerTotal.W, 0)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.playerTotal.GAA, 2)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.playerTotal.SVP, 3)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatNumber(row.playerTotal.SO, 0)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatNumber(row.playerTotal.Rating, 2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            No all-stars on record yet.
          </p>
        )}
      </div>
    </div>
  );
}

export function TrophyCase(props: TrophyCaseProps) {
  const { currentTeam } = props;
  const { cards, summaryLines, allStarCounts, allStarRows } = useMemo(
    () => buildTrophyCaseData(props),
    [props],
  );
  const visibleGroups = AWARD_GROUP_ORDER.filter((group) =>
    cards.some((card) => card.catalog.group === group),
  );

  return (
    <section className="pb-12">
      <TrophySummary
        teamName={currentTeam.name}
        summaryLines={summaryLines}
        allStarCounts={allStarCounts}
      />
      {visibleGroups.map((group) => {
        const groupCards = cards.filter((card) => card.catalog.group === group);

        return (
          <div key={group}>
            <TrophySectionDivider label={group} />
            <div
              className={cn(
                "mx-auto grid max-w-6xl grid-cols-2 gap-x-2 gap-y-5 px-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
                groupCards.length === 1 && "max-w-sm",
              )}
            >
              {groupCards.map((card) => (
                <TrophyCard
                  key={card.id}
                  card={card}
                  teamName={currentTeam.name}
                />
              ))}
            </div>
          </div>
        );
      })}
      <AllStarTable rows={allStarRows} />
    </section>
  );
}
