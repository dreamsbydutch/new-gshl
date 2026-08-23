"use client";

import Image from "next/image";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  Search,
} from "lucide-react";
import { NHLLogoList } from "@gshl-components/player/NHLLogoList";
import {
  AWARD_CATALOG_BY_KEY,
  PLAYER_TROPHY_ICON_URLS,
} from "@gshl-lib/config/awards";
import { useTeamRecordBookView } from "@gshl-hooks";
import type {
  RecordBookPlayerTableProps,
  RecordBookPlayerRow,
  RecordBookGroup,
  RecordBookSortKey,
  RecordBookSortState,
  RecordBookSortableHeadProps,
  RecordBookStatColumn,
  RecordBookToolbarProps,
  RecordBookView,
  AwardsList as AwardsListType,
  SeasonType as SeasonTypeValue,
  TeamRecordBookProps,
} from "@gshl-types";
import { TableViewport } from "@gshl-ui";
import {
  AwardsList,
  cn,
  formatRecordBookStat,
  getRecordBookPriorityColumns,
  SeasonType,
} from "@gshl-utils";

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

const RECORD_BOOK_HONOR_COLUMNS = [
  ...ALL_STAR_TABLE_COLUMNS.map(({ award, label, title }) => ({
    award,
    label,
    title,
  })),
  ...PLAYER_TROPHY_TABLE_COLUMNS.map(({ award, label, title }) => ({
    award,
    label,
    title,
  })),
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
    <th
      scope="col"
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
        aria-label={`${title ? `Sort by ${title}` : `Sort by ${label}`}${
          isActive ? `, currently ${ariaSort}` : ""
        }`}
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
    </th>
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
      <span aria-hidden="true">{label}</span>
      <span className="sr-only">{title}</span>
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
        <span aria-hidden="true">-</span>
        <span className="sr-only">{countLabel}</span>
      </span>
    );
  }

  if (!imageUrl) {
    return (
      <span className="font-mono text-xs tabular-nums" title={countLabel}>
        <span aria-hidden="true">{count}</span>
        <span className="sr-only">{countLabel}</span>
      </span>
    );
  }

  return (
    <span
      className="flex min-w-8 flex-wrap justify-center gap-0.5"
      title={countLabel}
    >
      <span className="sr-only">{countLabel}</span>
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
    </span>
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
          role="group"
          aria-label="Player record view"
          className="flex items-center rounded-lg bg-slate-100 p-1"
        >
          {RECORD_BOOK_VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              onClick={() => onViewChange(option.value)}
              className={cn(
                "min-h-11 rounded-md px-3 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:text-sm",
                view === option.value
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-500 hover:text-slate-900",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span
          aria-live="polite"
          className="font-mono text-xs tabular-nums text-slate-500"
        >
          {visibleCount} {visibleCount === 1 ? "row" : "rows"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2.5 sm:px-4">
        <div
          role="group"
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
                "min-h-11 rounded px-2.5 py-2 text-xs font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
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
          role="group"
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
                "min-h-11 rounded px-2.5 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
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
            className="h-11 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
          />
        </label>
      </div>
    </>
  );
}

function MobileRecordBookSort({
  columns,
  onSort,
  sort,
  view,
}: {
  columns: RecordBookStatColumn[];
  onSort: (key: RecordBookSortKey) => void;
  sort: RecordBookSortState;
  view: RecordBookView;
}) {
  const sortOptions: Array<{ key: RecordBookSortKey; label: string }> = [
    { key: "playerName", label: "Player" },
    { key: "positions", label: "Position" },
    view === "season"
      ? { key: "seasonYear", label: "Season" }
      : { key: "seasonCount", label: "Seasons with owner" },
    ...columns.map((column) => ({
      key: column.key,
      label: column.title,
    })),
  ];
  const sortDirectionLabel =
    sort.direction === "asc" ? "Ascending" : "Descending";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 border-b border-slate-200 bg-white p-3 lg:hidden">
      <label className="min-w-0">
        <span className="mb-1 block text-xs font-semibold text-slate-600">
          Sort records by
        </span>
        <select
          value={sort.key}
          onChange={(event) => onSort(event.target.value as RecordBookSortKey)}
          className="h-11 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-900 outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        >
          {sortOptions.map((option) => (
            <option key={option.key} value={option.key}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => onSort(sort.key)}
        className="mt-5 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        aria-label={`Sort ${sortDirectionLabel === "Ascending" ? "descending" : "ascending"}`}
      >
        {sort.direction === "asc" ? (
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        ) : (
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        )}
        {sortDirectionLabel}
      </button>
    </div>
  );
}

function PlayerHistoryCard({
  columns,
  group,
  row,
  view,
}: {
  columns: RecordBookStatColumn[];
  group: RecordBookGroup;
  row: RecordBookPlayerRow;
  view: RecordBookView;
}) {
  const priorityColumns = getRecordBookPriorityColumns(group, columns);
  const priorityKeys = new Set(priorityColumns.map((column) => column.key));
  const detailColumns = columns.filter(
    (column) => !priorityKeys.has(column.key),
  );
  const seasonRange =
    row.firstSeason && row.lastSeason
      ? row.firstSeason === row.lastSeason
        ? String(row.firstSeason)
        : `${row.firstSeason}–${row.lastSeason}`
      : null;
  const contextLabel =
    view === "season"
      ? `Season ${row.seasonYear ?? "unknown"}`
      : `${row.seasonCount} ${row.seasonCount === 1 ? "season" : "seasons"}${
          seasonRange ? ` · ${seasonRange}` : ""
        }`;

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <header className="flex min-w-0 items-start gap-3 px-3 py-3">
        <NHLLogoList
          teams={row.nhlTeams}
          size={row.nhlTeams.length > 1 ? 22 : 30}
        />
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-sm font-semibold leading-5 text-slate-950">
            {row.playerName}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {row.positions || "Position unavailable"} · {contextLabel}
          </p>
        </div>
      </header>

      <dl className="grid grid-cols-4 border-y border-slate-100 bg-slate-50/80">
        {priorityColumns.map((column) => (
          <div
            key={`${row.id}-priority-${column.key}`}
            className="min-w-0 border-r border-slate-100 px-1.5 py-2.5 text-center last:border-r-0"
          >
            <dt
              className="truncate text-[11px] font-semibold text-slate-500"
              title={column.title}
            >
              <span aria-hidden="true">{column.label}</span>
              <span className="sr-only">{column.title}</span>
            </dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-slate-900">
              {formatRecordBookStat(row, column)}
            </dd>
          </div>
        ))}
      </dl>

      <details className="group">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-slate-700 marker:content-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-400 [&::-webkit-details-marker]:hidden">
          All stats and honors
          <ChevronDown
            className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180"
            aria-hidden="true"
          />
        </summary>
        <div className="border-t border-slate-100 px-3 pb-3 pt-2.5">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Complete statistics
          </h4>
          <dl className="mt-2 grid grid-cols-3 gap-x-3 gap-y-2">
            {detailColumns.map((column) => (
              <div key={`${row.id}-detail-${column.key}`} className="min-w-0">
                <dt
                  className="truncate text-[11px] text-slate-500"
                  title={column.title}
                >
                  <span aria-hidden="true">{column.label}</span>
                  <span className="sr-only">{column.title}</span>
                </dt>
                <dd className="font-mono text-sm font-semibold tabular-nums text-slate-800">
                  {formatRecordBookStat(row, column)}
                </dd>
              </div>
            ))}
          </dl>

          <h4 className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Honors
          </h4>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
            {RECORD_BOOK_HONOR_COLUMNS.map((column) => (
              <div
                key={`${row.id}-honor-${column.award}`}
                className="flex min-w-0 items-baseline justify-between gap-2"
              >
                <dt
                  className="truncate text-xs text-slate-600"
                  title={column.title}
                >
                  <span aria-hidden="true">{column.label}</span>
                  <span className="sr-only">{column.title}</span>
                </dt>
                <dd className="font-mono text-xs font-semibold tabular-nums text-slate-900">
                  {row.awardCounts[column.award] ?? 0}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </article>
  );
}

function PlayerHistoryCards({
  columns,
  group,
  onSort,
  rows,
  sort,
  view,
}: RecordBookPlayerTableProps & { group: RecordBookGroup }) {
  return (
    <div className="bg-slate-50/70 lg:hidden">
      <MobileRecordBookSort
        columns={columns}
        onSort={onSort}
        sort={sort}
        view={view}
      />
      {rows.length === 0 ? (
        <p
          role="status"
          className="px-4 py-12 text-center text-sm text-slate-500"
        >
          No player history found.
        </p>
      ) : (
        <ol className="space-y-3 p-3" aria-label="Player record results">
          {rows.map((row) => (
            <li key={row.id}>
              <PlayerHistoryCard
                columns={columns}
                group={group}
                row={row}
                view={view}
              />
            </li>
          ))}
        </ol>
      )}
    </div>
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
  const emptyColSpan =
    columns.length +
    ALL_STAR_TABLE_COLUMNS.length +
    PLAYER_TROPHY_TABLE_COLUMNS.length +
    3;

  return (
    <table
      className={cn(
        "border-collapse text-xs sm:text-sm",
        hasSeasonColumn
          ? "min-w-[1400px] sm:min-w-[1720px]"
          : "min-w-[1380px] sm:min-w-[1680px]",
      )}
    >
      <caption className="sr-only">
        {view === "career" ? "Career" : "Season-by-season"} player records,
        including complete statistics and honors
      </caption>
      <thead>
        <tr className="border-b border-slate-200 bg-slate-50">
          {hasSeasonColumn ? (
            <SortableHead
              activeSort={sort}
              align="left"
              className="sticky left-0 z-30 w-20 bg-slate-50 px-3"
              label="Season"
              onSort={onSort}
              sortKey="seasonYear"
            />
          ) : null}
          <SortableHead
            activeSort={sort}
            align="left"
            className={cn(
              "sticky z-30 w-[240px] min-w-[240px] max-w-[240px] bg-slate-50 px-3",
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
            <th
              scope="col"
              key={column.award}
              className="w-14 px-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
              title={column.title}
            >
              <AwardColumnHeading label={column.label} title={column.title} />
            </th>
          ))}
          {PLAYER_TROPHY_TABLE_COLUMNS.map((column) => (
            <th
              scope="col"
              key={column.award}
              className="w-16 px-1 text-center text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
              title={column.title}
            >
              <AwardColumnHeading
                iconAward={column.iconAward}
                label={column.label}
                title={column.title}
              />
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.length === 0 ? (
          <tr>
            <td
              colSpan={emptyColSpan}
              className="h-40 text-center text-sm text-slate-400"
            >
              No player history found.
            </td>
          </tr>
        ) : (
          rows.map((row) => (
            <tr
              key={row.id}
              className="group border-0 bg-white hover:bg-slate-50"
            >
              {hasSeasonColumn ? (
                <td className="sticky left-0 z-20 w-20 bg-white px-3 py-2.5 font-mono text-xs font-semibold tabular-nums text-slate-700 group-hover:bg-slate-50">
                  {row.seasonYear}
                </td>
              ) : null}
              <th
                scope="row"
                className={cn(
                  "sticky z-20 w-[240px] min-w-[240px] max-w-[240px] bg-white px-3 py-2.5 text-left font-normal group-hover:bg-slate-50",
                  playerLeftClass,
                )}
              >
                <div className="flex min-w-0 items-center gap-1.5 sm:gap-2.5">
                  <NHLLogoList
                    teams={row.nhlTeams}
                    size={row.nhlTeams.length > 1 ? 18 : 22}
                  />
                  <span className="min-w-0 truncate font-semibold text-slate-900">
                    {row.playerName}
                  </span>
                </div>
              </th>
              <td className="w-16 whitespace-nowrap px-3 py-2.5 text-left text-slate-500">
                {row.positions || "—"}
              </td>
              {!hasSeasonColumn ? (
                <td className="whitespace-nowrap px-3 py-2.5 text-right font-mono tabular-nums text-slate-600">
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
                </td>
              ) : null}
              {columns.map((column) => (
                <td
                  key={`${row.id}-${column.key}`}
                  className="whitespace-nowrap px-2 py-2.5 text-right font-mono tabular-nums text-slate-700 sm:px-3"
                >
                  {formatRecordBookStat(row, column)}
                </td>
              ))}
              {ALL_STAR_TABLE_COLUMNS.map((column) => (
                <td
                  key={`${row.id}-${column.award}`}
                  className="whitespace-nowrap px-1 py-2.5 text-center font-mono tabular-nums text-slate-700"
                >
                  {(row.awardCounts[column.award] ?? 0) === 0
                    ? "-"
                    : row.awardCounts[column.award]}
                </td>
              ))}
              {PLAYER_TROPHY_TABLE_COLUMNS.map((column) => (
                <td
                  key={`${row.id}-${column.award}`}
                  className="px-1 py-2.5 text-center"
                >
                  <AwardCountMarks
                    count={row.awardCounts[column.award]}
                    iconAward={column.iconAward}
                    label={column.title}
                  />
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
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
          <PlayerHistoryCards
            columns={columns}
            group={group}
            onSort={onSort}
            rows={playerRows}
            sort={sort}
            view={view}
          />
          <TableViewport
            ariaLabel="Complete player record-book statistics"
            className="hidden lg:block"
            scrollHint="Scroll to review every statistic and honor"
            viewportClassName="rounded-none border-0 focus-visible:ring-inset focus-visible:ring-offset-0"
          >
            <PlayerHistoryTable
              columns={columns}
              onSort={onSort}
              rows={playerRows}
              sort={sort}
              view={view}
            />
          </TableViewport>
        </div>
      </div>
    </section>
  );
}
