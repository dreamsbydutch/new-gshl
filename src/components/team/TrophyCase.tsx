"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { AWARD_GROUP_ORDER } from "@gshl-lib/config/awards";
import {
  NHLLogo,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gshl-ui";
import {
  buildTrophyCaseData,
  cn,
  formatNumber,
  formatPlayerPositionList,
  getAllStarRowClass,
  getSummaryLineClass,
} from "@gshl-utils";
import type {
  AllStarCountLine,
  AllStarRowData,
  TrophyCaseCard,
  TrophyCaseProps,
  TrophyCaseSummaryLine,
} from "@gshl-types";

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
                    {formatPlayerPositionList(row.playerTotal.nhlPos)}
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
