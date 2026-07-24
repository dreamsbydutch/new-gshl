import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gshl-components/ui";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import type { GSHLTeam, NHLTeam, PlayerStatRow } from "@gshl-types";
import {
  buildPlayerStatColumns,
  findNhlTeamByAbbreviation,
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
        ? "h-8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500 sm:h-10 sm:px-3 sm:text-xs"
        : "px-2 py-1 text-[11px] text-slate-700 sm:px-3 sm:py-2 sm:text-sm",
      columnClassName ?? "",
    ];

    if (columnKey === "player") {
      classes.push(
        "sticky left-0 z-20 min-w-[150px] bg-white text-left sm:min-w-[180px]",
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
      return <span className="text-[10px] text-gray-400">-</span>;
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

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
      {headline && (
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex items-center gap-3">
            {team?.logoUrl ? (
              <Image
                src={team.logoUrl}
                alt={team.name ?? "Team Logo"}
                width={36}
                height={36}
                className="h-8 w-8 object-contain sm:h-9 sm:w-9"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600 sm:h-9 sm:w-9 sm:text-xs">
                {team?.abbr?.slice(0, 3) ?? "?"}
              </div>
            )}
            <div>
              <h2 className="font-oswald text-xl text-slate-900 sm:text-2xl">
                {team?.name ?? "Unknown Team"}
              </h2>
              <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:text-xs">
                {headline}
              </div>
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 sm:text-xs">
            {players.length} Players
          </div>
        </div>
      )}
      <Table className="min-w-[960px] text-[11px] sm:min-w-[1180px] sm:text-sm">
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead
                key={column.key}
                className={getColumnClassName(
                  column.key,
                  column.className,
                  true,
                )}
              >
                {column.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {players.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columns.length}
                className="py-8 text-center text-sm text-slate-500"
              >
                No player stats available yet.
              </TableCell>
            </TableRow>
          ) : (
            players.map((player) => (
              <TableRow key={player.id} className="group">
                {columns.map((column) => (
                  <TableCell
                    key={`${player.id}-${column.key}`}
                    className={[
                      getColumnClassName(column.key, column.className),
                      column.key === "player" ? "group-hover:bg-slate-50" : "",
                    ].join(" ")}
                  >
                    {column.key === "nhlTeam"
                      ? renderNhlTeamCell(player)
                      : renderPlayerStatCell(player, column.key)}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );
}
