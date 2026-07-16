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
      <div className="space-y-1 font-oswald leading-tight text-black">
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

function TrophyCard({ card }: { card: TrophyCaseCard }) {
  return (
    <article className="mx-auto flex w-full max-w-[10.5rem] flex-col items-center text-center">
      <div className="relative flex w-full items-end justify-center pb-4">
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
      <div className="mt-2 font-oswald text-3xl font-bold leading-none text-black">
        {card.seasonYear}
      </div>
      <div className="mt-1 font-oswald text-xl leading-tight text-black">
        {card.catalog.fullName}
      </div>
      {card.franchiseName ? (
        <div className="mt-1 text-xs leading-tight text-muted-foreground">
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
    <section className="pb-12">
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
                "mx-auto grid max-w-6xl grid-cols-2 gap-x-2 gap-y-5 px-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5",
                groupCards.length === 1 && "max-w-sm",
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
