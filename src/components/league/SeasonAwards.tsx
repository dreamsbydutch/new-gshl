"use client";
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { AWARD_CATALOG_BY_KEY, AWARD_GROUP_ORDER } from "@gshl-lib/config/awards";
import { AwardsList } from "@gshl-types";
import type {
  Awards,
  AwardCatalogEntry,
  GSHLTeam,
  Player,
  PlayerTotalStatLine,
  Season,
} from "@gshl-types";
import { cn } from "@gshl-utils";

const ALL_STAR_AWARD_ORDER = [
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
  AwardsList.PLAYOFF_AS,
] as const;

type AllStarAwardKey = (typeof ALL_STAR_AWARD_ORDER)[number];

type SeasonAwardWinnerCard = {
  id: string;
  award: Awards;
  catalog: AwardCatalogEntry;
  winnerName: string;
  winnerDetail: string | null;
  logoUrl: string | null;
};

type AllStarWinner = {
  playerId: string;
  playerName: string;
  positions: string;
  teamName: string | null;
  teamLogoUrl: string | null;
};

type AllStarTeamCard = {
  awardKey: AllStarAwardKey;
  title: string;
  winners: AllStarWinner[];
};

export interface SeasonAwardsProps {
  awards: Awards[];
  players: Player[];
  playerTotals: PlayerTotalStatLine[];
  season: Season | null;
  teams: GSHLTeam[];
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
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/80 bg-white/90 shadow-lg">
        <span className="font-barlow text-[10px] uppercase tracking-[0.18em] text-gray-400">
          {fallbackLabel}
        </span>
      </div>
    );
  }

  return (
    <img
      className="h-12 w-12 rounded-2xl bg-white/90 object-cover p-1 shadow-lg"
      src={logoUrl}
      alt=""
      onError={() => setErrored(true)}
    />
  );
}

function TrophyImage({
  imageUrl,
  alt,
}: {
  imageUrl: string;
  alt: string;
}) {
  const [errored, setErrored] = useState(false);

  if (!imageUrl || errored) {
    return (
      <div className="flex h-32 w-full items-center justify-center rounded-[2rem] border border-gray-200 bg-gradient-to-b from-gray-50 to-white px-4 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_12px_28px_rgba(15,23,42,0.08)]">
        <span className="font-barlow text-sm uppercase tracking-[0.2em] text-gray-400">
          Trophy
        </span>
      </div>
    );
  }

  return (
    <img
      className="h-32 w-full object-contain"
      src={imageUrl}
      alt={alt}
      onError={() => setErrored(true)}
    />
  );
}

function getOwnerDisplayName(team: GSHLTeam | undefined): string | null {
  if (!team) return null;

  const nickname = String(team.ownerNickname ?? "").trim();
  if (nickname) return nickname;

  const fullName = [team.ownerFirstName, team.ownerLastName]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");

  return fullName || null;
}

function getAllStarTitle(awardKey: AllStarAwardKey): string {
  switch (awardKey) {
    case AwardsList.FIRST_AS:
      return "First Team All-Stars";
    case AwardsList.SECOND_AS:
      return "Second Team All-Stars";
    case AwardsList.PLAYOFF_AS:
      return "Playoff All-Stars";
  }
}

function getAllStarCardClass(awardKey: AllStarAwardKey): string {
  switch (awardKey) {
    case AwardsList.FIRST_AS:
      return "border-amber-200 bg-gradient-to-b from-amber-50 to-white";
    case AwardsList.SECOND_AS:
      return "border-slate-200 bg-gradient-to-b from-slate-100 to-white";
    case AwardsList.PLAYOFF_AS:
      return "border-orange-200 bg-gradient-to-b from-orange-50 to-white";
  }
}

function normalizeIdList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => normalizeIdList(entry));
  }

  if (
    typeof value !== "string" &&
    typeof value !== "number" &&
    typeof value !== "boolean"
  ) {
    return [];
  }

  const raw = String(value).trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return normalizeIdList(parsed);
    }
  } catch {
    // Fall back to CSV parsing.
  }

  return raw
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);
}

function getPlayerPositions(
  nhlPos: PlayerTotalStatLine["nhlPos"] | undefined,
): string {
  return Array.isArray(nhlPos) ? nhlPos.join("/") : String(nhlPos ?? "-");
}

function buildSeasonAwardCards(
  awards: Awards[],
  teams: GSHLTeam[],
): SeasonAwardWinnerCard[] {
  const allStarAwardKeys = new Set<string>(ALL_STAR_AWARD_ORDER);
  const teamByOwnerId = new Map(
    teams
      .filter((team) => team.ownerId)
      .map((team) => [String(team.ownerId), team]),
  );

  return awards
    .filter((award) => !allStarAwardKeys.has(String(award.award)))
    .map((award) => {
      const catalog = AWARD_CATALOG_BY_KEY.get(award.award);
      if (!catalog) return null;

      const winningTeam = teamByOwnerId.get(String(award.winnerId));
      const ownerDisplayName = getOwnerDisplayName(winningTeam);

      return {
        id: String(award.id),
        award,
        catalog,
        winnerName:
          winningTeam?.name?.trim() ?? ownerDisplayName ?? "Winner not found",
        winnerDetail:
          winningTeam?.name?.trim() && ownerDisplayName
            ? ownerDisplayName
            : (winningTeam?.confName?.trim() ?? null),
        logoUrl: winningTeam?.logoUrl ?? null,
      } satisfies SeasonAwardWinnerCard;
    })
    .filter((card): card is SeasonAwardWinnerCard => card !== null)
    .sort((left, right) => {
      const groupDelta =
        AWARD_GROUP_ORDER.indexOf(left.catalog.group) -
        AWARD_GROUP_ORDER.indexOf(right.catalog.group);
      if (groupDelta !== 0) return groupDelta;
      return left.catalog.sortOrder - right.catalog.sortOrder;
    });
}

function buildAllStarTeamCards(
  awards: Awards[],
  players: Player[],
  playerTotals: PlayerTotalStatLine[],
  teams: GSHLTeam[],
): AllStarTeamCard[] {
  const playerById = new Map(
    players.map((player) => [String(player.id), player.fullName]),
  );
  const teamById = new Map(teams.map((team) => [String(team.id), team]));

  return ALL_STAR_AWARD_ORDER.map((awardKey) => {
    const winners = awards
      .filter((award) => award.award === awardKey)
      .map((award) => {
        const playerId = String(award.winnerId);
        const playerTotal = playerTotals.find((row) => {
          return String(row.playerId) === playerId;
        });
        const gshlTeamIds = normalizeIdList(playerTotal?.gshlTeamIds);
        const gshlTeams = gshlTeamIds
          .map((teamId) => teamById.get(teamId))
          .filter((team): team is GSHLTeam => Boolean(team));
        const primaryTeam = gshlTeams[0] ?? null;

        return {
          playerId,
          playerName: playerById.get(playerId) ?? `Player ${playerId}`,
          positions: getPlayerPositions(playerTotal?.nhlPos),
          teamName:
            gshlTeams
              .map((team) => team.name)
              .filter((teamName): teamName is string => Boolean(teamName))
              .join(", ") || null,
          teamLogoUrl: primaryTeam?.logoUrl ?? null,
        } satisfies AllStarWinner;
      })
      .sort((left, right) => left.playerName.localeCompare(right.playerName));

    return {
      awardKey,
      title: getAllStarTitle(awardKey),
      winners,
    };
  });
}

function AwardWinnerCard({ card }: { card: SeasonAwardWinnerCard }) {
  return (
    <article className="rounded-[2rem] border border-slate-200 bg-gradient-to-b from-white to-slate-50 p-4 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
      <div className="relative flex items-end justify-center pb-4">
        <TrophyImage imageUrl={card.catalog.imageUrl} alt={card.catalog.fullName} />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2">
          <WinnerLogo logoUrl={card.logoUrl} fallbackLabel="GSHL" />
        </div>
      </div>
      <div className="mt-3 text-center">
        <p className="font-barlow text-[11px] uppercase tracking-[0.28em] text-gray-400">
          {card.catalog.group}
        </p>
        <h3 className="mt-2 font-oswald text-2xl leading-tight text-black">
          {card.catalog.fullName}
        </h3>
      </div>
      <div className="mt-4 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.9)]">
        <p className="font-barlow text-[11px] uppercase tracking-[0.24em] text-gray-400">
          Winner
        </p>
        <p className="mt-1 font-oswald text-2xl leading-tight text-black">
          {card.winnerName}
        </p>
        {card.winnerDetail ? (
          <p className="mt-1 text-sm text-slate-600">{card.winnerDetail}</p>
        ) : null}
      </div>
    </article>
  );
}

function AllStarTeamSection({ card }: { card: AllStarTeamCard }) {
  return (
    <article
      className={cn(
        "rounded-[2rem] border p-5 shadow-[0_18px_40px_rgba(15,23,42,0.08)]",
        getAllStarCardClass(card.awardKey),
      )}
    >
      <h3 className="text-center font-oswald text-2xl leading-tight text-black">
        {card.title}
      </h3>
      <div className="mt-4 space-y-2">
        {card.winners.length > 0 ? (
          card.winners.map((winner) => (
            <div
              key={`${card.awardKey}-${winner.playerId}`}
              className="flex items-center gap-3 rounded-2xl bg-white/85 px-3 py-2 shadow-sm"
            >
              <WinnerLogo logoUrl={winner.teamLogoUrl} fallbackLabel="AS" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-oswald text-xl leading-none text-black">
                  {winner.playerName}
                </p>
                <p className="truncate text-sm text-slate-600">
                  {winner.positions}
                  {winner.teamName ? ` • ${winner.teamName}` : ""}
                </p>
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-sm text-muted-foreground">
            No winners on record yet.
          </p>
        )}
      </div>
    </article>
  );
}

export function SeasonAwards({
  awards,
  players,
  playerTotals,
  season,
  teams,
}: SeasonAwardsProps) {
  const awardCards = useMemo(
    () => buildSeasonAwardCards(awards, teams),
    [awards, teams],
  );
  const allStarCards = useMemo(
    () => buildAllStarTeamCards(awards, players, playerTotals, teams),
    [awards, players, playerTotals, teams],
  );
  const visibleGroups = useMemo(
    () =>
      AWARD_GROUP_ORDER.filter((group) =>
        awardCards.some((card) => card.catalog.group === group),
      ),
    [awardCards],
  );

  if (awards.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        No awards are on record for this season yet.
      </div>
    );
  }

  return (
    <section className="pb-12">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p className="font-barlow text-xs uppercase tracking-[0.32em] text-gray-400">
          {season?.year ? `${season.year} Season` : "Season"} Awards
        </p>
        <h2 className="mt-3 font-oswald text-4xl leading-none text-black sm:text-5xl">
          Trophy Case
        </h2>
        <p className="mt-3 text-sm text-slate-600 sm:text-base">
          Every major award from this season, along with the franchise or player who won it.
        </p>
      </div>

      {visibleGroups.map((group) => {
        const groupCards = awardCards.filter((card) => card.catalog.group === group);

        return (
          <div key={group}>
            <TrophySectionDivider label={group} />
            <div
              className={cn(
                "mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 sm:grid-cols-2 xl:grid-cols-3",
                groupCards.length === 1 && "max-w-md",
              )}
            >
              {groupCards.map((card) => (
                <AwardWinnerCard key={card.id} card={card} />
              ))}
            </div>
          </div>
        );
      })}

      <TrophySectionDivider label="ALL-STAR TEAMS" />
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-4 px-4 lg:grid-cols-3">
        {allStarCards.map((card) => (
          <AllStarTeamSection key={card.awardKey} card={card} />
        ))}
      </div>
    </section>
  );
}
