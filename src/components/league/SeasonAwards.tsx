"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AWARD_GROUP_ORDER } from "@gshl-lib/config/awards";
import type { SeasonAwardsProps } from "@gshl-types";
import {
  buildAllStarTeamCards,
  buildPlayerAwardSections,
  buildSeasonAwardCards,
} from "@gshl-utils";

function AwardIcon({
  imageUrl,
  alt,
  fallbackLabel = "AWD",
}: {
  imageUrl: string | null;
  alt: string;
  fallbackLabel?: string;
}) {
  const [errored, setErrored] = useState(false);

  if (!imageUrl || errored) {
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
        <span className="font-barlow text-[9px] uppercase tracking-[0.12em] text-slate-400">
          {fallbackLabel}
        </span>
      </div>
    );
  }

  return (
    <img
      className="h-10 w-10 shrink-0 rounded-xl border border-slate-100 bg-slate-50 object-contain p-1"
      src={imageUrl}
      alt={alt}
      onError={() => setErrored(true)}
    />
  );
}

function WinnerLogo({
  logoUrl,
  fallbackLabel,
}: {
  logoUrl: string | null;
  fallbackLabel: string;
}) {
  const [errored, setErrored] = useState(false);

  if (!logoUrl || errored) {
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
        <span className="font-barlow text-[9px] uppercase tracking-[0.12em] text-slate-400">
          {fallbackLabel}
        </span>
      </div>
    );
  }

  return (
    <img
      className="h-8 w-8 shrink-0 rounded-lg border border-slate-100 bg-white object-contain p-1"
      src={logoUrl}
      alt=""
      onError={() => setErrored(true)}
    />
  );
}

function AwardList({ children }: { children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 px-5 py-2.5 font-barlow text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:grid">
        <span>Award</span>
        <span>Winner</span>
      </div>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </div>
  );
}

function AwardListRow({
  awardLabel,
  awardImageUrl,
  awardFallbackLabel,
  winnerName,
  winnerDetail,
  winnerLogoUrl,
  winnerFallbackLabel = "GSHL",
}: {
  awardLabel: string;
  awardImageUrl: string | null;
  awardFallbackLabel?: string;
  winnerName: string;
  winnerDetail: string | null;
  winnerLogoUrl: string | null;
  winnerFallbackLabel?: string;
}) {
  return (
    <li className="grid gap-3 px-4 py-3.5 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] sm:items-center sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <AwardIcon
          imageUrl={awardImageUrl}
          alt={awardLabel}
          fallbackLabel={awardFallbackLabel}
        />
        <h3 className="min-w-0 truncate font-oswald text-lg leading-tight text-slate-950 sm:text-xl">
          {awardLabel}
        </h3>
      </div>
      <div className="flex min-w-0 items-center gap-2.5 pl-[3.25rem] sm:justify-start sm:pl-0">
        <span className="font-barlow text-[10px] uppercase tracking-[0.16em] text-slate-400 sm:hidden">
          Winner
        </span>
        <WinnerLogo
          logoUrl={winnerLogoUrl}
          fallbackLabel={winnerFallbackLabel}
        />
        <div className="min-w-0">
          <p className="truncate font-oswald text-base leading-tight text-slate-950 sm:text-lg">
            {winnerName}
          </p>
          {winnerDetail ? (
            <p className="truncate text-xs text-slate-500 sm:text-sm">
              {winnerDetail}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function AwardSection({
  eyebrow,
  title,
  count,
  children,
}: {
  eyebrow: string;
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-barlow text-[10px] uppercase tracking-[0.24em] text-slate-400">
            {eyebrow}
          </p>
          <h2 className="mt-1 font-oswald text-2xl leading-none text-slate-950 sm:text-3xl">
            {title}
          </h2>
        </div>
        <span className="font-barlow text-[10px] uppercase tracking-[0.16em] text-slate-400">
          {count} {count === 1 ? "award" : "awards"}
        </span>
      </div>
      <AwardList>{children}</AwardList>
    </section>
  );
}

export function SeasonAwards({
  playerAwards,
  teamAwards,
  players,
  playerTotals,
  season,
  teams,
}: SeasonAwardsProps) {
  const awardCards = useMemo(
    () => buildSeasonAwardCards(teamAwards, teams),
    [teamAwards, teams],
  );
  const allStarCards = useMemo(
    () => buildAllStarTeamCards(playerAwards, players, playerTotals, teams),
    [playerAwards, players, playerTotals, teams],
  );
  const playerAwardSections = useMemo(
    () => buildPlayerAwardSections(playerAwards, players, playerTotals, teams),
    [playerAwards, players, playerTotals, teams],
  );
  const visibleGroups = useMemo(
    () =>
      AWARD_GROUP_ORDER.filter((group) =>
        awardCards.some((card) => card.catalog.group === group),
      ),
    [awardCards],
  );
  const allStarWinnerCount = allStarCards.reduce(
    (count, card) => count + card.winners.length,
    0,
  );
  const playerAwardWinnerCount = playerAwardSections.reduce(
    (count, section) => count + section.winners.length,
    0,
  );
  const hasAwards =
    awardCards.length > 0 ||
    playerAwardWinnerCount > 0 ||
    allStarWinnerCount > 0;

  if (!hasAwards) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-muted-foreground">
          No awards are on record for this season yet.
        </div>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6 lg:pt-6">
      <header className="border-b border-slate-200 pb-6">
        <p className="font-barlow text-xs uppercase tracking-[0.3em] text-slate-400">
          {season?.year ? `${season.year} Season` : "Season"}
        </p>
        <h1 className="mt-2 font-oswald text-4xl leading-none text-slate-950 sm:text-5xl">
          Awards
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
          A season-by-season listing of team, player, and all-star honors.
        </p>
      </header>

      <div className="mt-8 space-y-10">
        {visibleGroups.map((group) => {
          const groupCards = awardCards.filter(
            (card) => card.catalog.group === group,
          );

          return (
            <AwardSection
              key={group}
              eyebrow="Team awards"
              title={group}
              count={groupCards.length}
            >
              {groupCards.map((card) => (
                <AwardListRow
                  key={card.id}
                  awardLabel={card.catalog.fullName}
                  awardImageUrl={card.catalog.imageUrl}
                  winnerName={card.winnerName}
                  winnerDetail={card.winnerDetail}
                  winnerLogoUrl={card.logoUrl}
                />
              ))}
            </AwardSection>
          );
        })}

        {playerAwardWinnerCount > 0 ? (
          <AwardSection
            eyebrow="Player awards"
            title="Individual honors"
            count={playerAwardWinnerCount}
          >
            {playerAwardSections.flatMap((section) =>
              section.winners.map((winner) => (
                <AwardListRow
                  key={`${section.awardKey}-${winner.playerId}`}
                  awardLabel={section.title}
                  awardImageUrl={section.iconUrl}
                  winnerName={winner.playerName}
                  winnerDetail={
                    winner.positions +
                    (winner.teamName ? ` - ${winner.teamName}` : "")
                  }
                  winnerLogoUrl={winner.teamLogoUrl}
                />
              )),
            )}
          </AwardSection>
        ) : null}

        {allStarWinnerCount > 0 ? (
          <AwardSection
            eyebrow="Player awards"
            title="All-Star teams"
            count={allStarWinnerCount}
          >
            {allStarCards.flatMap((card) =>
              card.winners.map((winner) => (
                <AwardListRow
                  key={`${card.awardKey}-${winner.playerId}`}
                  awardLabel={card.title}
                  awardImageUrl={null}
                  awardFallbackLabel="AS"
                  winnerName={winner.playerName}
                  winnerDetail={
                    winner.positions +
                    (winner.teamName ? ` - ${winner.teamName}` : "")
                  }
                  winnerLogoUrl={winner.teamLogoUrl}
                  winnerFallbackLabel="AS"
                />
              )),
            )}
          </AwardSection>
        ) : null}
      </div>
    </section>
  );
}
