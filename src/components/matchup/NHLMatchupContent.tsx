"use client";

import Link from "next/link";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { MatchupSkeleton } from "@gshl-skeletons";
import { useNHLMatchupData } from "@gshl-hooks/features/useNHLMatchupData";
import { formatNHLUpdatedAt, nhlGameStatus } from "@gshl-utils/features/nhl";
import { NHLMatchupPlayerTable } from "./NHLMatchupPlayerTable";

export function NHLMatchupContent({ gameId }: { gameId: string }) {
  const {
    game,
    isLoading,
    error,
    retry,
    players,
    side,
    setSide,
    backHref,
    rosterLoading,
    rosterError,
    retryRoster,
    hasSeason,
  } = useNHLMatchupData(gameId);
  if (isLoading) return <MatchupSkeleton />;
  if (!game)
    return (
      <main className="mx-auto max-w-5xl space-y-4 px-3 py-6">
        <Link href={backHref} className="text-sm underline">
          Back to NHL schedule
        </Link>
        <p role="alert">{error ?? "NHL game not found."}</p>
        {error && (
          <button onClick={retry} className="text-sm underline">
            Retry
          </button>
        )}
      </main>
    );
  const hasScore = ["LIVE", "CRIT", "FINAL", "OFF"].includes(game.gameState);
  return (
    <main className="mx-auto max-w-5xl space-y-4 px-3 py-6 sm:space-y-6">
      <div className="flex items-center justify-between gap-3 text-sm">
        <Link href={backHref} className="text-slate-600 underline">
          Back to NHL schedule
        </Link>
        <a
          href={`https://www.nhl.com/gamecenter/${game.id}`}
          target="_blank"
          rel="noreferrer"
          className="text-slate-600 underline"
        >
          Full game on NHL.com
        </a>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:rounded-2xl sm:p-6">
        <h1 className="sr-only">
          {game.awayTeam.placeName.default} {game.awayTeam.commonName?.default}{" "}
          at {game.homeTeam.placeName.default}{" "}
          {game.homeTeam.commonName?.default}
        </h1>
        <div className="mb-3 text-center text-xs text-slate-500">
          {game.gameDate} · {nhlGameStatus(game)}
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
          {(["away", "home"] as const).map((teamSide, index) => {
            const team = teamSide === "away" ? game.awayTeam : game.homeTeam;
            return (
              <div
                key={teamSide}
                className={
                  index
                    ? "col-start-3 row-start-1 text-center"
                    : "col-start-1 row-start-1 text-center"
                }
              >
                <NHLLogo team={{ name: team.abbrev, logoUrl: "" }} size={64} />
                <div className="mt-2 font-oswald text-xl text-slate-900 sm:text-2xl">
                  {team.placeName.default} {team.commonName?.default}
                </div>
                <div className="mt-1 font-oswald text-3xl tabular-nums sm:text-4xl">
                  {hasScore ? (team.score ?? "–") : "–"}
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-wider text-slate-500">
                  {teamSide}
                </div>
              </div>
            );
          })}
          <span className="col-start-2 row-start-1 font-oswald text-xl text-slate-400">
            vs
          </span>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500">
          Last updated:{" "}
          <time dateTime={new Date(game.updatedAt).toISOString()}>
            {formatNHLUpdatedAt(game.updatedAt)}
          </time>{" "}
          · Refreshes every 15 minutes
        </p>
      </section>
      {error && (
        <p role="alert" className="text-sm text-slate-600">
          {error}{" "}
          <button className="underline" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      <div
        className="flex justify-center gap-2"
        role="group"
        aria-label="NHL team player statistics"
      >
        {(["away", "home"] as const).map((teamSide) => (
          <button
            key={teamSide}
            onClick={() => setSide(teamSide)}
            aria-pressed={side === teamSide}
            className={`rounded-full border px-4 py-2 text-sm ${side === teamSide ? "border-slate-800 bg-slate-800 text-white" : "border-slate-200 bg-white text-slate-600"}`}
          >
            {teamSide === "away" ? game.awayTeam.abbrev : game.homeTeam.abbrev}
          </button>
        ))}
      </div>
      <p className="text-center text-xs text-slate-500">
        Recorded GSHL positions show who started or was benched on this date.
        Current roster positions are labeled “Planned” until game-day records
        arrive. “Not recorded” does not mean the player was benched.
      </p>
      {rosterLoading ? (
        <p role="status" className="py-6 text-center text-sm text-slate-500">
          Loading GSHL players…
        </p>
      ) : rosterError ? (
        <p role="alert">
          {rosterError}{" "}
          <button className="underline" onClick={retryRoster}>
            Retry players
          </button>
        </p>
      ) : !hasSeason ? (
        <p className="text-center text-sm text-slate-500">
          No matching GSHL season is available for this game.
        </p>
      ) : (
        <>
          <NHLMatchupPlayerTable
            players={players.filter((player) => !player.goalie)}
          />
          <NHLMatchupPlayerTable
            players={players.filter((player) => player.goalie)}
            goalies
          />
        </>
      )}
    </main>
  );
}
