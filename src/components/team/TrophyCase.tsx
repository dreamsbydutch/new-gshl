"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import {
  AWARD_CATALOG_BY_KEY,
  AWARD_GROUP_ORDER,
  getAwardTeamId,
} from "@gshl-lib/config/awards";
import type {
  AwardCatalogEntry,
  TrophyCaseCard,
  TrophyCaseProps,
  TrophyCaseSummaryLine,
} from "@gshl-types";
import { cn } from "@gshl-utils";

const groupOrder = new Map(
  AWARD_GROUP_ORDER.map((group, index) => [group, index]),
);

function formatYearRanges(values: Array<number | string>) {
  const years = Array.from(
    new Set(values.map(Number).filter(Number.isFinite)),
  ).sort((a, b) => a - b);
  if (!years.length) return values.join(", ");

  const ranges: string[] = [];
  let start = years[0]!;
  let end = start;
  for (const year of years.slice(1)) {
    if (year === end + 1) {
      end = year;
      continue;
    }
    ranges.push(
      start === end ? String(start) : `${start}-${String(end).slice(-2)}`,
    );
    start = year;
    end = year;
  }
  ranges.push(
    start === end ? String(start) : `${start}-${String(end).slice(-2)}`,
  );
  return ranges.join(", ");
}

function buildData({
  awards,
  allTeams,
  currentTeam,
  seasons,
}: TrophyCaseProps) {
  const franchiseTeamIds = new Set(
    allTeams
      .filter(
        (team) =>
          team.franchiseId === currentTeam.franchiseId ||
          (currentTeam.ownerId && team.ownerId === currentTeam.ownerId),
      )
      .map((team) => String(team.id)),
  );
  const yearBySeason = new Map(
    seasons.map((season) => [String(season.id), season.year]),
  );
  const teamById = new Map(allTeams.map((team) => [String(team.id), team]));

  const cards = awards
    .filter((award) => franchiseTeamIds.has(getAwardTeamId(award)))
    .map((award) => {
      const catalog = AWARD_CATALOG_BY_KEY.get(award.award);
      if (!catalog) return null;
      const historicalTeam = teamById.get(getAwardTeamId(award));
      return {
        id: String(award.id),
        award,
        catalog,
        seasonYear: yearBySeason.get(String(award.seasonId)) ?? award.seasonId,
        franchiseLogoUrl: historicalTeam?.logoUrl ?? currentTeam.logoUrl,
      } satisfies TrophyCaseCard;
    })
    .filter((card): card is TrophyCaseCard => card !== null)
    .sort((a, b) => {
      const groupDelta =
        (groupOrder.get(a.catalog.group) ?? 0) -
        (groupOrder.get(b.catalog.group) ?? 0);
      return (
        groupDelta ||
        a.catalog.sortOrder - b.catalog.sortOrder ||
        Number(b.seasonYear) - Number(a.seasonYear)
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

  const summaryLines: TrophyCaseSummaryLine[] = Array.from(summary.values())
    .map(({ catalog, years }) => ({
      awardKey: catalog.key,
      group: catalog.group,
      sortOrder: catalog.sortOrder,
      text:
        years.length > 1
          ? `${years.length}-time ${catalog.summaryLabel} Winner (${formatYearRanges(years)})`
          : `${years[0]} ${catalog.summaryLabel} Winner`,
    }))
    .sort(
      (a, b) =>
        (groupOrder.get(a.group) ?? 0) - (groupOrder.get(b.group) ?? 0) ||
        a.sortOrder - b.sortOrder,
    );

  return { cards, summaryLines };
}

function Divider({ label }: { label: string }) {
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

function TrophyCard({
  card,
  teamName,
}: {
  card: TrophyCaseCard;
  teamName: string | null;
}) {
  const [imageError, setImageError] = useState(false);
  const [logoError, setLogoError] = useState(false);
  return (
    <article className="mx-auto flex w-full max-w-[10.5rem] flex-col items-center text-center">
      <div className="relative flex w-full items-end justify-center pb-4">
        {!imageError ? (
          <img
            className="h-28 w-full object-contain"
            src={card.catalog.imageUrl}
            alt={card.catalog.fullName}
            onError={() => setImageError(true)}
          />
        ) : (
          <div className="flex h-28 w-full items-center justify-center rounded-[2rem] border bg-gray-50 px-3 text-xs text-gray-400">
            {card.catalog.fullName}
          </div>
        )}
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          {card.franchiseLogoUrl && !logoError ? (
            <img
              className="h-10 w-10 rounded-xl bg-white/90 object-cover p-1 shadow-lg"
              src={card.franchiseLogoUrl}
              alt={`${teamName ?? "Franchise"} logo`}
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-[9px] text-gray-400 shadow-lg">
              GSHL
            </div>
          )}
        </div>
      </div>
      <div className="mt-2 font-oswald text-3xl font-bold leading-none">
        {card.seasonYear}
      </div>
      <div className="mt-1 font-oswald text-xl leading-tight">
        {card.catalog.fullName}
      </div>
    </article>
  );
}

export function TrophyCase(props: TrophyCaseProps) {
  const { cards, summaryLines } = useMemo(() => buildData(props), [props]);
  const groups = AWARD_GROUP_ORDER.filter((group) =>
    cards.some((card) => card.catalog.group === group),
  );

  if (!cards.length) {
    return (
      <p className="px-6 py-10 text-center text-sm text-muted-foreground">
        No team awards on record yet.
      </p>
    );
  }

  return (
    <section className="pb-12">
      <div className="mx-auto max-w-3xl space-y-1 px-6 text-center font-oswald text-lg leading-tight">
        {summaryLines.map((line) => (
          <p key={line.awardKey}>{line.text}</p>
        ))}
      </div>
      {groups.map((group) => {
        const groupCards = cards.filter((card) => card.catalog.group === group);
        return (
          <div key={group}>
            <Divider label={group} />
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
                  teamName={props.currentTeam.name}
                />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
