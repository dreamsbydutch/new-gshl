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
    <section aria-labelledby="nhl-home-heading" className="gshl-section">
      <header className="border-b border-slate-200 py-1">
        <h2 id="nhl-home-heading" className="gshl-section-title">
          NHL scores{" "}
          <span
            className="text-xs font-normal text-slate-500"
            title="Eastern Time"
          >
            ET
          </span>
        </h2>
        <div
          className="mt-1 grid grid-cols-3 gap-1"
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
      <div className="py-1">
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
            {schedule.games.slice(0, 5).map((game) => {
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
        <footer className="flex min-h-11 flex-wrap items-center justify-between gap-x-2 border-t border-slate-100 text-[11px] text-slate-500">
          <span>
            Updated{" "}
            <time dateTime={new Date(schedule.data.updatedAt).toISOString()}>
              {formatNHLUpdatedAt(schedule.data.updatedAt)}
            </time>
          </span>
          <Link href="/schedule?view=nhl" className="gshl-text-action">
            {schedule.games.length > 5
              ? `All ${schedule.games.length} games`
              : "Full NHL schedule"}
          </Link>
        </footer>
      )}
    </section>
  );
}
