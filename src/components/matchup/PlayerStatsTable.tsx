import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { TableViewport } from "@gshl-ui";
import type { GSHLTeam, NHLTeam, PlayerStatRow } from "@gshl-types";
import {
  buildPlayerStatColumns,
  findNhlTeamByAbbreviation,
  getPlayerNhlAbbreviations,
  renderPlayerStatCell,
} from "@gshl-utils";
import Image from "next/image";
import { MatchupPlayerPerformanceList } from "./MatchupPlayerPerformanceList";

export function PlayerStatsTable({
  team,
  nhlTeams,
  players,
  headline,
  seasonCategories,
}: {
  team: GSHLTeam | null;
  nhlTeams: NHLTeam[];
  players: PlayerStatRow[];
  headline?: string;
  seasonCategories?: readonly string[];
}) {
  const columns = buildPlayerStatColumns({
    players,
    categories: seasonCategories,
  });

  const getColumnClassName = (
    columnKey: string,
    columnClassName?: string,
    isHeader = false,
  ) => {
    const classes = [
      "whitespace-nowrap",
      isHeader
        ? "h-10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500"
        : "px-3 py-2 text-sm text-slate-700",
      columnClassName ?? "",
    ];

    if (columnKey === "player") {
      classes.push(
        `sticky left-0 min-w-[180px] text-left ${
          isHeader ? "z-30 bg-slate-50" : "z-20 bg-white"
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
      .filter((nhlTeam): nhlTeam is NHLTeam => Boolean(nhlTeam));

    if (playerNhlTeams.length === 0) {
      return <NHLLogo team={undefined} size={20} />;
    }

    return (
      <div className="flex items-center justify-center gap-1">
        {playerNhlTeams.map((nhlTeam) => (
          <NHLLogo
            key={nhlTeam.id}
            team={nhlTeam}
            size={playerNhlTeams.length > 1 ? 16 : 20}
          />
        ))}
      </div>
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

      <div className="lg:hidden">
        <MatchupPlayerPerformanceList
          columns={columns}
          nhlTeams={nhlTeams}
          players={players}
          teamName={teamName}
        />
      </div>

      <TableViewport
        ariaLabel={`${teamName} comprehensive player statistics`}
        className="hidden lg:block"
        scrollHint="Scroll to review every player statistic"
        viewportClassName="rounded-none border-0 focus-visible:ring-inset focus-visible:ring-offset-0"
      >
        <table className="w-max min-w-[1180px] border-collapse text-sm">
          <caption className="sr-only">
            {teamName} comprehensive player statistics
          </caption>
          <thead className="bg-slate-50">
            <tr className="border-b border-slate-200">
              {columns.map((column) => (
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
                  colSpan={columns.length}
                  className="py-8 text-center text-sm text-slate-500"
                >
                  No player stats available yet.
                </td>
              </tr>
            ) : (
              players.map((player) => (
                <tr
                  key={player.id}
                  className="group border-b border-slate-200 transition-colors last:border-0 hover:bg-slate-50"
                >
                  {columns.map((column) => {
                    const cellClassName = [
                      getColumnClassName(column.key, column.className),
                      column.key === "player" ? "group-hover:bg-slate-50" : "",
                    ].join(" ");
                    const content =
                      column.key === "nhlTeam"
                        ? renderNhlTeamCell(player)
                        : renderPlayerStatCell(player, column.key);

                    return column.key === "player" ? (
                      <th
                        key={`${player.id}-${column.key}`}
                        scope="row"
                        className={cellClassName}
                      >
                        {content}
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
