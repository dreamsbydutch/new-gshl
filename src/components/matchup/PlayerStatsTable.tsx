import { NHLLogoList } from "@gshl-components/player/NHLLogoList";
import { TableViewport } from "@gshl-ui";
import type {
  MatchupDetailsNhlTeam,
  MatchupDetailsTeam,
  PlayerStatRow,
} from "@gshl-types";
import {
  buildPlayerStatColumns,
  findNhlTeamByAbbreviation,
  formatMatchupPlayerName,
  getPlayerNhlAbbreviations,
  renderPlayerStatCell,
} from "@gshl-utils";
import Image from "next/image";

export function PlayerStatsTable({
  team,
  nhlTeams,
  players,
  headline,
  seasonCategories,
}: {
  team: MatchupDetailsTeam | null;
  nhlTeams: MatchupDetailsNhlTeam[];
  players: PlayerStatRow[];
  headline?: string;
  seasonCategories?: readonly string[];
}) {
  const columns = buildPlayerStatColumns({
    players,
    categories: seasonCategories,
  });
  const tableColumns = columns.filter((column) => column.key !== "nhlTeam");

  const getColumnClassName = (
    columnKey: string,
    columnClassName?: string,
    isHeader = false,
  ) => {
    const classes = [
      "whitespace-nowrap",
      isHeader
        ? "h-9 px-2 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:h-10 sm:px-3 sm:text-xs sm:tracking-[0.16em]"
        : "px-2 py-2 text-xs text-slate-700 sm:px-3 sm:text-sm",
      columnKey === "player" ? "" : (columnClassName ?? ""),
    ];

    if (columnKey === "player") {
      classes.push(
        `sticky left-0 w-28 min-w-28 max-w-28 overflow-hidden border-r border-slate-200 text-left sm:w-40 sm:min-w-40 sm:max-w-40 lg:w-auto lg:min-w-[180px] lg:max-w-none ${
          isHeader ? "z-30 bg-slate-50" : "z-20 bg-inherit"
        }`,
      );
    }

    if (
      columnKey !== "player" &&
      columnKey !== "date" &&
      columnKey !== "opp" &&
      columnKey !== "score"
    ) {
      classes.push("text-center");
    }

    return classes.join(" ");
  };

  const renderNhlTeamCell = (player: PlayerStatRow) => {
    const playerNhlTeams = getPlayerNhlAbbreviations(player.nhlTeam)
      .map((abbreviation) => findNhlTeamByAbbreviation(nhlTeams, abbreviation))
      .filter((nhlTeam): nhlTeam is MatchupDetailsNhlTeam => Boolean(nhlTeam));

    return (
      <NHLLogoList
        teams={playerNhlTeams}
        size={playerNhlTeams.length > 1 ? 14 : 16}
      />
    );
  };

  const teamName = team?.name ?? "Unknown Team";
  const sectionLabel = headline ?? "Player statistics";

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex min-w-0 items-center gap-3">
          {team?.logoUrl ? (
            <Image
              src={team.logoUrl}
              alt=""
              width={36}
              height={36}
              className="h-8 w-8 shrink-0 object-contain sm:h-9 sm:w-9"
            />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 sm:h-9 sm:w-9 sm:text-xs"
            >
              {team?.abbr?.slice(0, 3) ?? "?"}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="truncate font-oswald text-xl text-slate-900 sm:text-2xl">
              {teamName}
            </h2>
            <div className="text-xs uppercase tracking-[0.14em] text-slate-500 sm:tracking-[0.18em]">
              {sectionLabel}
            </div>
          </div>
        </div>
        <div className="shrink-0 text-xs uppercase tracking-[0.14em] text-slate-500 sm:tracking-[0.18em]">
          {players.length} {players.length === 1 ? "Player" : "Players"}
        </div>
      </div>

      <TableViewport
        ariaLabel={`${teamName} comprehensive player statistics`}
        scrollHint="Scroll to review every player statistic"
        viewportClassName="rounded-none border-0 focus-visible:ring-inset focus-visible:ring-offset-0"
      >
        <table className="w-max min-w-full border-collapse text-xs sm:text-sm">
          <caption className="sr-only">
            {teamName} comprehensive player statistics
          </caption>
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              {tableColumns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={getColumnClassName(
                    column.key,
                    column.className,
                    true,
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {players.length === 0 ? (
              <tr>
                <td
                  colSpan={tableColumns.length}
                  className="py-8 text-center text-sm text-slate-500"
                >
                  No player stats available yet.
                </td>
              </tr>
            ) : (
              players.map((player) => (
                <tr
                  key={player.id}
                  className="group border-b border-slate-200 transition-colors last:border-0 odd:bg-white even:bg-slate-50/70 hover:bg-slate-100"
                >
                  {tableColumns.map((column) => {
                    const cellClassName = [
                      getColumnClassName(column.key, column.className),
                      column.key === "player" ? "group-hover:bg-slate-100" : "",
                    ].join(" ");
                    const content = renderPlayerStatCell(player, column.key);

                    return column.key === "player" ? (
                      <th
                        key={`${player.id}-${column.key}`}
                        scope="row"
                        className={cellClassName}
                      >
                        <div className="flex min-w-0 items-center gap-1.5">
                          {renderNhlTeamCell(player)}
                          <span
                            className="truncate"
                            title={formatMatchupPlayerName(player)}
                          >
                            {content}
                          </span>
                        </div>
                      </th>
                    ) : (
                      <td
                        key={`${player.id}-${column.key}`}
                        className={cellClassName}
                      >
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </TableViewport>
    </section>
  );
}
