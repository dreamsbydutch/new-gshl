"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import { useAuthSession } from "@gshl-hooks";
import {
  ALL_STAR_MEDAL_EMOJIS,
  AWARD_GROUP_ORDER,
} from "@gshl-lib/config/awards";
import type {
  AwardRaceCard,
  AllStarTeamCard,
  AllStarWinner,
  SeasonAwardsProps,
} from "@gshl-types";
import { buildAwardRaces } from "@gshl-utils/features/award-races";
import {
  buildAllStarTeamCards,
  buildStandingsNavigationHref,
  buildPlayerAwardSections,
  buildSeasonAwardCards,
  isSeasonAwardsInProgress,
} from "@gshl-utils";
import {
  buildWhatsAppShareMessage,
  canShareOwnerContent,
} from "@gshl-utils/features/whatsapp-share";

function AwardIcon({
  imageUrl,
  alt,
  fallbackLabel = "AWD",
  fallbackIcon,
  featured = false,
}: {
  imageUrl: string | null;
  alt: string;
  fallbackLabel?: string;
  fallbackIcon?: string;
  featured?: boolean;
}) {
  const [errored, setErrored] = useState(false);

  if (!imageUrl || errored) {
    return (
      <div
        className={
          featured
            ? "flex h-full min-h-[5.5rem] w-20 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-slate-50"
            : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50"
        }
      >
        {fallbackIcon ? (
          <span aria-hidden="true" className="text-xl leading-none">
            {fallbackIcon}
          </span>
        ) : (
          <span className="font-barlow text-[9px] uppercase tracking-[0.12em] text-slate-400">
            {fallbackLabel}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={
        featured
          ? "flex h-full min-h-[5.5rem] w-20 shrink-0 items-center justify-center rounded-xl border border-slate-100 bg-slate-50"
          : "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50"
      }
    >
      <img
        className={
          featured
            ? "h-auto max-h-14 w-auto max-w-14 object-contain"
            : "h-auto max-h-7 w-auto max-w-7 object-contain"
        }
        src={imageUrl}
        alt={alt}
        onError={() => setErrored(true)}
      />
    </div>
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

function AwardList({
  children,
  valueLabel,
}: {
  children: ReactNode;
  valueLabel?: string;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {valueLabel ? (
        <div className="hidden grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] border-b border-slate-200 bg-slate-50 px-5 py-2.5 font-barlow text-[10px] uppercase tracking-[0.2em] text-slate-500 sm:grid">
          <span>Award</span>
          <span>{valueLabel}</span>
        </div>
      ) : null}
      <ul className="divide-y divide-slate-100">{children}</ul>
    </div>
  );
}

function AwardRaceRow({ card }: { card: AwardRaceCard }) {
  const List = card.ranked ? "ol" : "ul";
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 shadow-sm">
      <header className="flex items-center gap-2 border-b border-slate-200 pb-2">
        <AwardIcon imageUrl={card.imageUrl} alt="" fallbackLabel="AWD" />
        <h3 className="min-w-0 font-oswald text-sm leading-tight text-slate-950">
          {card.title}
        </h3>
      </header>
      <List
        className="mt-2 space-y-1"
        aria-label={`${card.title} ${card.ranked ? "leaders, ranked order" : "finalists, unranked"}`}
      >
        {card.contenders.map((contender, index) => (
          <li
            key={contender.id}
            className="flex min-w-0 items-center gap-2 text-sm leading-tight text-slate-700"
          >
            {card.ranked ? (
              <span
                className="w-2 shrink-0 text-[10px] tabular-nums text-slate-400"
                aria-hidden="true"
              >
                {index + 1}
              </span>
            ) : null}
            <WinnerLogo logoUrl={contender.logoUrl} fallbackLabel="GSHL" />
            <span className="min-w-0 break-words">{contender.name}</span>
            {card.ranked ? (
              <span className="ml-auto shrink-0 pl-1 text-xs tabular-nums text-slate-400">
                {contender.stat}
              </span>
            ) : null}
          </li>
        ))}
      </List>
    </section>
  );
}

function AllStarPlayerTile({
  player,
  position,
}: {
  player: AllStarWinner | undefined;
  position: string;
}) {
  if (!player) {
    return (
      <div className="col-span-2 px-1 py-2 text-center">
        <span className="font-barlow text-[10px] uppercase tracking-[0.12em] text-slate-400">
          {position}
        </span>
      </div>
    );
  }

  return (
    <div className="col-span-2 min-w-0 px-1 py-2 text-center">
      <p className="break-words font-oswald text-sm leading-tight text-slate-950 sm:text-base">
        {player.playerName}
      </p>
      <div className="mt-1.5 flex items-center justify-center gap-1.5">
        <span className="font-barlow text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">
          {position}
        </span>
        <WinnerLogo
          logoUrl={player.teamLogoUrl}
          fallbackLabel={player.teamName?.slice(0, 3) ?? "GSHL"}
        />
      </div>
    </div>
  );
}

function AllStarLineupCard({ card }: { card: AllStarTeamCard }) {
  const winnerAt = (position: AllStarWinner["lineupPosition"]) =>
    card.winners.find((winner) => winner.lineupPosition === position);
  const defensemen = card.winners.filter(
    (winner) => winner.lineupPosition === "D",
  );

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-3">
        <h3 className="flex items-center gap-2 font-oswald text-xl text-slate-950">
          <span aria-hidden="true">
            {ALL_STAR_MEDAL_EMOJIS.get(card.awardKey)}
          </span>
          {card.title}
        </h3>
      </header>
      <div className="py-1">
        <div className="grid grid-cols-6 items-start py-1">
          <AllStarPlayerTile player={winnerAt("LW")} position="LW" />
          <AllStarPlayerTile player={winnerAt("C")} position="C" />
          <AllStarPlayerTile player={winnerAt("RW")} position="RW" />
        </div>
        <div className="mx-auto w-4/6 border-b border-slate-300" />
        <div className="grid grid-cols-6 items-start py-1">
          <div className="col-span-1" />
          <AllStarPlayerTile player={defensemen[0]} position="D" />
          <AllStarPlayerTile player={defensemen[1]} position="D" />
          <div className="col-span-1" />
        </div>
        <div className="mx-auto w-4/6 border-b border-slate-300" />
        <div className="grid grid-cols-6 items-start py-1">
          <div className="col-span-2" />
          <AllStarPlayerTile player={winnerAt("G")} position="G" />
          <div className="col-span-2" />
        </div>
      </div>
    </section>
  );
}

function AwardListRow({
  awardLabel,
  awardImageUrl,
  awardFallbackLabel,
  awardFallbackIcon,
  winnerName,
  winnerDetail,
  winnerLogoUrl,
  winnerFallbackLabel = "GSHL",
  nomineeNames = [],
}: {
  awardLabel: string;
  awardImageUrl: string | null;
  awardFallbackLabel?: string;
  awardFallbackIcon?: string;
  winnerName: string;
  winnerDetail: string | null;
  winnerLogoUrl: string | null;
  winnerFallbackLabel?: string;
  nomineeNames?: string[];
}) {
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3">
        <AwardIcon
          imageUrl={awardImageUrl}
          alt={awardLabel}
          fallbackLabel={awardFallbackLabel}
          fallbackIcon={awardFallbackIcon}
          featured
        />
        <div className="flex min-h-[5.5rem] min-w-0 flex-col justify-center">
          <p className="truncate font-barlow text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:text-[11px]">
            {awardLabel}
          </p>
          <div className="mt-2 flex min-w-0 items-center gap-2.5">
            <WinnerLogo
              logoUrl={winnerLogoUrl}
              fallbackLabel={winnerFallbackLabel}
            />
            <div className="min-w-0">
              <p className="break-words font-oswald text-lg leading-tight text-slate-950 sm:text-xl">
                {winnerName}
              </p>
              {winnerDetail ? (
                <p className="break-words text-xs text-slate-500 sm:text-sm">
                  {winnerDetail}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
      {nomineeNames.length > 0 ? (
        <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs leading-snug text-slate-500">
          <span className="mr-2 font-barlow text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Nominees
          </span>
          {nomineeNames.join(", ")}
        </p>
      ) : null}
    </li>
  );
}

function AwardSection({
  eyebrow,
  title,
  children,
  valueLabel,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
  valueLabel?: string;
}) {
  return (
    <section>
      <div className="mb-3">
        <p className="font-barlow text-[10px] uppercase tracking-[0.24em] text-slate-400">
          {eyebrow}
        </p>
        <h2 className="mt-1 font-oswald text-2xl leading-none text-slate-950 sm:text-3xl">
          {title}
        </h2>
      </div>
      <AwardList valueLabel={valueLabel}>{children}</AwardList>
    </section>
  );
}

export function SeasonAwards({
  teamStats,
  playerAwards,
  teamAwards,
  players,
  playerTotals,
  season,
  teams,
}: SeasonAwardsProps) {
  const { session } = useAuthSession();
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
  const isInProgress = isSeasonAwardsInProgress(season);
  const races = useMemo(
    () =>
      buildAwardRaces({
        season,
        teams,
        teamStats,
        players,
        playerTotals,
        playerAwards,
        teamAwards,
      }),
    [season, teams, teamStats, players, playerTotals, playerAwards, teamAwards],
  );
  const hasContenders = races.length > 0;
  const hasAwards =
    awardCards.length > 0 ||
    playerAwardWinnerCount > 0 ||
    allStarWinnerCount > 0;
  const canShare = canShareOwnerContent(session?.user.role);
  const sharePath = season
    ? buildStandingsNavigationHref("", {
        view: "awards",
        season: season.id,
      })
    : undefined;
  const seasonLabel = season?.year ? String(season.year) : "Season";
  const overallShareMessage = buildWhatsAppShareMessage({
    title: `GSHL ${seasonLabel} Awards`,
    lines: [
      ...awardCards.map(
        (card) => `${card.catalog.fullName}: ${card.winnerName}`,
      ),
      ...playerAwardSections.flatMap((section) =>
        section.winners.map(
          (winner) => `${section.title}: ${winner.playerName}`,
        ),
      ),
      ...allStarCards
        .filter((card) => card.winners.length > 0)
        .map(
          (card) =>
            `${card.title}: ${card.winners.map((winner) => winner.playerName).join(", ")}`,
        ),
    ],
  });

  if (isInProgress && !hasContenders) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-muted-foreground">
          Award contenders will appear as the season progresses.
        </div>
      </div>
    );
  }

  if (!isInProgress && !hasAwards) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-muted-foreground">
          No awards are on record for this season yet.
        </div>
      </div>
    );
  }

  if (isInProgress) {
    return (
      <section className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6 lg:pt-6">
        <h1 className="font-oswald text-xl text-slate-950">Award races</h1>
        <div className="mt-3 space-y-5">
          {[true, false].map((ranked) => {
            const cards = races.filter((card) => card.ranked === ranked);
            return cards.length > 0 ? (
              <section
                key={String(ranked)}
                aria-label={ranked ? "Leaders" : "Unranked finalists"}
              >
                <h2 className="mb-2 font-barlow text-xs uppercase tracking-wide text-slate-500">
                  {ranked ? "Leaders" : "Unranked finalists"}
                </h2>
                <div className="grid grid-cols-1 items-start gap-3 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {cards.map((card) => (
                    <AwardRaceRow key={card.id} card={card} />
                  ))}
                </div>
              </section>
            ) : null;
          })}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-6xl px-4 pb-12 pt-4 sm:px-6 lg:pt-6">
      <header className="border-b border-slate-200 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-barlow text-sm uppercase text-slate-400">
            {season?.year ? `${season.year} Awards` : "Awards"}
          </p>
          {canShare ? (
            <WhatsAppShareButton
              message={overallShareMessage}
              path={sharePath}
              label="Share season awards"
            />
          ) : null}
        </div>
      </header>

      <div className="mt-8 space-y-10">
        {visibleGroups.map((group) => {
          const groupCards = awardCards.filter(
            (card) => card.catalog.group === group,
          );

          return (
            <AwardSection key={group} eyebrow="Team awards" title={group}>
              {groupCards.map((card) => (
                <AwardListRow
                  key={card.id}
                  awardLabel={card.catalog.fullName}
                  awardImageUrl={card.catalog.imageUrl}
                  winnerName={card.winnerName}
                  winnerDetail={card.winnerDetail}
                  winnerLogoUrl={card.logoUrl}
                  nomineeNames={card.nomineeNames}
                />
              ))}
            </AwardSection>
          );
        })}

        {playerAwardWinnerCount > 0 ? (
          <AwardSection eyebrow="Player awards" title="Individual honors">
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
                  nomineeNames={winner.nomineeNames}
                />
              )),
            )}
          </AwardSection>
        ) : null}

        {allStarWinnerCount > 0 ? (
          <section
            className="grid gap-4 lg:grid-cols-2"
            aria-label="All-Star teams"
          >
            {allStarCards
              .filter((card) => card.winners.length > 0)
              .map((card) => (
                <AllStarLineupCard key={card.awardKey} card={card} />
              ))}
          </section>
        ) : null}
      </div>
    </section>
  );
}
