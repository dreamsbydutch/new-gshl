import { ChevronDown } from "lucide-react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import type { NHLTeam, PlayerStatColumn, PlayerStatRow } from "@gshl-types";
import {
  findNhlTeamByAbbreviation,
  formatMatchupPlayerName,
  formatMatchupPlayerPositions,
  getPlayerNhlAbbreviations,
  getPlayerStatCardColumns,
  renderPlayerStatCell,
} from "@gshl-utils";

const IDENTITY_COLUMN_KEYS = new Set(["player", "pos", "nhlTeam"]);

function PlayerNhlTeams({
  player,
  nhlTeams,
}: {
  player: PlayerStatRow;
  nhlTeams: NHLTeam[];
}) {
  const abbreviations = getPlayerNhlAbbreviations(player.nhlTeam);
  const teams = abbreviations
    .map((abbreviation) => findNhlTeamByAbbreviation(nhlTeams, abbreviation))
    .filter((team): team is NHLTeam => Boolean(team));

  if (teams.length === 0) {
    return (
      <span className="text-xs font-medium text-slate-500">
        {abbreviations.join("/") || "NHL -"}
      </span>
    );
  }

  return (
    <span className="flex items-center gap-1">
      {teams.map((team) => (
        <NHLLogo key={team.id} team={team} size={20} />
      ))}
    </span>
  );
}

/** Readable mobile counterpart to the comprehensive matchup player table. */
export function MatchupPlayerPerformanceList({
  columns,
  nhlTeams,
  players,
  teamName,
}: {
  columns: PlayerStatColumn[];
  nhlTeams: NHLTeam[];
  players: PlayerStatRow[];
  teamName: string;
}) {
  if (players.length === 0) {
    return (
      <p className="px-4 py-8 text-center text-sm text-slate-500">
        No player stats available yet.
      </p>
    );
  }

  const detailColumns = columns.filter(
    (column) => !IDENTITY_COLUMN_KEYS.has(column.key),
  );

  return (
    <ul
      aria-label={`${teamName} player performances`}
      className="space-y-2 p-2 sm:p-3"
    >
      {players.map((player) => {
        const playerName = formatMatchupPlayerName(player);
        const primaryColumns = getPlayerStatCardColumns(player, columns);

        return (
          <li key={player.id}>
            <article
              aria-label={`${playerName} performance`}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm"
            >
              <header className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold leading-snug text-slate-900">
                    {playerName}
                  </h3>
                  <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{formatMatchupPlayerPositions(player)}</span>
                    <span aria-hidden="true">&middot;</span>
                    <PlayerNhlTeams player={player} nhlTeams={nhlTeams} />
                    <span aria-hidden="true">&middot;</span>
                    <span>{renderPlayerStatCell(player, "GP")} GP</span>
                  </div>
                </div>
                <div className="shrink-0 rounded-lg bg-slate-900 px-2.5 py-1.5 text-right text-white">
                  <div className="text-sm font-semibold leading-none">
                    {renderPlayerStatCell(player, "Rating")}
                  </div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.12em] text-slate-300">
                    Rating
                  </div>
                </div>
              </header>

              {primaryColumns.length > 0 ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {primaryColumns.map((column) => (
                    <div
                      key={column.key}
                      className="rounded-lg bg-slate-50 px-2 py-2 text-center"
                    >
                      <dt className="text-xs font-medium text-slate-500">
                        {column.label}
                      </dt>
                      <dd className="mt-0.5 text-sm font-semibold text-slate-900">
                        {renderPlayerStatCell(player, column.key)}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {detailColumns.length > 0 ? (
                <details className="group mt-2 border-t border-slate-100 pt-1">
                  <summary
                    aria-label={`All statistics for ${playerName}`}
                    className="flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-2 text-sm font-medium text-slate-600 outline-none focus-visible:ring-2 focus-visible:ring-slate-400 [&::-webkit-details-marker]:hidden"
                  >
                    All statistics
                    <ChevronDown
                      aria-hidden="true"
                      className="h-4 w-4 transition-transform group-open:rotate-180"
                    />
                  </summary>
                  <dl className="grid grid-cols-2 gap-2 px-2 pb-2 sm:grid-cols-4">
                    {detailColumns.map((column) => (
                      <div key={column.key} className="min-w-0">
                        <dt className="break-words text-xs font-medium text-slate-500">
                          {column.label}
                        </dt>
                        <dd className="mt-0.5 break-words text-sm text-slate-900">
                          {renderPlayerStatCell(player, column.key)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </details>
              ) : null}
            </article>
          </li>
        );
      })}
    </ul>
  );
}
