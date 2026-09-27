"use client";

import Link from "next/link";
import { useNHLScheduleData } from "@gshl-hooks/features/useNHLScheduleData";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { WeeklyScheduleSkeleton } from "@gshl-skeletons";
import { nhlGameStatus, formatNHLUpdatedAt } from "@gshl-utils/features/nhl";

export function NHLSchedule() {
  const { data, week, isLoading, error, retry, getMatchupHref } =
    useNHLScheduleData();
  if (isLoading) return <WeeklyScheduleSkeleton />;
  return (
    <div className="space-y-5 px-3 py-6">
      <header className="text-center">
        <h2 className="text-xl font-bold">
          NHL Schedule{week ? ` · Week ${week.weekNum}` : ""}
        </h2>
        <p className="text-xs text-gray-500">
          All times Eastern · Scores and schedule refresh every 15 minutes
        </p>
        {data && (
          <p className="text-xs text-gray-500">
            Last updated:{" "}
            <time dateTime={new Date(data.updatedAt).toISOString()}>
              {formatNHLUpdatedAt(data.updatedAt)}
            </time>
          </p>
        )}
      </header>
      {error && (
        <p role="alert" className="text-center text-sm">
          {error}{" "}
          <button className="underline" onClick={retry}>
            Retry
          </button>
        </p>
      )}
      {!week && !error && (
        <p className="text-center text-sm text-gray-500">
          Select a week to see NHL games.
        </p>
      )}
      {data && !data.published && (
        <p className="text-center text-sm text-gray-500">
          The NHL schedule has not been published for this season.
        </p>
      )}
      {data?.gameWeek.map((day) => (
        <section
          key={day.date}
          className="overflow-hidden rounded-lg border bg-white"
        >
          <h3 className="bg-gray-100 px-4 py-3 text-sm font-bold">
            {new Intl.DateTimeFormat("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
              year: "numeric",
              timeZone: "UTC",
            }).format(new Date(`${day.date}T12:00:00Z`))}
          </h3>
          {!day.games.length && (
            <p className="px-4 py-4 text-sm text-gray-500">
              No NHL games scheduled.
            </p>
          )}
          {[...day.games]
            .sort((a, b) => a.startTimeUTC.localeCompare(b.startTimeUTC))
            .map((game) => {
              const hasScore = ["LIVE", "CRIT", "FINAL", "OFF"].includes(
                game.gameState,
              );
              const awayScore = hasScore ? (game.awayTeam.score ?? "–") : "–";
              const homeScore = hasScore ? (game.homeTeam.score ?? "–") : "–";
              const status = nhlGameStatus(game);
              const awayName = `${game.awayTeam.placeName.default} ${game.awayTeam.commonName?.default ?? game.awayTeam.abbrev}`;
              const homeName = `${game.homeTeam.placeName.default} ${game.homeTeam.commonName?.default ?? game.homeTeam.abbrev}`;
              return (
                <Link
                  key={game.id}
                  className="grid min-h-11 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_5.5rem] items-center gap-2 border-t px-3 py-2 transition-colors hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-gray-700 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_7rem] sm:px-4"
                  href={getMatchupHref(game.id)}
                  prefetch={false}
                  aria-label={`${awayName} at ${homeName}${hasScore ? `, ${awayScore} to ${homeScore}` : ""}. ${status}. GSHL player matchup details.`}
                >
                  <span
                    className="flex items-center justify-end gap-1.5"
                    title={awayName}
                  >
                    <NHLLogo
                      team={{ name: game.awayTeam.abbrev, logoUrl: "" }}
                      size={28}
                      className="!mx-0 shrink-0"
                    />
                    <span className="hidden text-xs font-medium sm:inline">
                      {game.awayTeam.abbrev}
                    </span>
                    <span className="w-5 text-center text-sm font-bold tabular-nums">
                      {awayScore}
                    </span>
                  </span>
                  <span className="text-xs text-gray-400" aria-hidden="true">
                    @
                  </span>
                  <span className="flex items-center gap-1.5" title={homeName}>
                    <span className="w-5 text-center text-sm font-bold tabular-nums">
                      {homeScore}
                    </span>
                    <NHLLogo
                      team={{ name: game.homeTeam.abbrev, logoUrl: "" }}
                      size={28}
                      className="!mx-0 shrink-0"
                    />
                    <span className="hidden text-xs font-medium sm:inline">
                      {game.homeTeam.abbrev}
                    </span>
                  </span>
                  <span
                    className={`whitespace-nowrap text-right text-[10px] sm:text-xs ${game.gameState === "LIVE" || game.gameState === "CRIT" ? "font-bold text-green-700" : "text-gray-500"}`}
                  >
                    {status}
                  </span>
                </Link>
              );
            })}
        </section>
      ))}
      <p className="text-center text-xs text-gray-500">
        Source:{" "}
        <a
          className="underline"
          href="https://www.nhl.com/schedule"
          target="_blank"
          rel="noreferrer"
        >
          NHL
        </a>
      </p>
    </div>
  );
}
