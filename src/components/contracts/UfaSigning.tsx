"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { useSubmitUfaOffer, useUfaOverview } from "@gshl-hooks";
import { formatMoney } from "@gshl-utils";
import type { UfaFreeAgentView, UfaOfferGroupView } from "@gshl-types";

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
  return (
    <span className="whitespace-nowrap font-mono text-xs font-semibold">
      {seconds === 0
        ? "Resolving…"
        : `${days}d ${String(hours).padStart(2, "0")}h ${String(minutes).padStart(2, "0")}m ${String(remainder).padStart(2, "0")}s`}
    </span>
  );
}

function OfferControls({ player }: { player: UfaFreeAgentView }) {
  const [years, setYears] = useState<number>(player.affordableTerms[0] ?? 1);
  const [message, setMessage] = useState<string | null>(null);
  const mutation = useSubmitUfaOffer({
    onSuccess: () => {
      setMessage("Binding offer submitted.");
    },
    onError: setMessage,
  });
  const selectedAffordable = player.affordableTerms.includes(
    years as 1 | 2 | 3,
  );
  const helperText =
    message ??
    player.disabledReason ??
    (player.existingOffer
      ? "Binding offer submitted."
      : "Salary is reserved while pending.");
  return (
    <div
      className="flex min-w-[130px] items-center gap-1 sm:min-w-[180px] sm:flex-col sm:items-stretch sm:gap-1"
      title={helperText}
    >
      <div className="flex min-w-0 flex-1 gap-1 sm:flex-none sm:gap-2">
        <select
          aria-label={`Contract years for ${player.fullName}`}
          value={years}
          disabled={!player.canOffer || mutation.isPending}
          onChange={(event) => setYears(Number(event.target.value))}
          className="h-6 min-w-0 flex-1 rounded-md border bg-background px-1 text-[9px] leading-none disabled:opacity-50 sm:h-9 sm:flex-none sm:px-2 sm:text-sm"
        >
          {[1, 2, 3].map((term) => (
            <option
              key={term}
              value={term}
              disabled={!player.affordableTerms.includes(term as 1 | 2 | 3)}
            >
              {term} year{term === 1 ? "" : "s"}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={
            !player.canOffer || !selectedAffordable || mutation.isPending
          }
          title={player.disabledReason ?? undefined}
          onClick={() => {
            setMessage(null);
            mutation.mutate({
              playerId: player.id,
              contractLength: years as 1 | 2 | 3,
            });
          }}
          className="h-6 shrink-0 rounded-md bg-primary px-1.5 py-0.5 text-[9px] font-semibold leading-none text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40 sm:h-auto sm:px-3 sm:py-2 sm:text-xs"
        >
          {mutation.isPending ? "Offering…" : "Offer Contract"}
        </button>
      </div>
      <span
        aria-live="polite"
        className={`sr-only max-w-[220px] text-[9px] leading-tight sm:not-sr-only sm:max-w-[260px] sm:text-[10px] ${message?.includes("submitted") ? "text-emerald-600" : "text-muted-foreground"}`}
      >
        {helperText}
      </span>
    </div>
  );
}

function PlayerRows({
  players,
  showStats,
}: {
  players: UfaFreeAgentView[];
  showStats: boolean;
}) {
  return (
    <tbody>
      {players.map((player) => {
        const goalie = player.positionGroup === "G";
        const stats = player.stats;
        return (
          <tr key={player.id} className="group border-t align-middle">
            <td className="sticky left-0 z-20 w-8 min-w-8 border-r bg-background px-0.5 py-1 group-hover:bg-muted sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:border-0 sm:bg-transparent sm:px-2 sm:py-3">
              <NHLLogo
                team={
                  player.nhlTeamLogoUrl
                    ? {
                        name: player.nhlTeam || "NHL team",
                        logoUrl: player.nhlTeamLogoUrl,
                      }
                    : undefined
                }
                size={24}
              />
            </td>
            <td className="sticky left-8 z-20 min-w-[7rem] border-r bg-background px-1.5 py-1 text-left text-[10px] font-semibold group-hover:bg-muted sm:static sm:z-auto sm:min-w-0 sm:border-0 sm:bg-transparent sm:px-2 sm:py-3 sm:text-sm">
              {player.fullName}
            </td>
            <td className="whitespace-nowrap px-1 py-1 text-[9px] sm:px-2 sm:py-3 sm:text-sm">
              {player.positions.join("/") || player.positionGroup}
            </td>
            <td className="whitespace-nowrap px-1 py-1 text-[9px] font-medium sm:px-2 sm:py-3 sm:text-sm">
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
                      className="whitespace-nowrap px-1 py-1 text-[9px] sm:px-2 sm:py-3 sm:text-xs"
                    >
                      {stats?.[key as keyof typeof stats] ?? "—"}
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
                      className="whitespace-nowrap px-1 py-1 text-[9px] sm:px-2 sm:py-3 sm:text-xs"
                    >
                      {stats?.[key as keyof typeof stats] ?? "—"}
                    </td>
                  ))
              : null}
            <td className="px-1 py-1 sm:px-2 sm:py-3">
              <OfferControls player={player} />
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
    );
  }
  const statHeaders = hasGoalies
    ? ["GP", "W", "GA", "GAA", "SV", "SA", "SV%", "SO", "QS", "RBS"]
    : ["GP", "G", "A", "P", "+/−", "PIM", "PPP", "SOG", "HIT", "BLK"];
  return (
    <div className="overflow-x-auto overscroll-x-contain rounded-lg border">
      <table className="w-full min-w-[780px] text-center text-[10px] sm:min-w-0 sm:text-sm">
        <thead className="bg-muted/70 text-[8px] uppercase tracking-wide sm:text-xs">
          <tr>
            <th className="sticky left-0 z-30 w-8 min-w-8 border-r bg-muted/70 px-0.5 py-1 sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:border-0 sm:bg-transparent sm:px-2 sm:py-3">
              NHL
            </th>
            <th className="sticky left-8 z-30 min-w-[7rem] border-r bg-muted/70 px-1.5 py-1 text-left sm:static sm:z-auto sm:min-w-0 sm:border-0 sm:bg-transparent sm:px-2 sm:py-3">
              Player
            </th>
            <th className="whitespace-nowrap px-1 py-1 sm:px-2 sm:py-3">Pos</th>
            <th className="whitespace-nowrap px-1 py-1 sm:px-2 sm:py-3">
              UFA Salary
            </th>
            {showStats
              ? statHeaders.map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap px-1 py-1 sm:px-2 sm:py-3"
                  >
                    {header}
                  </th>
                ))
              : null}
            <th className="whitespace-nowrap px-1 py-1 sm:px-2 sm:py-3">
              Offer
            </th>
          </tr>
        </thead>
        <PlayerRows players={players} showStats={showStats} />
      </table>
    </div>
  );
}

function ActiveOffers({ groups }: { groups: UfaOfferGroupView[] }) {
  return (
    <section
      className="space-y-2 sm:space-y-3"
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
        <div className="overflow-x-auto overscroll-x-contain rounded-lg border">
          <table className="w-full min-w-[720px] text-center text-[10px] sm:min-w-0 sm:text-sm">
            <thead className="bg-muted/70 text-[8px] uppercase sm:text-xs">
              <tr>
                <th className="sticky left-0 z-30 w-8 min-w-8 border-r bg-muted/70 px-0.5 py-1 sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:border-0 sm:bg-transparent sm:px-3 sm:py-3">
                  NHL
                </th>
                <th className="sticky left-8 z-30 min-w-[7rem] border-r bg-muted/70 px-1.5 py-1 text-left sm:static sm:z-auto sm:min-w-0 sm:border-0 sm:bg-transparent sm:px-3 sm:py-3">
                  Player
                </th>
                <th className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                  Pos
                </th>
                <th className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                  Salary
                </th>
                <th className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                  GSHL Team
                </th>
                <th className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                  Years
                </th>
                <th className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                  Odds
                </th>
                <th className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                  Time Left
                </th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((group) =>
                group.offers.map((offer) => (
                  <tr key={offer.id} className="group border-t">
                    <td className="sticky left-0 z-20 w-8 min-w-8 border-r bg-background px-0.5 py-1 group-hover:bg-muted sm:static sm:z-auto sm:w-auto sm:min-w-0 sm:border-0 sm:bg-transparent sm:px-3 sm:py-3">
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
                    <td className="sticky left-8 z-20 min-w-[7rem] border-r bg-background px-1.5 py-1 text-left text-[10px] font-semibold group-hover:bg-muted sm:static sm:z-auto sm:min-w-0 sm:border-0 sm:bg-transparent sm:px-3 sm:py-3 sm:text-sm">
                      {group.player?.fullName ?? "Unavailable player"}
                    </td>
                    <td className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
                      {group.player?.positions.join("/") ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-1 py-1 sm:px-3 sm:py-3">
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
        </div>
      )}
    </section>
  );
}

export function UfaHomeCard() {
  const query = useUfaOverview();
  if (query.isLoading)
    return (
      <section className="h-56 animate-pulse rounded-xl border bg-muted/40" />
    );
  if (query.error || !query.data)
    return (
      <section className="rounded-xl border border-destructive/40 p-3 text-xs text-destructive sm:p-5 sm:text-sm">
        UFA information could not be loaded: {query.error?.message}
      </section>
    );
  if (!query.data.window.isOpen && query.data.offerGroups.length === 0)
    return null;
  return (
    <section className="space-y-3 rounded-xl border bg-card p-2 shadow-sm sm:space-y-6 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary sm:text-xs sm:tracking-[0.2em]">
            Summer Free Agency
          </p>
          <h2 className="text-lg font-black leading-tight sm:text-2xl">
            Top 15 Unrestricted Free Agents
          </h2>
          <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground sm:mt-1 sm:text-sm">
            UFA salaries include the required 125% premium. Offers are binding.
          </p>
        </div>
        <Link
          href="/leagueoffice?view=freeAgents"
          className="rounded-md border px-2 py-1 text-[10px] font-semibold hover:bg-muted sm:px-4 sm:py-2 sm:text-sm"
        >
          View all free agents
        </Link>
      </div>
      {query.data.window.isOpen ? (
        query.data.topFreeAgents.length > 0 ? (
          <PlayerTable players={query.data.topFreeAgents} />
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
      <ActiveOffers groups={query.data.offerGroups} />
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
  if (query.isLoading)
    return <div className="h-80 animate-pulse rounded-xl bg-muted/40" />;
  if (query.error || !query.data)
    return (
      <p className="text-destructive">
        Unable to load free agents: {query.error?.message}
      </p>
    );
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className="text-2xl font-black sm:text-3xl">Free Agents</h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          All eligible UFAs with their previous NHL season statistics and fixed
          125% salary.
        </p>
      </div>
      <div
        className="flex flex-wrap gap-1.5 sm:gap-2"
        aria-label="Filter free agents by position"
      >
        {["ALL", "F", "LW", "RW", "C", "D", "G"].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setFilter(value);
              setVisibleCount(50);
            }}
            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${filter === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"} sm:px-4 sm:py-2 sm:text-sm`}
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
      <PlayerTable players={visiblePlayers} showStats />
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
      <ActiveOffers groups={query.data.offerGroups} />
    </div>
  );
}
