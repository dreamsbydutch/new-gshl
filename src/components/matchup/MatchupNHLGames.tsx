"use client";

import Link from "next/link";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { useMatchupNHLGames } from "@gshl-hooks/features/useMatchupNHLGames";
import type { MatchupDetailsPayload } from "@gshl-types";
import { formatMatchupPlayerName } from "@gshl-utils/features/matchup-details";
import { nhlGameStatus } from "@gshl-utils/features/nhl";
import { MatchupPlayersToWatch } from "./MatchupPlayersToWatch";

export function MatchupNHLGames({
  details,
}: {
  details: MatchupDetailsPayload;
}) {
  const schedule = useMatchupNHLGames(details);
  if (schedule.isUpcoming) return <MatchupPlayersToWatch details={details} />;
  if (!schedule.isActive)
    return <MatchupPlayersToWatch details={details} previewOnly />;

  return (
    <>
      <MatchupPlayersToWatch details={details} previewOnly />
      <section
        aria-labelledby="matchup-nhl-games-heading"
        className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:rounded-2xl"
      >
        <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 px-3 py-2">
          <h2
            id="matchup-nhl-games-heading"
            className="font-oswald text-base text-slate-900"
          >
            Today&apos;s NHL games
          </h2>
          <span className="shrink-0 text-xs text-slate-500">
            {schedule.selectedDay?.dateLabel}
          </span>
        </div>
        {schedule.error ? (
          <p role="alert" className="px-3 py-2 text-xs text-slate-700">
            {schedule.error}{" "}
            <button
              type="button"
              onClick={schedule.retry}
              className="rounded underline focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Retry
            </button>
          </p>
        ) : null}
        {schedule.isLoading ? (
          <p role="status" className="px-3 py-2 text-sm text-slate-600">
            Loading today&apos;s games…
          </p>
        ) : schedule.data && schedule.rows.length === 0 ? (
          <p className="px-3 py-2 text-sm text-slate-600">
            {schedule.data.published
              ? "No matchup players are in action today."
              : "Today's NHL schedule is not available yet."}
          </p>
        ) : schedule.rows.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {schedule.rows.map(({ game, awayPlayers, homePlayers }) => {
              const playerSummaries = (
                [
                  { side: "away", players: awayPlayers },
                  { side: "home", players: homePlayers },
                ] as const
              )
                .filter(({ players }) => players.length > 0)
                .map(({ side, players }) => {
                  const team = details.teams[side];
                  const names = players.map(formatMatchupPlayerName).join(", ");
                  return {
                    label: team?.abbr ?? team?.name ?? side,
                    text: `${players.length} ${players.length === 1 ? "player" : "players"}`,
                    title: `${team?.name ?? side}: ${names}`,
                  };
                });

              return (
                <li key={game.id} className="px-3 py-2">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                    <Link
                      href={`/nhl/matchup/${game.id}?season=${encodeURIComponent(details.matchup.seasonId)}&week=${encodeURIComponent(details.matchup.weekId)}`}
                      aria-label={`${game.awayTeam.abbrev} at ${game.homeTeam.abbrev} NHL matchup`}
                      className="flex h-7 shrink-0 items-center gap-1 rounded px-1 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <NHLLogo
                        team={{ name: game.awayTeam.abbrev, logoUrl: "" }}
                        size={20}
                        className="!mx-0 shrink-0"
                      />
                      <span
                        aria-hidden="true"
                        className="text-[10px] text-slate-400"
                      >
                        @
                      </span>
                      <NHLLogo
                        team={{ name: game.homeTeam.abbrev, logoUrl: "" }}
                        size={20}
                        className="!mx-0 shrink-0"
                      />
                    </Link>
                    <div className="min-w-0 flex-1 text-xs text-slate-600">
                      <span className="font-semibold tabular-nums text-slate-900">
                        {game.awayTeam.score != null &&
                        game.homeTeam.score != null
                          ? `${game.awayTeam.score} - ${game.homeTeam.score}`
                          : nhlGameStatus(game)}
                      </span>
                      {game.awayTeam.score != null &&
                      game.homeTeam.score != null ? (
                        <span className="ml-1.5 text-slate-500">
                          {nhlGameStatus(game)}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex basis-full flex-wrap items-center gap-x-2 text-[11px] text-slate-600 sm:basis-auto">
                      {playerSummaries.map(({ label, text, title }) => (
                        <span
                          key={label}
                          title={title}
                          className="whitespace-nowrap"
                        >
                          <span className="font-semibold text-slate-800">
                            {label}
                          </span>{" "}
                          {text}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : null}
      </section>
    </>
  );
}
