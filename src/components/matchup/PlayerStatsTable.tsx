"use client";

import type { MatchupRecords } from "@gshl-lib/types/performance-records";
import { PerformanceRecordBadge } from "./PerformanceRecordBadge";
import { NHLLogoList } from "@gshl-components/player/NHLLogoList";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { useMatchupPlayerTable } from "@gshl-hooks/features/useMatchupPlayerTable";
import { useInjuryReport } from "@gshl-hooks/main/useInjuryReport";
import {
  getPlayerTodayGames,
  matchupPlayerInjuryDesignation,
  sortMatchupPlayersByInjury,
} from "@gshl-utils/features/matchup-details";
import { nhlGameStatus } from "@gshl-utils/features/nhl";
import { TableViewport } from "@gshl-ui";
import type {
  MatchupDetailsNhlTeam,
  MatchupDetailsMatchup,
  MatchupDetailsWeek,
  MatchupDetailsTeam,
  PlayerStatRow,
  PlayerStatColumn,
  MatchupPlayerDayRow,
  MatchupPlayerWeekRow,
} from "@gshl-types";
import { playerActivity } from "@gshl-utils/features/matchup-activity";
import {
  abbreviatePlayerName,
  findNhlTeamByAbbreviation,
  formatMatchupPlayerName,
  getPlayerNhlAbbreviations,
  renderPlayerStatCell,
} from "@gshl-utils";
import Image from "next/image";
import Link from "next/link";
import { Fragment } from "react";
import { groupMatchupPlayers } from "@gshl-utils/features/matchup-roster";

export function PlayerStatsTable({
  matchup,
  week,
  team,
  nhlTeams,
  players,
  playerDays = [],
  records = null,
  headline,
  seasonCategories,
  currentRoster,
}: {
  matchup: MatchupDetailsMatchup;
  week: MatchupDetailsWeek | null;
  team: MatchupDetailsTeam | null;
  nhlTeams: MatchupDetailsNhlTeam[];
  players: MatchupPlayerWeekRow[];
  playerDays?: MatchupPlayerDayRow[];
  records?: MatchupRecords | null;
  headline?: string;
  seasonCategories?: readonly string[];
  currentRoster?: PlayerStatRow[];
}) {
  const table = useMatchupPlayerTable({
    matchup,
    week,
    players,
    playerDays,
    categories: seasonCategories,
    currentRoster,
  });
  const injuryReport = useInjuryReport();
  const injuries = injuryReport.data?.injuries ?? [];
  const currentDailySlots = new Map(
    playerDays
      .filter((player) => player.date === table.schedule.selectedDay?.date)
      .map((player) => [player.id, player.dailyPos]),
  );
  const playersByInjury = sortMatchupPlayersByInjury(
    table.players.map((player) => ({
      ...player,
      dailyPos: player.dailyPos ?? currentDailySlots.get(player.id),
    })),
    injuries,
  );
  const groups = groupMatchupPlayers(
    playersByInjury,
    table.isActive ? table.roster : playersByInjury,
    (player) => Boolean(matchupPlayerInjuryDesignation(player, injuries)),
    table.view === "today",
  );
  const activeGroups = groups.filter(
    (group) => group.label !== "Injured / inactive",
  );
  const injuredPlayers =
    groups.find((group) => group.label === "Injured / inactive")?.players ?? [];
  const { schedule, isActive, columns } = table;
  const tableColumns: (
    | PlayerStatColumn
    | { key: "today"; label: string; className?: string }
  )[] = columns.filter((column) => column.key !== "nhlTeam");
  if (isActive) {
    tableColumns.splice(
      tableColumns.findIndex((column) => column.key === "player") + 1,
      0,
      { key: "today", label: "Today's game" },
    );
  }

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
        `sticky left-0 w-36 min-w-36 max-w-36 overflow-hidden border-r border-slate-200 text-left sm:w-40 sm:min-w-40 sm:max-w-40 lg:w-auto lg:min-w-[180px] lg:max-w-none ${
          isHeader ? "z-30 bg-slate-50" : "z-20 bg-inherit"
        }`,
      );
    }

    if (columnKey === "MS" || columnKey === "MG") {
      classes.push("border-l border-slate-300");
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
  const sectionLabel =
    headline ??
    (table.view === "today"
      ? "Today's player statistics"
      : "Full week player statistics");

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
          {table.players.length}{" "}
          {table.players.length === 1 ? "Player" : "Players"}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          {isActive ? (
            <div
              className="inline-flex rounded-lg bg-slate-100 p-1"
              role="group"
              aria-label="Player statistics period"
            >
              {(["today", "week"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={table.view === view}
                  onClick={() => table.setView(view)}
                  className={`min-h-9 rounded-md px-3 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${table.view === view ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"}`}
                >
                  {view === "today" ? "Today" : "Full week"}
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <label className="flex min-h-9 items-center gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            checked={table.advanced}
            onChange={(event) => table.setAdvanced(event.target.checked)}
          />
          More stats
        </label>
      </div>
      {table.view === "today" ? (
        <p className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500 sm:px-4">
          {schedule.selectedDay?.dateLabel} · Day stats include bench
          performances; only starting slots count toward team totals.
          {!table.hasToday
            ? " Today's roster and stats have not been recorded yet."
            : ""}
        </p>
      ) : null}

      {isActive && schedule.error ? (
        <p role="alert" className="px-3 py-2 text-xs text-slate-600 sm:px-4">
          {schedule.error}{" "}
          <button
            type="button"
            onClick={schedule.retry}
            className="inline-flex min-h-11 items-center rounded underline focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Retry today&apos;s games
          </button>
        </p>
      ) : null}
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
              {tableColumns.map((column) => {
                const sortable = column.key !== "today";
                const isSorted = sortable && table.sort === column.key;
                const direction =
                  table.sortDirection === "asc" ? "ascending" : "descending";
                return (
                  <th
                    key={column.key}
                    scope="col"
                    aria-sort={isSorted ? direction : undefined}
                    className={getColumnClassName(
                      column.key,
                      column.className,
                      true,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => table.toggleSort(column.key)}
                        className="inline-flex min-h-6 items-center gap-1 rounded text-inherit hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                        title={`Sort by ${column.label}${isSorted ? `, currently ${direction}` : ""}`}
                      >
                        <span>{column.label}</span>
                        <span
                          aria-hidden="true"
                          className={
                            isSorted ? "text-slate-700" : "text-slate-300"
                          }
                        >
                          {isSorted
                            ? table.sortDirection === "asc"
                              ? "↑"
                              : "↓"
                            : "↕"}
                        </span>
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {table.players.length === 0 ? (
              <tr>
                <td
                  colSpan={tableColumns.length}
                  className="py-8 text-center text-sm text-slate-500"
                >
                  No player stats available yet.
                </td>
              </tr>
            ) : (
              <>
                {activeGroups.map((group) => (
                  <Fragment key={group.label}>
                    {isActive ? (
                      <tr>
                        <th
                          scope="rowgroup"
                          className="sticky left-0 z-20 border-y-2 border-slate-300 bg-slate-100 px-3 py-3 text-left text-xs font-semibold text-slate-700"
                        >
                          {group.label} ({group.players.length})
                        </th>
                        <td
                          colSpan={tableColumns.length - 1}
                          className="border-y-2 border-slate-300 bg-slate-100"
                        />
                      </tr>
                    ) : null}
                    {group.players.map((player) => (
                      <tr
                        key={player.id}
                        className={`group border-b border-slate-200 transition-colors last:border-0 hover:bg-slate-100 ${isActive && playerActivity(player, schedule.games) === "live" ? "bg-emerald-50/60" : "odd:bg-white even:bg-slate-50/70"}`}
                      >
                        {tableColumns.map((column) => {
                          if (column.key === "today")
                            return (
                              <td
                                key="today"
                                className={getColumnClassName("today")}
                              >
                                {schedule.isLoading ? (
                                  <span className="text-slate-400">
                                    Loading…
                                  </span>
                                ) : !table.rosterIds.has(player.id) ? (
                                  <span className="text-[10px] text-slate-400">
                                    Off roster today
                                  </span>
                                ) : !schedule.data ? (
                                  <span className="text-slate-400">
                                    Unavailable
                                  </span>
                                ) : !schedule.data.published ? (
                                  <span className="text-slate-400">
                                    Not scheduled
                                  </span>
                                ) : getPlayerTodayGames(player, schedule.games)
                                    .length === 0 ? (
                                  <span
                                    aria-label="No game today"
                                    className="text-slate-400"
                                  >
                                    —
                                  </span>
                                ) : (
                                  getPlayerTodayGames(
                                    player,
                                    schedule.games,
                                  ).map((game) => (
                                    <Link
                                      key={game.id}
                                      href={`/nhl/matchup/${game.id}`}
                                      prefetch={false}
                                      aria-label={`${formatMatchupPlayerName(player)}: ${game.awayTeam.abbrev} at ${game.homeTeam.abbrev}. ${nhlGameStatus(game)}. View NHL matchup.`}
                                      title={`${game.awayTeam.abbrev} at ${game.homeTeam.abbrev} · ${nhlGameStatus(game)}`}
                                      className="inline-flex min-h-6 items-center justify-center gap-1 rounded px-1 text-blue-700 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                    >
                                      <NHLLogo
                                        team={{
                                          name: game.awayTeam.abbrev,
                                          logoUrl: "",
                                        }}
                                        size={18}
                                        className="!mx-0 shrink-0"
                                      />
                                      <span
                                        aria-hidden="true"
                                        className="text-[10px] text-slate-400"
                                      >
                                        @
                                      </span>
                                      <NHLLogo
                                        team={{
                                          name: game.homeTeam.abbrev,
                                          logoUrl: "",
                                        }}
                                        size={18}
                                        className="!mx-0 shrink-0"
                                      />
                                      <span className="ml-1 text-[10px] text-slate-500">
                                        {nhlGameStatus(game)}
                                        {typeof game.awayTeam.score ===
                                          "number" &&
                                        typeof game.homeTeam.score === "number"
                                          ? ` · ${game.awayTeam.score}–${game.homeTeam.score}`
                                          : ""}
                                      </span>
                                    </Link>
                                  ))
                                )}
                              </td>
                            );
                          const cellClassName = [
                            getColumnClassName(column.key, column.className),
                            column.key === "player"
                              ? "group-hover:bg-slate-100"
                              : "",
                          ].join(" ");
                          const isTodayNonAppearance =
                            table.view === "today" && Number(player.GP) <= 0;
                          const isPlayerIdentityColumn =
                            column.key === "player" ||
                            column.key === "pos" ||
                            column.key === "dailyPos";
                          const content =
                            table.view === "today" &&
                            (!table.hasToday || isTodayNonAppearance) &&
                            !isPlayerIdentityColumn
                              ? "—"
                              : renderPlayerStatCell(player, column.key);

                          return column.key === "player" ? (
                            <th
                              key={`${player.id}-${column.key}`}
                              scope="row"
                              className={cellClassName}
                              aria-label={formatMatchupPlayerName(player)}
                            >
                              <div className="flex min-w-0 items-center gap-1.5">
                                {renderNhlTeamCell(player)}
                                <span
                                  className="truncate"
                                  title={formatMatchupPlayerName(player)}
                                >
                                  {abbreviatePlayerName(content)}
                                </span>
                              </div>
                            </th>
                          ) : (
                            <td
                              key={`${player.id}-${column.key}`}
                              className={cellClassName}
                            >
                              {content}
                              {table.view === "week" &&
                              column.key !== "Rating" ? (
                                <PerformanceRecordBadge
                                  records={records}
                                  entityId={(team?.id ?? "") + ":" + player.id}
                                  stat={column.key}
                                  value={content}
                                />
                              ) : null}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {injuredPlayers.length > 0 ? (
                  <tr className="border-y border-red-100 bg-red-50/70">
                    <td
                      colSpan={tableColumns.length}
                      className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700 sm:px-4 sm:text-xs"
                    >
                      Injured / inactive
                    </td>
                  </tr>
                ) : null}
                {injuredPlayers.map((player) => (
                  <tr
                    key={player.id}
                    className="group border-b border-red-100 bg-red-50/40 transition-colors hover:bg-red-50"
                  >
                    {tableColumns.map((column) => {
                      if (column.key === "today")
                        return (
                          <td
                            key="today"
                            className={getColumnClassName("today")}
                          >
                            <span className="text-[10px] text-red-600">
                              Injured
                            </span>
                          </td>
                        );
                      const cellClassName = [
                        getColumnClassName(column.key, column.className),
                        column.key === "player" ? "group-hover:bg-red-50" : "",
                      ].join(" ");
                      const isTodayNonAppearance =
                        table.view === "today" && Number(player.GP) <= 0;
                      const isPlayerIdentityColumn =
                        column.key === "player" ||
                        column.key === "pos" ||
                        column.key === "dailyPos";
                      const content =
                        table.view === "today" &&
                        (!table.hasToday || isTodayNonAppearance) &&
                        !isPlayerIdentityColumn
                          ? "—"
                          : renderPlayerStatCell(player, column.key);
                      const designation = matchupPlayerInjuryDesignation(
                        player,
                        injuries,
                      );

                      return column.key === "player" ? (
                        <th
                          key={`${player.id}-${column.key}`}
                          scope="row"
                          className={cellClassName}
                          aria-label={formatMatchupPlayerName(player)}
                        >
                          <div className="flex min-w-0 items-center gap-1.5">
                            {renderNhlTeamCell(player)}
                            <span
                              className="truncate text-red-700"
                              title={formatMatchupPlayerName(player)}
                            >
                              {abbreviatePlayerName(content)}
                            </span>
                            {designation ? (
                              <span className="inline-flex shrink-0 rounded bg-red-100 px-1 py-0.5 text-[10px] font-semibold leading-tight text-red-700">
                                {designation}
                              </span>
                            ) : null}
                          </div>
                        </th>
                      ) : (
                        <td
                          key={`${player.id}-${column.key}`}
                          className={cellClassName}
                        >
                          {content}
                          {table.view === "week" && column.key !== "Rating" ? (
                            <PerformanceRecordBadge
                              records={records}
                              entityId={(team?.id ?? "") + ":" + player.id}
                              stat={column.key}
                              value={content}
                            />
                          ) : null}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </TableViewport>
    </section>
  );
}
