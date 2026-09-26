"use client";

import { useNHLScheduleData } from "@gshl-hooks/features/useNHLScheduleData";
import { WeeklyScheduleSkeleton } from "@gshl-skeletons";
import { nhlGameStatus } from "@gshl-utils/features/nhl";

export function NHLSchedule() {
  const { data, week, isLoading, error, retry } = useNHLScheduleData();
  if (isLoading) return <WeeklyScheduleSkeleton />;
  return (
    <div className="space-y-5 px-3 py-6">
      <header className="text-center">
        <h2 className="text-xl font-bold">
          NHL Schedule{week ? ` · Week ${week.weekNum}` : ""}
        </h2>
        <p className="text-xs text-gray-500">
          All times Eastern · Refreshes every minute
        </p>
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
            .map((game) => (
              <article key={game.id} className="border-t px-4 py-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-xs text-gray-500">
                  <span
                    className={
                      game.gameState === "LIVE" || game.gameState === "CRIT"
                        ? "font-bold text-green-700"
                        : ""
                    }
                  >
                    {nhlGameStatus(game)}
                  </span>
                  <a
                    className="underline"
                    href={`https://www.nhl.com/gamecenter/${game.id}`}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`${game.awayTeam.abbrev} at ${game.homeTeam.abbrev} game details`}
                  >
                    Game details
                  </a>
                </div>
                {[game.awayTeam, game.homeTeam].map((team, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between gap-3 py-1 text-sm"
                  >
                    <span>
                      <span className="mr-2 text-xs text-gray-400">
                        {index === 0 ? "AWAY" : "HOME"}
                      </span>
                      {team.placeName.default}{" "}
                      {team.commonName?.default ?? team.abbrev}
                    </span>
                    <span className="text-lg font-bold tabular-nums">
                      {["LIVE", "CRIT", "FINAL", "OFF"].includes(game.gameState)
                        ? (team.score ?? "–")
                        : "–"}
                    </span>
                  </div>
                ))}
              </article>
            ))}
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
