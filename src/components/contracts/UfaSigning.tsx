"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { useDesktopViewport, useUfaOverview } from "@gshl-hooks";
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
import { UfaPlayerDecisionList } from "./UfaPlayerDecisionList";

function Logo({ src, alt }: { src: string | null; alt: string }) {
  return src ? (
    <Image
      src={src}
      alt={alt}
      width={32}
      height={32}
      className="mx-auto h-8 w-8 object-contain"
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
            className="group border-t border-border/70 align-middle"
          >
            <td
              className={`sticky left-0 z-20 border-r !bg-background group-hover:!bg-muted sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-2 sm:py-3 ${showStats ? "w-8 min-w-8 px-0.5 py-1" : "w-6 min-w-6 px-0 py-0.5"}`}
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
                size={showStats ? 24 : 20}
              />
            </td>
            <th
              scope="row"
              className={`sticky z-20 border-r !bg-background text-left text-[10px] font-semibold group-hover:!bg-muted sm:static sm:z-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-2 sm:py-3 sm:text-sm ${showStats ? "left-[31px] min-w-[7rem] px-1.5 py-1" : "left-[23px] min-w-[5.5rem] px-1 py-0.5"}`}
            >
              {player.fullName}
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
  desktopOnly = false,
}: {
  players: UfaFreeAgentView[];
  showStats?: boolean;
  desktopOnly?: boolean;
}) {
  const isDesktopViewport = useDesktopViewport();
  const hasGoalies = players.some((player) => player.positionGroup === "G");
  const hasSkaters = players.some((player) => player.positionGroup !== "G");
  const mixed = showStats && hasGoalies && hasSkaters;
  if (mixed) {
    if (!isDesktopViewport && !desktopOnly) {
      return <UfaPlayerDecisionList players={players} />;
    }
    return (
      <div className="w-full min-w-0 max-w-full space-y-6 overflow-hidden">
        <div className="space-y-6">
          <PlayerTable
            players={players.filter((player) => player.positionGroup !== "G")}
            showStats
            desktopOnly
          />
          <PlayerTable
            players={players.filter((player) => player.positionGroup === "G")}
            showStats
            desktopOnly
          />
        </div>
      </div>
    );
  }
  const statHeaders = hasGoalies
    ? ["GP", "W", "GA", "GAA", "SV", "SA", "SV%", "SO", "QS", "RBS"]
    : ["GP", "G", "A", "P", "+/−", "PIM", "PPP", "SOG", "HIT", "BLK"];
  const mobileCellPadding = showStats ? "px-1 py-1" : "px-0.5 py-0.5";
  if (!isDesktopViewport && !desktopOnly) {
    return <UfaPlayerDecisionList players={players} />;
  }
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
              className={`sticky z-30 border-r !bg-muted sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-2 sm:py-3 ${showStats ? "left-0 w-8 min-w-8 px-0.5 py-1" : "left-0 w-6 min-w-6 px-0 py-0.5"}`}
            >
              NHL
            </th>
            <th
              scope="col"
              className={`sticky z-30 border-r !bg-muted text-left sm:static sm:z-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-2 sm:py-3 ${showStats ? "left-[31px] min-w-[7rem] px-1.5 py-1" : "left-[23px] min-w-[5.5rem] px-1 py-0.5"}`}
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

function ActiveOfferCards({ groups }: { groups: UfaOfferGroupView[] }) {
  return (
    <div className="space-y-3 lg:hidden">
      {groups.map((group) => {
        const headingId = `ufa-offer-group-${group.id}`;
        return (
          <article
            key={group.id}
            aria-labelledby={headingId}
            className="rounded-xl border bg-card p-3 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-muted/60">
                <NHLLogo
                  team={
                    group.player?.nhlTeamLogoUrl
                      ? {
                          name: group.player.nhlTeam || "NHL team",
                          logoUrl: group.player.nhlTeamLogoUrl,
                        }
                      : undefined
                  }
                  size={32}
                />
              </div>
              <div className="min-w-0 flex-1">
                <h4 id={headingId} className="break-words text-sm font-bold">
                  {group.player?.fullName ?? "Unavailable player"}
                </h4>
                <p className="mt-1 text-xs text-muted-foreground">
                  {group.player?.positions.length
                    ? group.player.positions.join("/")
                    : "Position unavailable"}
                </p>
              </div>
              <Countdown deadlineAt={group.deadlineAt} />
            </div>

            <ul className="mt-3 space-y-2" aria-label="Pending offers">
              {group.offers.map((offer) => (
                <li
                  key={offer.id}
                  className="rounded-lg border border-slate-200 bg-background p-3"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <Logo
                      src={offer.franchiseLogoUrl}
                      alt={offer.franchiseName}
                    />
                    <p className="min-w-0 flex-1 break-words text-sm font-semibold">
                      {offer.franchiseName}
                    </p>
                  </div>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Salary
                      </dt>
                      <dd className="mt-0.5 text-sm font-bold tabular-nums">
                        {formatMoney(offer.salary)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Term
                      </dt>
                      <dd className="mt-0.5 text-sm font-bold">
                        {offer.years} year{offer.years === 1 ? "" : "s"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        Odds
                      </dt>
                      <dd className="mt-0.5 text-sm font-bold tabular-nums">
                        {Math.round(offer.probability * 1000) / 10}%
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          </article>
        );
      })}
    </div>
  );
}

function ActiveOffers({ groups }: { groups: UfaOfferGroupView[] }) {
  const isDesktopViewport = useDesktopViewport();
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
      ) : isDesktopViewport ? (
        <TableViewport
          ariaLabel="Pending unrestricted free-agent offers"
          scrollHint="Scroll to compare every pending offer"
        >
          <table className="w-max min-w-[720px] text-center text-[10px] sm:min-w-full sm:text-sm">
            <caption className="sr-only">
              Pending unrestricted free-agent offers by player and franchise
            </caption>
            <thead className="bg-muted/70 text-[8px] uppercase sm:text-xs">
              <tr className="border-b border-border/70">
                <th
                  scope="col"
                  className="sticky left-0 z-30 w-8 min-w-8 border-r !bg-muted px-0.5 py-1 sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-3 sm:py-3"
                >
                  NHL
                </th>
                <th
                  scope="col"
                  className="sticky left-[31px] z-30 min-w-[7rem] border-r !bg-muted px-1.5 py-1 text-left sm:static sm:z-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-3 sm:py-3"
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
                    className="group border-t border-border/70"
                  >
                    <td className="sticky left-0 z-20 w-8 min-w-8 border-r !bg-background px-0.5 py-1 group-hover:!bg-muted sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-3 sm:py-3">
                      <NHLLogo
                        team={
                          group.player?.nhlTeamLogoUrl
                            ? {
                                name: group.player.nhlTeam || "NHL team",
                                logoUrl: group.player.nhlTeamLogoUrl,
                              }
                            : undefined
                        }
                        size={24}
                      />
                    </td>
                    <th
                      scope="row"
                      className="sticky left-[31px] z-20 min-w-[7rem] border-r !bg-background px-1.5 py-1 text-left text-[10px] font-semibold group-hover:!bg-muted sm:static sm:z-auto sm:min-w-0 sm:border-0 sm:!bg-transparent sm:px-3 sm:py-3 sm:text-sm"
                    >
                      {group.player?.fullName ?? "Unavailable player"}
                    </th>
                    <td className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                      {group.player?.positions.join("/") ?? "—"}
                    </td>
                    <td className="whitespace-nowrap bg-muted/25 px-1 py-1 font-bold tabular-nums text-foreground sm:px-3 sm:py-3">
                      {formatMoney(offer.salary)}
                    </td>
                    <td className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                      <div className="flex items-center justify-center gap-2">
                        <Logo
                          src={offer.franchiseLogoUrl}
                          alt={offer.franchiseName}
                        />
                        <span className="whitespace-nowrap">
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
      ) : (
        <ActiveOfferCards groups={groups} />
      )}
    </section>
  );
}

export function UfaHomeCard() {
  const query = useUfaOverview();
  if (query.isLoading) return <UfaHomeCardSkeleton />;
  if (query.error || !query.data)
    return (
      <section className="rounded-xl border border-destructive/40 p-3 text-xs text-destructive sm:p-5 sm:text-sm">
        UFA information could not be loaded: {query.error?.message}
      </section>
    );
  if (!query.data.window.isOpen && query.data.offerGroups.length === 0)
    return null;
  const previewFreeAgents = selectHomeUfaPreview(query.data.topFreeAgents);
  return (
    <section
      aria-labelledby="home-ufa-heading"
      className="w-full min-w-0 max-w-full space-y-3 overflow-hidden rounded-xl border bg-card p-2 shadow-sm sm:space-y-6 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary sm:tracking-[0.2em]">
            Summer Free Agency
          </p>
          <h2
            id="home-ufa-heading"
            className="text-lg font-black leading-tight sm:text-2xl"
          >
            Top {HOME_UFA_PREVIEW_LIMIT} Unrestricted Free Agents
          </h2>
          <p className="mt-0.5 text-xs leading-4 text-muted-foreground sm:mt-1 sm:text-sm">
            UFA salaries include the required 125% premium. Offers are binding.
          </p>
        </div>
        <Link
          href="/leagueoffice?view=freeAgents"
          className="inline-flex min-h-11 items-center rounded-md border px-3 py-2 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:px-4 sm:text-sm"
        >
          View all free agents
        </Link>
      </div>
      <ActiveOffers groups={query.data.offerGroups} />
      {query.data.window.isOpen ? (
        previewFreeAgents.length > 0 ? (
          <PlayerTable players={previewFreeAgents} showStats />
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
