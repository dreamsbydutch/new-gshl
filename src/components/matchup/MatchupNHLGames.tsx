"use client";

import Link from "next/link";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { TableViewport } from "@gshl-ui";
import { useMatchupNHLGames } from "@gshl-hooks/features/useMatchupNHLGames";
import type { MatchupDetailsPayload } from "@gshl-types";
import { formatMatchupPlayerName } from "@gshl-utils/features/matchup-details";
import { nhlGameStatus } from "@gshl-utils/features/nhl";

export function MatchupNHLGames({
  details,
}: {
  details: MatchupDetailsPayload;
}) {
  const schedule = useMatchupNHLGames(details);
  if (!schedule.isActive) return null;

  return (
    <section
      aria-labelledby="matchup-nhl-games-heading"
      className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:rounded-2xl"
    >
      <div className="flex items-baseline justify-between gap-2 px-3 py-2">
        <h2
          id="matchup-nhl-games-heading"
          className="font-oswald text-lg text-slate-900"
        >
          Today&apos;s NHL games
        </h2>
        <span className="text-xs text-slate-600">
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
        <p role="status" className="px-3 py-2 text-sm text-slate-700">
          Loading today&apos;s games…
        </p>
      ) : schedule.data && schedule.rows.length === 0 ? (
        <p className="px-3 py-2 text-sm text-slate-700">
          {schedule.data.published
            ? "No NHL games today involve players in this matchup."
            : "Today's NHL schedule is not available yet."}
        </p>
      ) : schedule.rows.length > 0 ? (
        <TableViewport
          ariaLabel="NHL games relevant to this matchup"
          viewportClassName="rounded-none border-0"
          scrollHint="Scroll to see the players involved"
        >
          <table className="w-full min-w-[480px] table-fixed border-collapse text-xs leading-4">
            <caption className="sr-only">
              Today&apos;s NHL games and the players involved from each GSHL
              team
            </caption>
            <colgroup>
              <col className="w-24" />
              <col className="w-28" />
              <col />
            </colgroup>
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th scope="col" className="px-3 py-1.5">
                  Game
                </th>
                <th scope="col" className="px-2 py-1.5">
                  Score / status
                </th>
                <th scope="col" className="px-2 py-1.5">
                  Players involved
                </th>
              </tr>
            </thead>
            <tbody>
              {schedule.rows.map(({ game, awayPlayers, homePlayers }) => (
                <tr
                  key={game.id}
                  className="border-t border-slate-100 text-slate-900 even:bg-slate-50/50"
                >
                  <th scope="row" className="px-3 py-1.5">
                    <Link
                      href={`/nhl/matchup/${game.id}?season=${encodeURIComponent(details.matchup.seasonId)}&week=${encodeURIComponent(details.matchup.weekId)}`}
                      aria-label={`${game.awayTeam.abbrev} at ${game.homeTeam.abbrev} NHL matchup`}
                      className="flex h-8 items-center justify-center gap-1 rounded hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <NHLLogo
                        team={{ name: game.awayTeam.abbrev, logoUrl: "" }}
                        size={22}
                        className="!mx-0 shrink-0"
                      />
                      <span aria-hidden="true" className="font-normal">
                        @
                      </span>
                      <NHLLogo
                        team={{ name: game.homeTeam.abbrev, logoUrl: "" }}
                        size={22}
                        className="!mx-0 shrink-0"
                      />
                    </Link>
                  </th>
                  <td className="px-2 py-1.5">
                    {game.awayTeam.score != null &&
                    game.homeTeam.score != null ? (
                      <div className="whitespace-nowrap font-semibold tabular-nums">
                        {game.awayTeam.score} – {game.homeTeam.score}
                      </div>
                    ) : null}
                    <div className="whitespace-nowrap">
                      {nhlGameStatus(game)}
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    {(
                      [
                        { side: "away", players: awayPlayers },
                        { side: "home", players: homePlayers },
                      ] as const
                    ).map(({ side, players }) => {
                      if (!players.length) return null;
                      const team = details.teams[side];
                      const names = players
                        .map(formatMatchupPlayerName)
                        .join(", ");
                      return (
                        <div
                          key={side}
                          className="truncate"
                          title={`${team?.name ?? side}: ${names}`}
                        >
                          <span className="font-semibold">
                            {team?.abbr ?? team?.name ?? side}:
                          </span>{" "}
                          {names}
                        </div>
                      );
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableViewport>
      ) : null}
    </section>
  );
}
