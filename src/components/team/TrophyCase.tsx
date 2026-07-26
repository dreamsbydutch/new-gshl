"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { AWARD_GROUP_ORDER } from "@gshl-lib/config/awards";
import type {
  TrophyCaseAwardSection,
  TrophyCaseCard,
  TrophyCaseProps,
} from "@gshl-types";
import {
  AwardsList,
  buildTrophyCaseData,
  buildTrophyCupShowcaseLayout,
  cn,
  formatOwnerName,
} from "@gshl-utils";

function TrophySectionDivider({ label }: { label: string }) {
  return (
    <div className="mb-4 mt-8 flex items-center gap-2.5 px-3 sm:mb-6 sm:mt-12 sm:gap-4 sm:px-4">
      <div className="h-0 w-full border-t-4 border-dotted border-gray-300" />
      <span className="shrink-0 text-[10px] uppercase tracking-[0.2em] text-gray-400 sm:text-xs sm:tracking-[0.28em]">
        {label}
      </span>
      <div className="h-0 w-full border-t-4 border-dotted border-gray-300" />
    </div>
  );
}

function TrophyImage({ imageUrl, alt }: { imageUrl: string; alt: string }) {
  const [errored, setErrored] = useState(false);
  if (!imageUrl || errored) {
    return (
      <div className="flex h-8 w-full items-center justify-center">
        <span
          className="font-barlow text-[7px] uppercase tracking-wide text-gray-300"
          aria-hidden="true"
        >
          Award
        </span>
        <span className="sr-only">{alt}</span>
      </div>
    );
  }
  return (
    <img
      className="h-8 w-full object-contain"
      src={imageUrl}
      alt={alt}
      onError={() => setErrored(true)}
    />
  );
}

function FranchiseLogo({
  logoUrl,
  teamName,
  className,
}: {
  logoUrl: string | null;
  teamName: string | null;
  className?: string;
}) {
  const [errored, setErrored] = useState(false);
  if (!logoUrl || errored) {
    return (
      <div
        className={cn(
          "h-4 w-4 rounded-full border border-white bg-gray-200 shadow-sm",
          className,
        )}
      />
    );
  }
  return (
    <img
      className={cn(
        "h-4 w-4 rounded-full border border-white bg-white object-cover shadow-sm",
        className,
      )}
      src={logoUrl}
      alt={`${teamName ?? "Franchise"} logo`}
      onError={() => setErrored(true)}
    />
  );
}

function FeaturedCupImage({
  imageUrl,
  alt,
}: {
  imageUrl: string;
  alt: string;
}) {
  const [errored, setErrored] = useState(false);
  if (!imageUrl || errored) {
    return (
      <div className="flex h-24 w-[85px] items-center justify-center">
        <span className="font-barlow text-[9px] uppercase tracking-wide text-gray-300">
          Cup
        </span>
      </div>
    );
  }
  return (
    <img
      className="h-auto w-[85px] max-w-none drop-shadow-[0_10px_12px_rgba(15,23,42,0.18)]"
      src={imageUrl}
      alt={alt}
      onError={() => setErrored(true)}
    />
  );
}

function FeaturedCupShowcase({ section }: { section: TrophyCaseAwardSection }) {
  const layout = buildTrophyCupShowcaseLayout(section.cards.length);

  return (
    <section className="pt-3" aria-label="GSHL Cup championships">
      <div
        className="relative mx-auto grid w-[calc(100%-1.5rem)] grid-cols-1 justify-items-center pb-4"
        style={{ maxWidth: layout.maxWidth }}
      >
        {layout.positions.map((position) => {
          const card = section.cards[position.itemIndex];
          if (!card) return null;
          const offsetFromCenter = position.offsetRatio - 0.5;
          const left =
            section.cards.length === 1
              ? "0"
              : `calc(${(offsetFromCenter * 100).toFixed(4)}% - ${(offsetFromCenter * 85).toFixed(4)}px)`;

          return (
            <article
              key={card.id}
              className="relative col-start-1 row-start-1 flex w-[85px] origin-center flex-col items-center text-center"
              style={{
                left,
                zIndex: position.zIndex,
                transform: `translateY(${position.translateY}px) scale(${position.scale})`,
              }}
              title={`GSHL Cup, ${card.seasonYear}${
                card.franchiseName ? ` - ${card.franchiseName}` : ""
              }`}
            >
              <div className="relative">
                <FeaturedCupImage
                  imageUrl={card.catalog.imageUrl}
                  alt={`GSHL Cup, ${card.seasonYear}`}
                />
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/3">
                  <FranchiseLogo
                    logoUrl={card.franchiseLogoUrl}
                    teamName={card.franchiseName}
                    className="h-10 w-10 border-2 shadow-md"
                  />
                </div>
              </div>
              <div className="mt-4 font-varela text-xl font-bold leading-none text-slate-800">
                {card.seasonYear}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function TrophyWin({ card }: { card: TrophyCaseCard }) {
  return (
    <article
      className="flex min-w-0 flex-col items-center border-r border-slate-200 px-1 py-2 text-center last:border-r-0"
      title={`${card.catalog.fullName}, ${card.seasonYear}${
        card.franchiseName ? ` - ${card.franchiseName}` : ""
      }`}
    >
      <div className="relative flex w-full items-end justify-center pb-1">
        <TrophyImage
          imageUrl={card.catalog.imageUrl}
          alt={card.catalog.fullName}
        />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <FranchiseLogo
            logoUrl={card.franchiseLogoUrl}
            teamName={card.franchiseName}
          />
        </div>
      </div>
      <div className="mt-1 font-varela text-[9px] font-bold leading-none text-slate-700 sm:text-[10px]">
        {card.seasonYear}
      </div>
    </article>
  );
}

function TrophyAwardRow({ section }: { section: TrophyCaseAwardSection }) {
  return (
    <section>
      <div className="px-3 sm:px-4">
        <div className="flex min-w-0 items-baseline gap-1.5 whitespace-nowrap font-varela uppercase text-black">
          <h3 className="min-w-0 truncate text-[13px] font-bold tracking-[0.05em] sm:text-[15px]">
            {section.catalog.fullName}
          </h3>
          <span className="shrink-0 text-[10px] font-semibold tracking-[0.04em] text-slate-500 sm:text-xs">
            - {section.winnerLabel}
          </span>
        </div>
        <p className="mt-0.5 truncate font-barlow text-[9px] uppercase tracking-[0.16em] text-slate-400 sm:text-[10px]">
          Seasons {section.seasonRange}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-6 overflow-hidden border-y border-slate-200 bg-slate-50/80 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
        {section.cards.map((card) => (
          <TrophyWin key={card.id} card={card} />
        ))}
      </div>
    </section>
  );
}

export function TrophyCase(props: TrophyCaseProps) {
  const { awardSections } = useMemo(() => buildTrophyCaseData(props), [props]);
  const featuredCupSection = awardSections.find(
    (section) => section.awardKey === AwardsList.GSHL_CUP,
  );
  const regularAwardSections = awardSections.filter(
    (section) => section.awardKey !== AwardsList.GSHL_CUP,
  );
  const visibleGroups = AWARD_GROUP_ORDER.filter((group) =>
    regularAwardSections.some((section) => section.catalog.group === group),
  );

  if (awardSections.length === 0) {
    return (
      <section className="pb-8 font-varela sm:pb-12">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-sm text-muted-foreground">
            {formatOwnerName(props.currentTeam)} has no team awards to display
            yet.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="pb-8 font-varela sm:pb-12">
      {featuredCupSection ? (
        <FeaturedCupShowcase section={featuredCupSection} />
      ) : null}
      {visibleGroups.map((group) => {
        const groupSections = regularAwardSections.filter(
          (section) => section.catalog.group === group,
        );
        return (
          <div key={group}>
            <TrophySectionDivider label={group} />
            <div className="mx-auto max-w-7xl space-y-6 sm:space-y-8">
              {groupSections.map((section) => (
                <TrophyAwardRow key={section.awardKey} section={section} />
              ))}
            </div>
          </div>
        );
      })}
    </section>
  );
}
