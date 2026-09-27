"use client";

import Link from "next/link";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { NHLScheduleHomeCardSkeleton } from "@gshl-components/skeletons/HomeSkeleton";
import { useNHLHomeSchedule } from "@gshl-hooks/features/useNHLHomeSchedule";
import { formatNHLUpdatedAt, nhlGameStatus } from "@gshl-utils/features/nhl";

export function NHLScheduleHomeCard() {
  const schedule = useNHLHomeSchedule();
  if (!schedule.selectedDay) return <NHLScheduleHomeCardSkeleton />;

  return (
    <section
      aria-labelledby="nhl-home-heading"
      className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white"
    >
      <header className="border-b border-slate-100 px-3 py-3 sm:px-5">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-blue-600">
          Around the NHL
        </p>
        <h2
          id="nhl-home-heading"
          className="mt-0.5 font-oswald text-lg text-slate-950 sm:text-xl"
        >
          Scores &amp; schedule
        </h2>
        <p className="mt-0.5 text-xs text-slate-500">
          All times Eastern · Updates every 15 minutes
        </p>
        <div
          className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1"
          role="group"
          aria-label="NHL schedule day"
        >
          {schedule.days.map((day, index) => (
            <button
              key={day.label}
              type="button"
              aria-pressed={schedule.selectedIndex === index}
              onClick={() => schedule.setSelectedIndex(index)}
              className={`min-h-11 rounded-md px-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${schedule.selectedIndex === index ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              {day.label}
            </button>
          ))}
        </div>
      </header>
      <div className="px-3 py-2 sm:px-5">
        <h3 className="py-2 text-xs font-semibold text-slate-600">
          <time dateTime={schedule.selectedDay.date}>
            {schedule.selectedDay.dateLabel}
          </time>
        </h3>
        {schedule.error && (
          <p role="alert" className="py-3 text-sm text-slate-600">
            {schedule.error}{" "}
            <button
              type="button"
              onClick={schedule.retry}
              className="inline-flex min-h-11 items-center rounded underline focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Retry
            </button>
          </p>
        )}
        {schedule.isLoading ? (
          <p role="status" className="py-6 text-center text-sm text-slate-500">
            Loading games…
          </p>
        ) : schedule.data && !schedule.games.length ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {schedule.data.published
              ? "No NHL games scheduled for this day."
              : "The NHL schedule has not been published yet."}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {schedule.games.map((game) => {
              const hasScore = ["LIVE", "CRIT", "FINAL", "OFF"].includes(
                game.gameState,
              );
              const status = nhlGameStatus(game);
              const away = game.awayTeam;
              const home = game.homeTeam;
              const awayName = `${away.placeName.default} ${away.commonName?.default ?? away.abbrev}`;
              const homeName = `${home.placeName.default} ${home.commonName?.default ?? home.abbrev}`;
              return (
                <li key={game.id}>
                  <Link
                    href={`/nhl/matchup/${game.id}`}
                    prefetch={false}
                    aria-label={`${awayName} at ${homeName}${hasScore ? `, ${away.score ?? "–"} to ${home.score ?? "–"}` : ""}. ${status}. View matchup.`}
                    className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded py-2 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                      <NHLLogo
                        team={{ name: away.abbrev, logoUrl: "" }}
                        size={24}
                        className="!mx-0 shrink-0"
                      />
                      <span>{away.abbrev}</span>
                      {hasScore && (
                        <span className="w-4 text-center tabular-nums">
                          {away.score ?? "–"}
                        </span>
                      )}
                      <span className="text-slate-400" aria-hidden="true">
                        @
                      </span>
                      {hasScore && (
                        <span className="w-4 text-center tabular-nums">
                          {home.score ?? "–"}
                        </span>
                      )}
                      <NHLLogo
                        team={{ name: home.abbrev, logoUrl: "" }}
                        size={24}
                        className="!mx-0 shrink-0"
                      />
                      <span>{home.abbrev}</span>
                    </span>
                    <span
                      className={`ml-auto whitespace-nowrap text-xs ${["LIVE", "CRIT"].includes(game.gameState) ? "font-semibold text-emerald-700" : "text-slate-500"}`}
                    >
                      {status}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {schedule.data && (
        <p className="border-t border-slate-100 px-3 py-3 text-[11px] text-slate-500 sm:px-5">
          Updated{" "}
          <time dateTime={new Date(schedule.data.updatedAt).toISOString()}>
            {formatNHLUpdatedAt(schedule.data.updatedAt)}
          </time>
        </p>
      )}
    </section>
  );
}
