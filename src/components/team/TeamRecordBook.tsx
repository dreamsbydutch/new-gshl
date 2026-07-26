"use client";

import Image from "next/image";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import {
  AWARD_CATALOG_BY_KEY,
  PLAYER_TROPHY_ICON_URLS,
} from "@gshl-lib/config/awards";
import { useTeamRecordBookView } from "@gshl-hooks";
import type {
  RecordBookPlayerTableProps,
  RecordBookSortableHeadProps,
  RecordBookToolbarProps,
  RecordBookView,
  AwardsList as AwardsListType,
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
import { AwardsList, cn, formatRecordBookStat, SeasonType } from "@gshl-utils";

const RECORD_BOOK_VIEWS: Array<{
  label: string;
  value: RecordBookView;
}> = [
  { label: "Career", value: "career" },
  { label: "By year", value: "season" },
];

const ALL_STAR_TABLE_COLUMNS = [
  {
    award: AwardsList.FIRST_AS,
    label: "1st",
    title: "First Team All-Star selections",
  },
  {
    award: AwardsList.SECOND_AS,
    label: "2nd",
    title: "Second Team All-Star selections",
  },
] as const;

const PLAYER_TROPHY_TABLE_COLUMNS = [
  {
    award: AwardsList.CROSBY,
    iconAward: AwardsList.HART,
    label: "Crosby",
    title: "Crosby Trophy",
  },
  {
    award: AwardsList.LIDSTROM,
    iconAward: AwardsList.NORRIS,
    label: "Lidstrom",
    title: "Lidstrom Trophy",
  },
  {
    award: AwardsList.BRODEUR,
    iconAward: AwardsList.VEZINA,
    label: "Brodeur",
    title: "Brodeur Trophy",
  },
  {
    award: AwardsList.GRETZKY,
    iconAward: AwardsList.ART_ROSS,
    label: "Gretzky",
    title: "Gretzky Trophy",
  },
  {
    award: AwardsList.OVECHKIN,
    iconAward: AwardsList.ROCKET,
    label: "Ovechkin",
    title: "Ovechkin Trophy",
  },
  {
    award: AwardsList.CONN_SMYTHE,
    iconAward: AwardsList.CONN_SMYTHE,
    label: "Conn Smythe",
    title: "Conn Smythe Trophy",
  },
] as const;

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

function AwardColumnHeading({
  iconAward,
  label,
  title,
}: {
  iconAward?: AwardsListType;
  label: string;
  title: string;
}) {
  const imageUrl = iconAward
    ? (PLAYER_TROPHY_ICON_URLS.get(iconAward) ??
      AWARD_CATALOG_BY_KEY.get(iconAward)?.imageUrl)
    : undefined;

  return (
    <span
      className="flex min-w-12 flex-col items-center justify-center gap-0.5"
      title={title}
    >
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt=""
          width={16}
          height={16}
          className="h-4 w-4 object-contain"
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

function AwardCountMarks({
  count,
  iconAward,
  label,
}: {
  count: number | undefined;
  iconAward: AwardsListType;
  label: string;
}) {
  const imageUrl =
    PLAYER_TROPHY_ICON_URLS.get(iconAward) ??
    AWARD_CATALOG_BY_KEY.get(iconAward)?.imageUrl;
  const countLabel = `${count ?? 0} ${label}${count === 1 ? "" : "s"}`;

  if (!count) {
    return (
      <span className="font-mono text-xs text-slate-400" title={countLabel}>
        -
      </span>
    );
  }

  if (!imageUrl) {
    return (
      <span className="font-mono text-xs tabular-nums" title={countLabel}>
        {count}
      </span>
    );
  }

  return (
    <div
      className="flex min-w-8 flex-wrap justify-center gap-0.5"
      aria-label={countLabel}
      title={countLabel}
    >
      {Array.from({ length: count }, (_, index) => (
        <Image
          key={`${iconAward}-${index}`}
          src={imageUrl}
          alt=""
          width={14}
          height={14}
          className="h-3.5 w-3.5 object-contain"
        />
      ))}
    </div>
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
  const playerLeftClass = hasSeasonColumn ? "left-14 sm:left-20" : "left-0";
  const emptyColSpan =
    columns.length +
    ALL_STAR_TABLE_COLUMNS.length +
    PLAYER_TROPHY_TABLE_COLUMNS.length +
    3;

  return (
    <Table
      className={cn(
        "border-collapse text-xs sm:text-sm",
        hasSeasonColumn
          ? "min-w-[1400px] sm:min-w-[1720px]"
          : "min-w-[1380px] sm:min-w-[1680px]",
      )}
    >
      <TableHeader>
        <TableRow className="border-b border-slate-200 bg-slate-50 hover:bg-slate-50">
          {hasSeasonColumn ? (
            <SortableHead
              activeSort={sort}
              align="left"
              className="sticky left-0 z-30 w-14 bg-slate-50 px-1 sm:w-20 sm:px-3"
              label="Season"
              onSort={onSort}
              sortKey="seasonYear"
            />
          ) : null}
          <SortableHead
            activeSort={sort}
            align="left"
            className={cn(
              "sticky z-30 w-[140px] min-w-[140px] max-w-[140px] bg-slate-50 px-1 sm:w-[180px] sm:min-w-[180px] sm:max-w-[180px] sm:px-3 lg:w-[240px] lg:min-w-[240px] lg:max-w-[240px]",
              playerLeftClass,
            )}
            label="Player"
            onSort={onSort}
            sortKey="playerName"
          />
          <SortableHead
            activeSort={sort}
            align="left"
            className="w-12 sm:w-16"
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
          {ALL_STAR_TABLE_COLUMNS.map((column) => (
            <TableHead
              key={column.award}
              className="w-14 px-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
              title={column.title}
            >
              <AwardColumnHeading label={column.label} title={column.title} />
            </TableHead>
          ))}
          {PLAYER_TROPHY_TABLE_COLUMNS.map((column) => (
            <TableHead
              key={column.award}
              className="w-16 px-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
              title={column.title}
            >
              <AwardColumnHeading
                iconAward={column.iconAward}
                label={column.label}
                title={column.title}
              />
            </TableHead>
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
                <TableCell className="sticky left-0 z-20 w-14 bg-white px-1 py-2.5 font-mono text-[10px] font-semibold tabular-nums text-slate-700 group-hover:bg-slate-50 sm:w-20 sm:px-3 sm:text-xs">
                  {row.seasonYear}
                </TableCell>
              ) : null}
              <TableCell
                className={cn(
                  "sticky z-20 w-[140px] min-w-[140px] max-w-[140px] bg-white px-1.5 py-2.5 group-hover:bg-slate-50 sm:w-[180px] sm:min-w-[180px] sm:max-w-[180px] sm:px-3 lg:w-[240px] lg:min-w-[240px] lg:max-w-[240px]",
                  playerLeftClass,
                )}
              >
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
                  <NHLLogo
                    team={row.nhlTeam}
                    size={22}
                    className="mx-0 shrink-0"
                  />
                  <span className="min-w-0 truncate font-semibold text-slate-900">
                    {row.playerName}
                  </span>
                </div>
              </TableCell>
              <TableCell className="w-12 whitespace-nowrap px-2 py-2.5 text-left text-slate-500 sm:w-16 sm:px-3">
                {row.positions || "—"}
              </TableCell>
              {!hasSeasonColumn ? (
                <TableCell className="whitespace-nowrap px-2 py-2.5 text-right font-mono tabular-nums text-slate-600 sm:px-3">
                  <span className="font-semibold text-slate-900">
                    {row.seasonCount || "—"}
                  </span>
                  {row.firstSeason && row.lastSeason ? (
                    <span className="ml-1.5 hidden text-[10px] text-slate-400 sm:inline">
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
                  className="whitespace-nowrap px-2 py-2.5 text-right font-mono tabular-nums text-slate-700 sm:px-3"
                >
                  {formatRecordBookStat(row, column)}
                </TableCell>
              ))}
              {ALL_STAR_TABLE_COLUMNS.map((column) => (
                <TableCell
                  key={`${row.id}-${column.award}`}
                  className="whitespace-nowrap px-1 py-2.5 text-center font-mono tabular-nums text-slate-700"
                >
                  {(row.awardCounts[column.award] ?? 0) === 0
                    ? "-"
                    : row.awardCounts[column.award]}
                </TableCell>
              ))}
              {PLAYER_TROPHY_TABLE_COLUMNS.map((column) => (
                <TableCell
                  key={`${row.id}-${column.award}`}
                  className="px-1 py-2.5 text-center"
                >
                  <AwardCountMarks
                    count={row.awardCounts[column.award]}
                    iconAward={column.iconAward}
                    label={column.title}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}

export function TeamRecordBook(props: TeamRecordBookProps) {
  const {
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
