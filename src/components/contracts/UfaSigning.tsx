"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { useUfaOverview } from "@gshl-hooks";
import { FreeAgencySkeleton, UfaHomeCardSkeleton } from "@gshl-skeletons";
import { TableViewport } from "@gshl-ui";
import {
  formatMoney,
  formatUfaStat,
  HOME_UFA_PREVIEW_LIMIT,
  selectHomeUfaPreview,
} from "@gshl-utils";
import type { UfaFreeAgentView, UfaOfferGroupView } from "@gshl-types";
import { UfaOfferForm } from "./UfaOfferForm";

function GshlTeamLogo({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    <Image
      src={src}
      alt={alt}
      width={36}
      height={36}
      className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9"
    />
  ) : (
    <span className="text-xs text-muted-foreground">—</span>
  );
}

function Countdown({ deadlineAt }: { deadlineAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.floor((deadlineAt - now) / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const remainder = seconds % 60;
  const accessibleTime =
    seconds === 0
      ? "Offer resolution pending"
      : `${days} days, ${hours} hours, ${minutes} minutes, ${remainder} seconds remaining`;
  return (
    <span
      className="whitespace-nowrap font-mono text-xs font-semibold"
      aria-label={accessibleTime}
    >
      {seconds === 0
        ? "Resolving…"
        : `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(remainder).padStart(2, "0")}s`}
    </span>
  );
}

function PlayerRows({
  players,
  showStats,
}: {
  players: UfaFreeAgentView[];
  showStats: boolean;
}) {
  const mobileCellPadding = showStats ? "px-1 py-1" : "px-0.5 py-0.5";
  return (
    <tbody>
      {players.map((player) => {
        const goalie = player.positionGroup === "G";
        const stats = player.stats;
        return (
          <tr
            key={player.id}
            className="group border-b border-border align-middle odd:bg-background even:bg-muted/25 hover:bg-muted/60"
          >
            <th
              scope="row"
              className={`sticky left-0 z-20 border-r bg-inherit text-left text-[10px] font-semibold group-hover:bg-muted sm:static sm:z-auto sm:w-auto sm:min-w-[10rem] sm:max-w-none sm:border-0 sm:px-2 sm:py-3 sm:text-sm ${showStats ? "w-28 min-w-28 max-w-28 px-1.5 py-1" : "w-24 min-w-24 max-w-24 px-1 py-0.5"}`}
            >
              <div className="flex min-w-0 items-center gap-1.5">
                <NHLLogo
                  team={
                    player.nhlTeamLogoUrl
                      ? {
                          name: player.nhlTeam || "NHL team",
                          logoUrl: player.nhlTeamLogoUrl,
                        }
                      : undefined
                  }
                  size={16}
                  className="mx-0 shrink-0"
                />
                <span className="truncate" title={player.fullName}>
                  {player.fullName}
                </span>
              </div>
            </th>
            <td
              className={`whitespace-nowrap text-[9px] sm:px-2 sm:py-3 sm:text-sm ${mobileCellPadding}`}
            >
              {player.positions.join("/") || player.positionGroup}
            </td>
            <td
              className={`whitespace-nowrap bg-muted/25 text-[9px] font-bold tabular-nums text-foreground sm:px-2 sm:py-3 sm:text-sm ${mobileCellPadding}`}
            >
              {formatMoney(player.salary)}
            </td>
            {showStats
              ? goalie
                ? [
                    "GP",
                    "W",
                    "GA",
                    "GAA",
                    "SV",
                    "SA",
                    "SVP",
                    "SO",
                    "QS",
                    "RBS",
                  ].map((key) => (
                    <td
                      key={key}
                      className={`whitespace-nowrap text-[9px] sm:px-2 sm:py-3 sm:text-xs ${mobileCellPadding}`}
                    >
                      {formatUfaStat(stats, key as keyof typeof stats)}
                    </td>
                  ))
                : [
                    "GP",
                    "G",
                    "A",
                    "P",
                    "PM",
                    "PIM",
                    "PPP",
                    "SOG",
                    "HIT",
                    "BLK",
                  ].map((key) => (
                    <td
                      key={key}
                      className={`whitespace-nowrap text-[9px] sm:px-2 sm:py-3 sm:text-xs ${mobileCellPadding}`}
                    >
                      {formatUfaStat(stats, key as keyof typeof stats)}
                    </td>
                  ))
              : null}
            <td className={`sm:px-2 sm:py-3 ${mobileCellPadding}`}>
              <UfaOfferForm player={player} />
            </td>
          </tr>
        );
      })}
    </tbody>
  );
}

function PlayerTable({
  players,
  showStats = false,
}: {
  players: UfaFreeAgentView[];
  showStats?: boolean;
}) {
  const hasGoalies = players.some((player) => player.positionGroup === "G");
  const hasSkaters = players.some((player) => player.positionGroup !== "G");
  const mixed = showStats && hasGoalies && hasSkaters;
  if (mixed) {
    return (
      <div className="w-full min-w-0 max-w-full space-y-6 overflow-hidden">
        <div className="space-y-6">
          <PlayerTable
            players={players.filter((player) => player.positionGroup !== "G")}
            showStats
          />
          <PlayerTable
            players={players.filter((player) => player.positionGroup === "G")}
            showStats
          />
        </div>
      </div>
    );
  }
  const statHeaders = hasGoalies
    ? ["GP", "W", "GA", "GAA", "SV", "SA", "SV%", "SO", "QS", "RBS"]
    : ["GP", "G", "A", "P", "+/−", "PIM", "PPP", "SOG", "HIT", "BLK"];
  const mobileCellPadding = showStats ? "px-1 py-1" : "px-0.5 py-0.5";
  return (
    <TableViewport
      ariaLabel={`Available unrestricted free-agent ${hasGoalies ? "goalies" : "skaters"}`}
      scrollHint="Scroll to compare all salaries and statistics"
    >
      <table className="w-max min-w-full text-center text-[10px] sm:text-sm">
        <caption className="sr-only">
          Available unrestricted free-agent {hasGoalies ? "goalies" : "skaters"}
          , salaries, previous-season statistics, and binding-offer action
        </caption>
        <thead className="bg-muted/70 text-[8px] uppercase tracking-wide sm:text-xs">
          <tr className="border-b border-border/70">
            <th
              scope="col"
              className={`sticky left-0 z-30 border-r bg-muted text-left sm:static sm:z-auto sm:w-auto sm:min-w-[10rem] sm:max-w-none sm:border-0 sm:px-2 sm:py-3 ${showStats ? "w-28 min-w-28 max-w-28 px-1.5 py-1" : "w-24 min-w-24 max-w-24 px-1 py-0.5"}`}
            >
              Player
            </th>
            <th
              scope="col"
              className={`whitespace-nowrap sm:px-2 sm:py-3 ${mobileCellPadding}`}
            >
              Pos
            </th>
            <th
              scope="col"
              className={`whitespace-nowrap bg-muted/40 font-bold text-foreground sm:px-2 sm:py-3 ${mobileCellPadding}`}
            >
              UFA Salary
            </th>
            {showStats
              ? statHeaders.map((header) => (
                  <th
                    key={header}
                    scope="col"
                    className={`whitespace-nowrap sm:px-2 sm:py-3 ${mobileCellPadding}`}
                  >
                    {header}
                  </th>
                ))
              : null}
            <th
              scope="col"
              className={`whitespace-nowrap sm:px-2 sm:py-3 ${mobileCellPadding}`}
            >
              Offer
            </th>
          </tr>
        </thead>
        <PlayerRows players={players} showStats={showStats} />
      </table>
    </TableViewport>
  );
}

function ActiveOffers({ groups }: { groups: UfaOfferGroupView[] }) {
  return (
    <section
      className="w-full min-w-0 max-w-full space-y-2 overflow-hidden sm:space-y-3"
      aria-labelledby="ufa-active-offers"
    >
      <h3 id="ufa-active-offers" className="text-base font-bold sm:text-lg">
        UFA Contract Offers
      </h3>
      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed p-2 text-xs text-muted-foreground sm:p-4 sm:text-sm">
          No UFA offers are currently pending.
        </p>
      ) : (
        <TableViewport
          ariaLabel="Pending unrestricted free-agent offers"
          scrollHint="Scroll to compare every pending offer"
        >
          <table className="w-max min-w-[640px] text-center text-[10px] sm:min-w-full sm:text-sm">
            <caption className="sr-only">
              Pending unrestricted free-agent offers by player and franchise
            </caption>
            <thead className="bg-muted/70 text-[8px] uppercase sm:text-xs">
              <tr className="border-b border-border/70">
                <th
                  scope="col"
                  className="sticky left-0 z-30 w-28 min-w-28 max-w-28 border-r bg-muted px-1.5 py-1 text-left sm:static sm:z-auto sm:w-auto sm:min-w-[10rem] sm:max-w-none sm:border-0 sm:px-3 sm:py-3"
                >
                  Player
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3"
                >
                  Pos
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3"
                >
                  Salary
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3"
                >
                  GSHL Team
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3"
                >
                  Years
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3"
                >
                  Odds
                </th>
                <th
                  scope="col"
                  className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3"
                >
                  Time Left
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((group) =>
                group.offers.map((offer) => (
                  <tr
                    key={offer.id}
                    className="group border-b border-border odd:bg-background even:bg-muted/35 hover:bg-muted/60"
                  >
                    <th
                      scope="row"
                      className="sticky left-0 z-20 w-28 min-w-28 max-w-28 border-r bg-inherit px-1.5 py-1 text-left text-[10px] font-semibold group-hover:bg-muted sm:static sm:z-auto sm:w-auto sm:min-w-[10rem] sm:max-w-none sm:border-0 sm:px-3 sm:py-3 sm:text-sm"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <NHLLogo
                          team={
                            group.player?.nhlTeamLogoUrl
                              ? {
                                  name: group.player.nhlTeam || "NHL team",
                                  logoUrl: group.player.nhlTeamLogoUrl,
                                }
                              : undefined
                          }
                          size={16}
                          className="mx-0 shrink-0"
                        />
                        <span
                          className="truncate"
                          title={group.player?.fullName ?? "Unavailable player"}
                        >
                          {group.player?.fullName ?? "Unavailable player"}
                        </span>
                      </div>
                    </th>
                    <td className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                      {group.player?.positions.join("/") ?? "—"}
                    </td>
                    <td className="whitespace-nowrap bg-muted/25 px-1 py-1 font-bold tabular-nums text-foreground sm:px-3 sm:py-3">
                      {formatMoney(offer.salary)}
                    </td>
                    <td className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                      <div className="flex items-center justify-center gap-2">
                        <GshlTeamLogo
                          src={offer.franchiseLogoUrl}
                          alt={offer.franchiseName}
                        />
                        <span
                          className="max-w-28 truncate"
                          title={offer.franchiseName}
                        >
                          {offer.franchiseName}
                        </span>
                      </div>
                    </td>
                    <td className="px-1 py-1 sm:px-3 sm:py-3">{offer.years}</td>
                    <td className="px-1 py-1 font-bold sm:px-3 sm:py-3">
                      {Math.round(offer.probability * 1000) / 10}%
                    </td>
                    <td className="px-1 py-1 sm:px-3 sm:py-3">
                      <Countdown deadlineAt={group.deadlineAt} />
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </TableViewport>
      )}
    </section>
  );
}

function HomeActiveOffers({ groups }: { groups: UfaOfferGroupView[] }) {
  if (groups.length === 0) return null;

  return (
    <section aria-labelledby="home-ufa-offers">
      <h3 id="home-ufa-offers" className="mb-1.5 text-sm font-bold">
        Pending offers
      </h3>
      <div
        aria-hidden="true"
        className="hidden grid-cols-[minmax(13rem,1.35fr)_minmax(10rem,1fr)_minmax(8rem,auto)_5rem_9rem] items-center gap-4 border-t border-slate-200 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground md:grid"
      >
        <span>Player</span>
        <span>Offer from</span>
        <span>Contract</span>
        <span>Odds</span>
        <span className="text-right">Time left</span>
      </div>
      <ul className="divide-y divide-slate-200 border-y border-slate-200">
        {groups.flatMap((group) =>
          group.offers.map((offer) => (
            <li
              key={offer.id}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 px-2 py-2.5 md:grid-cols-[minmax(13rem,1.35fr)_minmax(10rem,1fr)_minmax(8rem,auto)_5rem_9rem] md:gap-4 md:py-2"
            >
              <div className="col-span-2 min-w-0 md:col-span-1 md:col-start-1 md:row-start-1">
                <div className="flex min-w-0 items-center gap-1.5">
                  <NHLLogo
                    team={
                      group.player?.nhlTeamLogoUrl
                        ? {
                            name: group.player.nhlTeam || "NHL team",
                            logoUrl: group.player.nhlTeamLogoUrl,
                          }
                        : undefined
                    }
                    size={16}
                    className="mx-0 shrink-0"
                  />
                  <p className="min-w-0 truncate text-sm font-semibold">
                    {group.player?.fullName ?? "Unavailable player"}
                  </p>
                </div>
                <p className="mt-0.5 truncate pl-[22px] text-xs text-muted-foreground">
                  {group.player?.positions.length
                    ? group.player.positions.join("/")
                    : "Position unavailable"}
                </p>
              </div>
              <div className="col-start-1 row-start-2 flex min-w-0 items-center gap-2 md:col-start-2 md:row-start-1">
                <GshlTeamLogo
                  src={offer.franchiseLogoUrl}
                  alt={offer.franchiseName}
                />
                <span className="truncate text-xs font-medium sm:text-sm">
                  {offer.franchiseName}
                </span>
              </div>
              <p className="col-start-2 row-start-2 whitespace-nowrap text-xs tabular-nums md:col-start-3 md:row-start-1 md:text-sm">
                <span className="sr-only">Contract: </span>
                {offer.years}y · {formatMoney(offer.salary)}
              </p>
              <p className="col-start-3 row-start-2 whitespace-nowrap text-right text-xs font-semibold tabular-nums md:col-start-4 md:row-start-1 md:text-left md:text-sm">
                <span className="sr-only">Signing odds: </span>
                {Math.round(offer.probability * 1000) / 10}%
              </p>
              <div className="col-start-3 row-start-1 text-right md:col-start-5 md:row-start-1">
                <Countdown deadlineAt={group.deadlineAt} />
              </div>
            </li>
          )),
        )}
      </ul>
    </section>
  );
}

function HomeFreeAgents({ players }: { players: UfaFreeAgentView[] }) {
  return (
    <ul
      aria-label="Top unrestricted free agents"
      className="divide-y divide-slate-200 border-y border-slate-200"
    >
      {players.map((player) => (
        <li
          key={player.id}
          className="grid grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-1.5 py-2"
        >
          <NHLLogo
            team={
              player.nhlTeamLogoUrl
                ? {
                    name: player.nhlTeam || "NHL team",
                    logoUrl: player.nhlTeamLogoUrl,
                  }
                : undefined
            }
            size={16}
            className="mx-0 shrink-0"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{player.fullName}</p>
            <p className="text-xs text-muted-foreground">
              {player.positions.join("/") || "—"}
            </p>
          </div>
          <p className="font-mono text-sm font-semibold tabular-nums">
            {formatMoney(player.salary)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function UfaHomeCard() {
  const query = useUfaOverview("home");
  if (query.isLoading) return <UfaHomeCardSkeleton />;
  if (query.error || !query.data)
    return (
      <section className="mx-auto w-full max-w-5xl rounded-xl border border-destructive/40 p-3 text-xs text-destructive sm:p-5 sm:text-sm">
        UFA information could not be loaded: {query.error?.message}
      </section>
    );
  if (!query.data.window.isOpen && query.data.offerGroups.length === 0)
    return null;
  const previewFreeAgents = selectHomeUfaPreview(query.data.topFreeAgents);
  const showOwnerFreeAgentTable =
    query.data.viewer.isSignedInOwner && previewFreeAgents.length > 0;
  return (
    <section
      aria-labelledby="home-ufa-heading"
      className="w-full min-w-0 max-w-full space-y-3 sm:space-y-4"
    >
      <div className="mx-auto w-full max-w-5xl space-y-3 overflow-hidden border-y border-slate-300 py-3 sm:py-4">
        <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary sm:tracking-[0.2em]">
              Free agency
            </p>
            <h2
              id="home-ufa-heading"
              className="text-lg font-black leading-tight sm:text-2xl"
            >
              Top {HOME_UFA_PREVIEW_LIMIT} UFAs
            </h2>
            <p className="mt-0.5 text-xs leading-4 text-muted-foreground sm:mt-1 sm:text-sm">
              Salaries include the 125% premium.
            </p>
          </div>
          <Link
            href="/leagueoffice?view=freeAgents"
            className="inline-flex min-h-11 items-center rounded-md border px-3 py-2 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:text-sm"
          >
            View all
          </Link>
        </div>
        <HomeActiveOffers groups={query.data.offerGroups} />
        {query.data.window.isOpen ? (
          previewFreeAgents.length > 0 ? (
            showOwnerFreeAgentTable ? null : (
              <HomeFreeAgents players={previewFreeAgents} />
            )
          ) : (
            <p className="rounded-md border border-dashed p-2 text-xs text-muted-foreground sm:p-4 sm:text-sm">
              {query.data.viewer.isSignedInOwner
                ? "No available UFAs currently fit within your franchise's cap space."
                : "No UFAs are currently available."}
            </p>
          )
        ) : (
          <p className="rounded-md bg-muted p-2 text-xs sm:p-3 sm:text-sm">
            {query.data.window.reason}
          </p>
        )}
      </div>
      {showOwnerFreeAgentTable ? (
        <PlayerTable players={previewFreeAgents} showStats />
      ) : null}
    </section>
  );
}

export function UfaLeagueOffice() {
  const [filter, setFilter] = useState("ALL");
  const [visibleCount, setVisibleCount] = useState(50);
  const query = useUfaOverview();
  const players = useMemo(
    () =>
      query.data?.freeAgents.filter(
        (player) =>
          filter === "ALL" ||
          (filter === "F"
            ? player.positionGroup === "F"
            : filter === "D" || filter === "G"
              ? player.positionGroup === filter
              : player.positions.some(
                  (position) => position.toUpperCase() === filter,
                )),
      ) ?? [],
    [filter, query.data?.freeAgents],
  );
  const visiblePlayers = players.slice(0, visibleCount);
  if (query.isLoading) return <FreeAgencySkeleton />;
  if (query.error || !query.data)
    return (
      <p className="text-destructive">
        Unable to load free agents: {query.error?.message}
      </p>
    );
  return (
    <div className="w-full min-w-0 max-w-full space-y-4 overflow-hidden sm:space-y-6">
      <div>
        <h2 className="text-2xl font-black sm:text-3xl">Free Agents</h2>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Available UFAs with their previous NHL season statistics and fixed
          125% salary. Linked owners see players their franchise can afford.
        </p>
      </div>
      <div
        className="flex flex-wrap gap-1.5 sm:gap-2"
        aria-label="Filter free agents by position"
        role="group"
      >
        {["ALL", "F", "LW", "RW", "C", "D", "G"].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setFilter(value);
              setVisibleCount(50);
            }}
            aria-pressed={filter === value}
            className={`min-h-11 min-w-11 rounded-full border px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${filter === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"} sm:px-4 sm:text-sm`}
          >
            {value === "ALL" ? "All" : value}
          </button>
        ))}
      </div>
      {!query.data.window.isOpen ? (
        <p className="rounded-md bg-muted p-2 text-xs sm:p-3 sm:text-sm">
          {query.data.window.reason}
        </p>
      ) : null}
      <ActiveOffers groups={query.data.offerGroups} />
      {visiblePlayers.length > 0 ? (
        <PlayerTable players={visiblePlayers} showStats />
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No available free agents match the{" "}
          {filter === "ALL" ? "current" : filter} filter.
        </p>
      )}
      {visibleCount < players.length ? (
        <div className="flex justify-center">
          <button
            type="button"
            className="min-h-11 rounded-md border bg-white px-5 py-2 text-sm font-semibold shadow-sm"
            onClick={() => setVisibleCount((count) => count + 50)}
          >
            Load more free agents
          </button>
        </div>
      ) : null}
    </div>
  );
}
