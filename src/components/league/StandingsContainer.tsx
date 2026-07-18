"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Info } from "lucide-react";

import type {
  Season,
  StandingsGroup,
  StandingsSortState,
  StandingsStatView,
  StandingsTableColumn,
  StandingsTeamRow,
  TeamSeasonStatLine,
} from "@gshl-types";
import {
  calculateStandingsPoints,
  cn,
  formatStandingsDetailStat,
  formatStandingsGaa,
  formatStandingsRecord,
  formatStandingsSvp,
} from "@gshl-utils";

const VIEW_OPTIONS: Array<{
  key: StandingsStatView;
  label: string;
  description: string;
}> = [
  {
    key: "standings",
    label: "Standings",
    description: "Record, points, rank and current form",
  },
  {
    key: "skaters",
    label: "Skaters",
    description: "Every accumulated skater category",
  },
  {
    key: "goalies",
    label: "Goalies",
    description: "Wins, saves and rate statistics",
  },
  {
    key: "roster",
    label: "Roster",
    description: "Usage, availability and team rating",
  },
];

const COLUMNS: Record<StandingsStatView, StandingsTableColumn[]> = {
  standings: [
    { key: "GP", label: "GP", description: "Games played" },
    { key: "record", label: "Record", description: "Team record" },
    {
      key: "standingsPoints",
      label: "PTS",
      description: "Standings points",
    },
    { key: "streak", label: "STRK", description: "Current streak" },
    { key: "powerRk", label: "PR", description: "Power rank" },
  ],
  skaters: [
    { key: "G", label: "G", description: "Goals" },
    { key: "A", label: "A", description: "Assists" },
    { key: "P", label: "P", description: "Points" },
    { key: "PM", label: "+/−", description: "Plus/minus" },
    { key: "PIM", label: "PIM", description: "Penalty minutes" },
    { key: "PPP", label: "PPP", description: "Power-play points" },
    { key: "SOG", label: "SOG", description: "Shots on goal" },
    { key: "HIT", label: "HIT", description: "Hits" },
    { key: "BLK", label: "BLK", description: "Blocks" },
    { key: "TOI", label: "TOI", description: "Time on ice" },
  ],
  goalies: [
    { key: "GS", label: "GS", description: "Goalie starts" },
    { key: "W", label: "W", description: "Goalie wins" },
    { key: "GA", label: "GA", description: "Goals against" },
    {
      key: "GAA",
      label: "GAA",
      description: "Goals-against average",
      format: "gaa",
    },
    { key: "SV", label: "SV", description: "Saves" },
    { key: "SA", label: "SA", description: "Shots against" },
    { key: "SVP", label: "SV%", description: "Save percentage", format: "svp" },
    { key: "SO", label: "SO", description: "Shutouts" },
  ],
  roster: [
    { key: "playersUsed", label: "USED", description: "Players used" },
    { key: "days", label: "DAYS", description: "Roster days used" },
    { key: "MG", label: "MG", description: "Man games" },
    { key: "IR", label: "IR", description: "Injured reserve" },
    { key: "IRplus", label: "IR+", description: "Injured reserve plus" },
    {
      key: "Rating",
      label: "RTG",
      description: "Team rating",
      format: "rating",
    },
    { key: "ADD", label: "ADD", description: "Adds" },
    { key: "MS", label: "MS", description: "Moves" },
    { key: "BS", label: "BS", description: "Bench spots" },
  ],
};

function getRank(
  team: StandingsTeamRow,
  standingsType: string,
  groupTitle: string,
) {
  const stats = team.seasonStats;
  if (!stats) return null;
  if (standingsType === "conference") return stats.conferenceRk;
  if (standingsType === "wildcard") {
    return groupTitle === "Wildcard" || groupTitle === "Out of the Playoffs"
      ? stats.wildcardRk
      : stats.conferenceRk;
  }
  return stats.overallRk;
}

function getCellValue(
  column: StandingsTableColumn,
  team: StandingsTeamRow,
  season: Season,
) {
  const stats = team.seasonStats;
  if (!stats) return "—";
  if (column.key === "record") return formatStandingsRecord(stats, season);
  if (column.key === "standingsPoints") {
    return formatStandingsDetailStat(calculateStandingsPoints(stats, season));
  }

  const value = stats[column.key];
  if (column.format === "gaa") return formatStandingsGaa(value as number);
  if (column.format === "svp") return formatStandingsSvp(value as number);
  if (column.format === "rating") {
    return typeof value === "number" && Number.isFinite(value)
      ? value.toFixed(1)
      : "—";
  }
  return formatStandingsDetailStat(
    value as string | number | null | undefined,
    "—",
  );
}

function compareTeams(
  a: StandingsTeamRow,
  b: StandingsTeamRow,
  sortState: Exclude<StandingsSortState, null>,
) {
  const aRaw = a.seasonStats?.[sortState.key];
  const bRaw = b.seasonStats?.[sortState.key];
  const aValue =
    typeof aRaw === "number" && Number.isFinite(aRaw) ? aRaw : null;
  const bValue =
    typeof bRaw === "number" && Number.isFinite(bRaw) ? bRaw : null;

  if (aValue === null && bValue === null) return 0;
  if (aValue === null) return 1;
  if (bValue === null) return -1;

  return sortState.direction === "asc" ? aValue - bValue : bValue - aValue;
}

function StandingsGroupTable({
  group,
  season,
  standingsType,
  view,
  sortState,
  onSort,
}: {
  group: StandingsGroup;
  season: Season;
  standingsType: string;
  view: StandingsStatView;
  sortState: StandingsSortState;
  onSort: (key: keyof TeamSeasonStatLine) => void;
}) {
  const columns = COLUMNS[view];
  const rows = useMemo(
    () =>
      sortState
        ? [...group.teams].sort((a, b) => compareTeams(a, b, sortState))
        : group.teams,
    [group.teams, sortState],
  );

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 lg:text-base">
            {group.title}
          </h2>
          <p className="mt-0.5 text-xs text-slate-500 lg:text-sm">
            {rows.length} teams
          </p>
        </div>
        <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
          Regular season
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm lg:text-base">
          <thead>
            <tr className="border-b border-slate-200 bg-white text-[11px] uppercase tracking-wider text-slate-500 lg:text-sm">
              <th className="sticky left-0 z-20 w-12 bg-white px-3 py-3 text-center font-medium lg:py-4">
                #
              </th>
              <th className="sticky left-12 z-20 min-w-[220px] bg-white px-3 py-3 text-left font-medium lg:min-w-[260px] lg:py-4">
                Team
              </th>
              {columns.map((column) => {
                const isSortable = view !== "standings";
                const isActive = sortState?.key === column.key;
                const ariaSort = isActive
                  ? sortState.direction === "asc"
                    ? "ascending"
                    : "descending"
                  : "none";

                return (
                  <th
                    key={column.key}
                    className="whitespace-nowrap px-2 py-3 text-center font-medium lg:px-4 lg:py-4"
                    title={column.description}
                    aria-sort={isSortable ? ariaSort : undefined}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        onClick={() =>
                          onSort(column.key as keyof TeamSeasonStatLine)
                        }
                        className={cn(
                          "mx-auto flex items-center justify-center gap-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                          isActive && "text-slate-950",
                        )}
                        title={`Sort by ${column.description}`}
                      >
                        <span>{column.label}</span>
                        {isActive ? (
                          sortState.direction === "asc" ? (
                            <ArrowUp className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDown className="h-3.5 w-3.5" />
                          )
                        ) : (
                          <ArrowUpDown className="h-3.5 w-3.5 text-slate-300" />
                        )}
                      </button>
                    ) : (
                      column.label
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((team, index) => {
              const rank = getRank(team, standingsType, group.title);
              const playoffCut =
                standingsType === "wildcard" &&
                group.title === "Wildcard" &&
                index === 1;

              return (
                <tr
                  key={team.id}
                  className={cn(
                    "group transition-colors hover:bg-slate-50",
                    playoffCut && "border-b-2 border-b-slate-400",
                  )}
                >
                  <td className="sticky left-0 z-10 bg-white px-3 py-3 text-center font-mono text-xs tabular-nums text-slate-500 group-hover:bg-slate-50 lg:py-4 lg:text-sm">
                    {rank ?? index + 1}
                  </td>
                  <td className="sticky left-12 z-10 bg-white px-3 py-2.5 group-hover:bg-slate-50">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-100 bg-slate-50">
                        {team.logoUrl ? (
                          <Image
                            src={team.logoUrl}
                            alt=""
                            width={32}
                            height={32}
                            className="h-8 w-8 object-contain"
                          />
                        ) : (
                          <span className="text-xs font-semibold text-slate-400">
                            {(team.name ?? "TM").slice(0, 2).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-slate-900 lg:text-base">
                          {team.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500 lg:text-xs">
                          {team.confAbbr ?? "League"}
                        </div>
                      </div>
                    </div>
                  </td>
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "whitespace-nowrap px-3 py-3 text-center font-mono text-xs tabular-nums text-slate-700 lg:px-4 lg:py-4 lg:text-base",
                        (column.key === "standingsPoints" ||
                          column.key === "P") &&
                          "font-bold text-slate-950",
                      )}
                    >
                      {getCellValue(column, team, season)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function StandingsTable({
  groups,
  selectedSeason,
  standingsType,
}: {
  groups: StandingsGroup[];
  selectedSeason: Season | null;
  standingsType: string;
}) {
  const [view, setView] = useState<StandingsStatView>("standings");
  const [sortByView, setSortByView] = useState<
    Record<StandingsStatView, StandingsSortState>
  >({
    standings: null,
    skaters: null,
    goalies: null,
    roster: null,
  });

  const handleSort = (key: keyof TeamSeasonStatLine) => {
    setSortByView((current) => {
      const activeSort = current[view];
      const nextSort: StandingsSortState =
        activeSort?.key !== key
          ? { key, direction: "asc" }
          : activeSort.direction === "asc"
            ? { key, direction: "desc" }
            : null;

      return { ...current, [view]: nextSort };
    });
  };

  if (!selectedSeason) {
    return (
      <div className="rounded-xl border border-dashed p-10 text-center text-sm text-slate-500">
        Select a season to view its standings.
      </div>
    );
  }

  const activeView = VIEW_OPTIONS.find((option) => option.key === view)!;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4 px-3 py-4 sm:px-6 lg:py-6">
      <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500 lg:text-sm">
              Team statistics
            </p>
            <h1 className="mt-1 text-xl font-semibold tracking-tight text-slate-950 sm:text-2xl lg:text-3xl">
              {selectedSeason.name} standings
            </h1>
            <p className="mt-1 text-sm text-slate-500 lg:text-base">
              {activeView.description}
            </p>
          </div>
          {view !== "standings" ? (
            <p className="hidden text-sm text-slate-500 lg:block">
              Select a column to sort · select again to reverse
            </p>
          ) : null}
        </div>

        <div
          className="no-scrollbar flex gap-1 overflow-x-auto border-t border-slate-100 pt-3"
          role="tablist"
          aria-label="Standings statistics"
        >
          {VIEW_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="tab"
              aria-selected={view === option.key}
              onClick={() => setView(option.key)}
              className={cn(
                "shrink-0 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors lg:px-4 lg:text-base",
                view === option.key
                  ? "bg-slate-950 text-white"
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2 px-1 text-xs text-slate-500 sm:hidden">
        <Info className="h-3.5 w-3.5" />
        Swipe the table to compare every statistic.
      </div>

      <div className="space-y-4">
        {groups.map((group) => (
          <StandingsGroupTable
            key={group.title}
            group={group}
            season={selectedSeason}
            standingsType={standingsType}
            view={view}
            sortState={sortByView[view]}
            onSort={handleSort}
          />
        ))}
      </div>
    </div>
  );
}

// Backward-compatible export for older imports.
export const StandingsComponent = StandingsGroupTable;
