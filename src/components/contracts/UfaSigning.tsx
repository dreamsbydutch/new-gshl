"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
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
  return (
    <div className="flex min-w-[180px] flex-col items-stretch gap-1">
      <div className="flex gap-2">
        <select
          aria-label={`Contract years for ${player.fullName}`}
          value={years}
          disabled={!player.canOffer || mutation.isPending}
          onChange={(event) => setYears(Number(event.target.value))}
          className="h-9 rounded-md border bg-background px-2 text-sm disabled:opacity-50"
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
          className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-40"
        >
          {mutation.isPending ? "Offering…" : "Offer Contract"}
        </button>
      </div>
      <span
        className={`max-w-[260px] text-[10px] ${message?.includes("submitted") ? "text-emerald-600" : "text-muted-foreground"}`}
      >
        {message ??
          player.disabledReason ??
          (player.existingOffer
            ? "Binding offer submitted."
            : "Salary is reserved while pending.")}
      </span>
    </div>
  );
}

function PlayerRows({
  players,
  showStats,
  dimUnaffordable,
}: {
  players: UfaFreeAgentView[];
  showStats: boolean;
  dimUnaffordable: boolean;
}) {
  return (
    <tbody>
      {players.map((player) => {
        const goalie = player.positionGroup === "G";
        const stats = player.stats;
        const unaffordable =
          dimUnaffordable && player.affordableTerms.length === 0;
        return (
          <tr
            key={player.id}
            className={`border-t align-middle ${unaffordable ? "bg-muted/30 opacity-50 grayscale" : ""}`}
            title={
              unaffordable
                ? "This player is currently unaffordable under your franchise's cap."
                : undefined
            }
          >
            <td className="px-2 py-3">
              <Logo src={player.nhlTeamLogoUrl} alt={String(player.nhlTeam)} />
            </td>
            <td className="whitespace-nowrap px-2 py-3 text-left font-semibold">
              {player.fullName}
            </td>
            <td className="whitespace-nowrap px-2 py-3">
              {player.positions.join("/") || player.positionGroup}
            </td>
            <td className="whitespace-nowrap px-2 py-3 font-medium">
              {formatMoney(player.salary)}
              {unaffordable ? (
                <span className="block text-[10px] font-semibold uppercase tracking-wide">
                  Over cap
                </span>
              ) : null}
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
                    <td key={key} className="px-2 py-3 text-xs">
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
                    <td key={key} className="px-2 py-3 text-xs">
                      {stats?.[key as keyof typeof stats] ?? "—"}
                    </td>
                  ))
              : null}
            <td className="px-2 py-3">
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
  dimUnaffordable = false,
}: {
  players: UfaFreeAgentView[];
  showStats?: boolean;
  dimUnaffordable?: boolean;
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
          dimUnaffordable={dimUnaffordable}
        />
        <PlayerTable
          players={players.filter((player) => player.positionGroup === "G")}
          showStats
          dimUnaffordable={dimUnaffordable}
        />
      </div>
    );
  }
  const statHeaders = hasGoalies
    ? ["GP", "W", "GA", "GAA", "SV", "SA", "SV%", "SO", "QS", "RBS"]
    : ["GP", "G", "A", "P", "+/−", "PIM", "PPP", "SOG", "HIT", "BLK"];
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-center text-sm">
        <thead className="bg-muted/70 text-xs uppercase tracking-wide">
          <tr>
            <th className="px-2 py-3">NHL</th>
            <th className="px-2 py-3 text-left">Player</th>
            <th className="px-2 py-3">Pos</th>
            <th className="px-2 py-3">UFA Salary</th>
            {showStats
              ? statHeaders.map((header) => (
                  <th key={header} className="px-2 py-3">
                    {header}
                  </th>
                ))
              : null}
            <th className="px-2 py-3">Offer</th>
          </tr>
        </thead>
        <PlayerRows
          players={players}
          showStats={showStats}
          dimUnaffordable={dimUnaffordable}
        />
      </table>
    </div>
  );
}

function ActiveOffers({ groups }: { groups: UfaOfferGroupView[] }) {
  return (
    <section className="space-y-3" aria-labelledby="ufa-active-offers">
      <h3 id="ufa-active-offers" className="text-lg font-bold">
        UFA Contract Offers
      </h3>
      {groups.length === 0 ? (
        <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
          No UFA offers are currently pending.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-center text-sm">
            <thead className="bg-muted/70 text-xs uppercase">
              <tr>
                <th className="p-3">NHL</th>
                <th className="p-3 text-left">Player</th>
                <th className="p-3">Pos</th>
                <th className="p-3">Salary</th>
                <th className="p-3">GSHL Team</th>
                <th className="p-3">Years</th>
                <th className="p-3">Odds</th>
                <th className="p-3">Time Left</th>
              </tr>
            </thead>
            <tbody>
              {groups.flatMap((group) =>
                group.offers.map((offer) => (
                  <tr key={offer.id} className="border-t">
                    <td className="p-3">
                      <Logo
                        src={group.player?.nhlTeamLogoUrl ?? null}
                        alt={String(group.player?.nhlTeam ?? "NHL team")}
                      />
                    </td>
                    <td className="whitespace-nowrap p-3 text-left font-semibold">
                      {group.player?.fullName ?? "Unavailable player"}
                    </td>
                    <td className="p-3">
                      {group.player?.positions.join("/") ?? "—"}
                    </td>
                    <td className="p-3">{formatMoney(offer.salary)}</td>
                    <td className="p-3">
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
                    <td className="p-3">{offer.years}</td>
                    <td className="p-3 font-bold">
                      {Math.round(offer.probability * 1000) / 10}%
                    </td>
                    <td className="p-3">
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
      <section className="rounded-xl border border-destructive/40 p-5 text-sm text-destructive">
        UFA information could not be loaded: {query.error?.message}
      </section>
    );
  if (!query.data.window.isOpen && query.data.offerGroups.length === 0)
    return null;
  return (
    <section className="space-y-6 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">
            Summer Free Agency
          </p>
          <h2 className="text-2xl font-black">
            Top 15 Unrestricted Free Agents
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            UFA salaries include the required 125% premium. Offers are binding.
          </p>
        </div>
        <Link
          href="/leagueoffice?view=freeAgents"
          className="rounded-md border px-4 py-2 text-sm font-semibold hover:bg-muted"
        >
          View all free agents
        </Link>
      </div>
      {query.data.window.isOpen ? (
        query.data.topFreeAgents.length > 0 ? (
          <PlayerTable players={query.data.topFreeAgents} />
        ) : (
          <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
            {query.data.viewer.isSignedInOwner
              ? "No available UFAs currently fit within your franchise's cap space."
              : "No UFAs are currently available."}
          </p>
        )
      ) : (
        <p className="rounded-md bg-muted p-3 text-sm">
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
        (player) => filter === "ALL" || player.positionGroup === filter,
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
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-black">Free Agents</h1>
        <p className="text-sm text-muted-foreground">
          All eligible UFAs with their previous NHL season statistics and fixed
          125% salary.
        </p>
      </div>
      <div className="flex gap-2" aria-label="Filter free agents by position">
        {["ALL", "F", "D", "G"].map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setFilter(value);
              setVisibleCount(50);
            }}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${filter === value ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {value === "ALL" ? "All" : value}
          </button>
        ))}
      </div>
      {query.data.viewer.isSignedInOwner ? (
        <p className="text-xs text-muted-foreground">
          Muted players marked “Over cap” remain visible because this list also
          represents the draftable player pool.
        </p>
      ) : null}
      {!query.data.window.isOpen ? (
        <p className="rounded-md bg-muted p-3 text-sm">
          {query.data.window.reason}
        </p>
      ) : null}
      <PlayerTable
        players={visiblePlayers}
        showStats
        dimUnaffordable={query.data.viewer.isSignedInOwner}
      />
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
