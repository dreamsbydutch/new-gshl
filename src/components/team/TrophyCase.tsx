"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { AWARD_GROUP_ORDER } from "@gshl-lib/config/awards";
import type {
  TrophyCaseCard,
  TrophyCaseProps,
  TrophyCaseSummaryLine,
} from "@gshl-types";
import {
  buildTrophyCaseData,
  cn,
  formatOwnerName,
  getSummaryLineClass,
} from "@gshl-utils";

function TrophySectionDivider({ label }: { label: string }) {
  return (
    <div className="mb-5 mt-8 flex items-center gap-2.5 px-3 sm:mb-8 sm:mt-14 sm:gap-4 sm:px-4">
      <div className="h-0 w-full border-t-4 border-dotted border-gray-300" />
      <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-gray-400 sm:text-xs sm:tracking-[0.28em]">
        {label}
      </span>
      <div className="h-0 w-full border-t-4 border-dotted border-gray-300" />
    </div>
  );
}

function TrophySummary({
  ownerName,
  summaryLines,
}: {
  ownerName: string;
  summaryLines: TrophyCaseSummaryLine[];
}) {
  if (summaryLines.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p className="text-sm text-muted-foreground">
          {ownerName} has no team awards to display yet.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-6 text-center">
      <div className="space-y-1 font-varela leading-tight text-black">
        {summaryLines.map((line) => (
          <p key={line.awardKey} className={getSummaryLineClass(line.group)}>
            {line.text}
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
      <div className="flex h-16 w-full items-center justify-center rounded-[1.25rem] border border-gray-200 bg-gradient-to-b from-gray-50 to-white px-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_10px_24px_rgba(15,23,42,0.08)]">
        <span className="font-barlow text-sm uppercase tracking-[0.2em] text-gray-400">
          {fallbackLabel}
        </span>
      </div>
    );
  }
  return (
    <img
      className="h-16 w-full object-contain"
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
      <div className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/80 bg-white/90 shadow-md sm:h-9 sm:w-9 sm:rounded-xl sm:shadow-lg">
        <span className="text-[8px] uppercase tracking-[0.12em] text-gray-400 sm:text-[10px] sm:tracking-[0.2em]">
          GSHL
        </span>
      </div>
    );
  }
  return (
    <img
      className="h-7 w-7 rounded-lg bg-white/90 object-cover p-0.5 shadow-md sm:h-9 sm:w-9 sm:rounded-xl sm:p-1 sm:shadow-lg"
      src={logoUrl}
      alt={`${teamName ?? "Franchise"} logo`}
      onError={() => setErrored(true)}
    />
  );
}

function TrophyCard({ card }: { card: TrophyCaseCard }) {
  return (
    <article className="mx-auto flex w-full max-w-36 flex-col items-center text-center">
      <div className="relative flex w-full items-end justify-center pb-2">
        <TrophyImage
          imageUrl={card.catalog.imageUrl}
          alt={card.catalog.fullName}
          fallbackLabel={`${card.catalog.fullName} image`}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <FranchiseLogo
            logoUrl={card.franchiseLogoUrl}
            teamName={card.franchiseName}
          />
        </div>
      </div>
      <div className="mt-2 font-varela text-xl font-bold leading-none text-black">
        {card.seasonYear}
      </div>
      <div className="mt-1 font-varela text-sm font-semibold leading-tight text-black">
        {card.catalog.fullName}
      </div>
      {card.franchiseName ? (
        <div className="mt-1 font-varela text-xs leading-tight text-muted-foreground">
          {card.franchiseName}
        </div>
      ) : null}
    </article>
  );
}

export function TrophyCase(props: TrophyCaseProps) {
  const { cards, summaryLines } = useMemo(
    () => buildTrophyCaseData(props),
    [props],
  );
  const visibleGroups = AWARD_GROUP_ORDER.filter((group) =>
    cards.some((card) => card.catalog.group === group),
  );

  return (
    <section className="pb-8 font-varela sm:pb-12">
      <TrophySummary
        ownerName={formatOwnerName(props.currentTeam)}
        summaryLines={summaryLines}
      />
      {visibleGroups.map((group) => {
        const groupCards = cards.filter((card) => card.catalog.group === group);
        return (
          <div key={group}>
            <TrophySectionDivider label={group} />
            <div
              className={cn(
                "mx-auto grid w-full max-w-7xl grid-cols-[repeat(auto-fit,minmax(8.5rem,9rem))] justify-center gap-x-2 gap-y-4 px-3 sm:gap-y-5 sm:px-4",
                groupCards.length === 1 && "max-w-xs",
              )}
            >
              {groupCards.map((card) => (
                <TrophyCard key={card.id} card={card} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
