"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, Search, Trophy } from "lucide-react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { useTeamRecordBookView } from "@gshl-hooks";
import type {
  RecordBookAwardRow,
  RecordBookPlayerTableProps,
  RecordBookSortableHeadProps,
  RecordBookToolbarProps,
  RecordBookView,
  SeasonType as SeasonTypeValue,
  TeamRecordBookProps,
} from "@gshl-types";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@gshl-ui";
import { cn, formatRecordBookStat, SeasonType } from "@gshl-utils";

const RECORD_BOOK_VIEWS: Array<{
  label: string;
  value: RecordBookView;
}> = [
  { label: "Career", value: "career" },
  { label: "By year", value: "season" },
];

function getSeasonTypeLabel(seasonType: SeasonTypeValue): string {
  if (seasonType === SeasonType.PLAYOFFS) return "Playoffs";
  if (seasonType === SeasonType.LOSERS_TOURNAMENT) return "Losers";
  return "Regular";
}

function SortableHead({
  activeSort,
  align = "right",
  className,
  label,
  onSort,
  sortKey,
  title,
}: RecordBookSortableHeadProps) {
  const isActive = activeSort.key === sortKey;
  const ariaSort = isActive
    ? activeSort.direction === "asc"
      ? "ascending"
      : "descending"
    : "none";

  return (
    <TableHead
      aria-sort={ariaSort}
      className={cn(
        "h-11 whitespace-nowrap px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:px-3 sm:text-[11px]",
        align === "left" ? "text-left" : "text-right",
        className,
      )}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex w-full items-center gap-1 rounded px-1 py-1 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
          align === "left" ? "justify-start" : "justify-end",
          isActive && "text-slate-950",
        )}
        title={title ? `Sort by ${title}` : `Sort by ${label}`}
      >
        <span>{label}</span>
        {isActive ? (
          activeSort.direction === "asc" ? (
            <ArrowUp className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
          )
        ) : (
          <ArrowUpDown className="h-3 w-3 text-slate-300" aria-hidden="true" />
        )}
      </button>
    </TableHead>
  );
}

function RecordBookToolbar({
  group,
  onGroupChange,
  onQueryChange,
  onSeasonTypeChange,
  onViewChange,
  playerCount,
  query,
  seasonType,
  seasonTypes,
  view,
}: RecordBookToolbarProps) {
  const visibleCount = playerCount;

  return (
    <>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-3 py-2 sm:px-4">
        <div
          role="tablist"
          aria-label="Player record view"
          className="flex items-center rounded-lg bg-slate-100 p-1"
        >
          {RECORD_BOOK_VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              role="tab"
              aria-selected={view === option.value}
              onClick={() => onViewChange(option.value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:text-sm",
                view === option.value
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-900",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span className="font-mono text-xs tabular-nums text-slate-400">
          {visibleCount} {visibleCount === 1 ? "row" : "rows"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2.5 sm:px-4">
        <div
          className="flex items-center rounded-md border border-slate-200 bg-white p-0.5"
          aria-label="Player group"
        >
          {(["skater", "goalie"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={group === option}
              onClick={() => onGroupChange(option)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:text-xs",
                group === option
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-900",
              )}
            >
              {option === "goalie" ? "Goalies" : "Skaters"}
            </button>
          ))}
        </div>
        <div
          className="flex items-center rounded-md border border-slate-200 bg-white p-0.5"
          aria-label="Season stage"
        >
          {seasonTypes.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={seasonType === option}
              onClick={() => onSeasonTypeChange(option)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:text-xs",
                seasonType === option
                  ? "bg-slate-900 text-white"
                  : "text-slate-500 hover:text-slate-900",
              )}
            >
              {getSeasonTypeLabel(option)}
            </button>
          ))}
        </div>

        <label className="relative ml-auto min-w-[150px] flex-1 sm:max-w-[240px]">
          <span className="sr-only">Search player records</span>
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Player"
            className="h-8 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-xs text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
          />
        </label>
      </div>
    </>
  );
}

function PlayerHistoryTable({
  columns,
  onSort,
  rows,
  sort,
  view,
}: RecordBookPlayerTableProps) {
  const hasSeasonColumn = view === "season";
  const playerLeftClass = hasSeasonColumn ? "left-20" : "left-0";
  const emptyColSpan = columns.length + (hasSeasonColumn ? 3 : 3);

  return (
    <Table
      className={cn(
        "border-collapse text-xs sm:text-sm",
        hasSeasonColumn ? "min-w-[1120px]" : "min-w-[1080px]",
      )}
    >
      <TableHeader>
        <TableRow className="border-b border-slate-200 bg-slate-50 hover:bg-slate-50">
          {hasSeasonColumn ? (
            <SortableHead
              activeSort={sort}
              align="left"
              className="sticky left-0 z-30 w-20 bg-slate-50"
              label="Season"
              onSort={onSort}
              sortKey="seasonYear"
            />
          ) : null}
          <SortableHead
            activeSort={sort}
            align="left"
            className={cn(
              "sticky z-30 min-w-[210px] bg-slate-50 sm:min-w-[240px]",
              playerLeftClass,
            )}
            label="Player"
            onSort={onSort}
            sortKey="playerName"
          />
          <SortableHead
            activeSort={sort}
            align="left"
            className="w-16"
            label="Pos"
            onSort={onSort}
            sortKey="positions"
          />
          {!hasSeasonColumn ? (
            <SortableHead
              activeSort={sort}
              label="Years"
              onSort={onSort}
              sortKey="seasonCount"
              title="Seasons with owner"
            />
          ) : null}
          {columns.map((column) => (
            <SortableHead
              key={column.key}
              activeSort={sort}
              label={column.label}
              onSort={onSort}
              sortKey={column.key}
              title={column.title}
            />
          ))}
        </TableRow>
      </TableHeader>
      <TableBody className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={emptyColSpan}
              className="h-40 text-center text-sm text-slate-400"
            >
              No player history found.
            </TableCell>
          </TableRow>
        ) : (
          rows.map((row) => (
            <TableRow
              key={row.id}
              className="group border-0 bg-white hover:bg-slate-50"
            >
              {hasSeasonColumn ? (
                <TableCell className="sticky left-0 z-20 w-20 bg-white px-3 py-2.5 font-mono font-semibold tabular-nums text-slate-700 group-hover:bg-slate-50">
                  {row.seasonYear}
                </TableCell>
              ) : null}
              <TableCell
                className={cn(
                  "sticky z-20 min-w-[210px] bg-white px-3 py-2.5 group-hover:bg-slate-50 sm:min-w-[240px]",
                  playerLeftClass,
                )}
              >
                <div className="flex items-center gap-2.5">
                  <NHLLogo
                    team={row.nhlTeam}
                    size={22}
                    className="mx-0 shrink-0"
                  />
                  <span className="truncate font-semibold text-slate-900">
                    {row.playerName}
                  </span>
                </div>
              </TableCell>
              <TableCell className="whitespace-nowrap px-3 py-2.5 text-left text-slate-500">
                {row.positions || "—"}
              </TableCell>
              {!hasSeasonColumn ? (
                <TableCell className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {row.seasonCount || "—"}
                  </span>
                  {row.firstSeason && row.lastSeason ? (
                    <span className="ml-1.5 text-[10px] text-slate-400">
                      {row.firstSeason === row.lastSeason
                        ? row.firstSeason
                        : `${row.firstSeason}–${row.lastSeason}`}
                    </span>
                  ) : null}
                </TableCell>
              ) : null}
              {columns.map((column) => (
                <TableCell
                  key={`${row.id}-${column.key}`}
                  className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-slate-700"
                >
                  {formatRecordBookStat(row, column)}
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

function getPlayerAwardGroups(rows: RecordBookAwardRow[]) {
  const groupedRows = rows.reduce((groups, row) => {
    const awardRows = groups.get(row.award) ?? [];
    awardRows.push(row);
    groups.set(row.award, awardRows);
    return groups;
  }, new Map<RecordBookAwardRow["award"], RecordBookAwardRow[]>());

  return Array.from(groupedRows, ([award, awardRows]) => ({
    award,
    awardLabel: awardRows[0]?.awardLabel ?? award,
    rows: awardRows,
  })).sort((left, right) => left.awardLabel.localeCompare(right.awardLabel));
}

function PlayerAwardTrophyCase({ rows }: { rows: RecordBookAwardRow[] }) {
  const awardGroups = getPlayerAwardGroups(rows);

  return (
    <section className="rounded-2xl border border-amber-200 bg-[radial-gradient(circle_at_top,_rgba(254,243,199,0.9),_rgba(255,251,235,0.68)_42%,_rgba(255,255,255,0.96)_100%)] p-3 font-varela shadow-sm sm:p-5">
      <div className="mx-auto max-w-3xl text-center">
        <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full border border-amber-300 bg-amber-100 text-amber-700 shadow-sm">
          <Trophy className="h-5 w-5" aria-hidden="true" />
        </div>
        <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-700">
          Player honors
        </p>
        <h2 className="mt-1 font-oswald text-2xl text-slate-950 sm:text-3xl">
          Player Trophy Case
        </h2>
        <p className="mt-1 text-xs text-slate-500 sm:text-sm">
          Every player trophy and all-star selection earned by this owner.
        </p>
      </div>

      {awardGroups.length === 0 ? (
        <div className="mx-auto mt-5 max-w-xl rounded-xl border border-dashed border-amber-300 bg-white/70 px-4 py-8 text-center text-sm text-slate-500">
          No player honors have been recorded yet.
        </div>
      ) : (
        <div className="mx-auto mt-5 grid max-w-6xl gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {awardGroups.map((group) => (
            <article
              key={group.award}
              className="mx-auto flex w-full max-w-[20rem] flex-col items-center rounded-xl border border-amber-100 bg-white/80 p-3 text-center shadow-sm"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                <Trophy className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-2 text-sm font-bold text-slate-900">
                {group.awardLabel}
              </h3>
              <div className="mt-1 border-b border-amber-100 pb-2">
                <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
                  {group.rows.length}{" "}
                  {group.rows.length === 1 ? "honor" : "honors"}
                </span>
              </div>
              <div className="mt-2 w-full space-y-2 text-left">
                {group.rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-white px-2.5 py-2"
                  >
                    <span className="w-12 shrink-0 font-mono text-xs font-semibold tabular-nums text-slate-500">
                      {row.seasonYear}
                    </span>
                    <NHLLogo
                      team={row.nhlTeam}
                      size={20}
                      className="mx-0 shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold text-slate-900">
                        {row.playerName}
                      </p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400">
                        {row.positions || "—"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export function TeamRecordBook(props: TeamRecordBookProps) {
  const {
    awardRows,
    columns,
    group,
    onGroupChange,
    onSeasonTypeChange,
    onSort,
    onViewChange,
    playerRows,
    query,
    seasonType,
    seasonTypes,
    setQuery,
    sort,
    view,
  } = useTeamRecordBookView(props);

  return (
    <section className="pb-12 pt-2">
      <div className="mx-auto max-w-[96rem] px-3 sm:px-4">
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <h2 className="font-oswald text-2xl text-slate-950 sm:text-3xl">
            Player history
          </h2>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
            Owner record book
          </span>
        </div>

        <PlayerAwardTrophyCase rows={awardRows} />

        <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:rounded-2xl">
          <RecordBookToolbar
            group={group}
            onGroupChange={onGroupChange}
            onQueryChange={setQuery}
            onSeasonTypeChange={onSeasonTypeChange}
            onViewChange={onViewChange}
            playerCount={playerRows.length}
            query={query}
            seasonType={seasonType}
            seasonTypes={seasonTypes}
            view={view}
          />
          <PlayerHistoryTable
            columns={columns}
            onSort={onSort}
            rows={playerRows}
            sort={sort}
            view={view}
          />
        </div>
      </div>
    </section>
  );
}
