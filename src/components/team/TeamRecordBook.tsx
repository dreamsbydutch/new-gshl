"use client";

import Image from "next/image";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { CompactPlayerName } from "@gshl-components/player/CompactPlayerName";
import { NHLLogoList } from "@gshl-components/player/NHLLogoList";
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
import { TableViewport } from "@gshl-ui";
import {
  AwardsList,
  cn,
  formatRecordBookStat,
  getRecordBookVisibleAwards,
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
    label: "1st Team",
    title: "First Team All-Star selections",
  },
  {
    award: AwardsList.SECOND_AS,
    label: "2nd Team",
    title: "Second Team All-Star selections",
  },
] as const;

const PLAYER_TROPHY_TABLE_COLUMNS = [
  {
    award: AwardsList.CROSBY,
    iconAward: AwardsList.HART,
    label: "Player MVP",
    title: "Player MVP",
  },
  {
    award: AwardsList.LIDSTROM,
    iconAward: AwardsList.NORRIS,
    label: "Best Dman",
    title: "Best Dman",
  },
  {
    award: AwardsList.BRODEUR,
    iconAward: AwardsList.VEZINA,
    label: "Best G",
    title: "Best G",
  },
  {
    award: AwardsList.GRETZKY,
    iconAward: AwardsList.ART_ROSS,
    label: "Most Pts",
    title: "Most Pts",
  },
  {
    award: AwardsList.OVECHKIN,
    iconAward: AwardsList.ROCKET,
    label: "Most G",
    title: "Most G",
  },
  {
    award: AwardsList.CONN_SMYTHE,
    iconAward: AwardsList.CONN_SMYTHE,
    label: "Playoff MVP",
    title: "Playoff MVP",
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
    <th
      scope="col"
      aria-sort={ariaSort}
      className={cn(
        "whitespace-nowrap px-1 text-xs font-normal text-gray-200",
        align === "left" ? "text-left" : "text-right",
        className,
      )}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "flex min-h-9 w-full items-center gap-1 rounded px-1 py-1 hover:bg-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white",
          align === "left" ? "justify-start" : "justify-end",
          isActive && "font-semibold text-white",
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
      <span className="text-xs text-slate-400" title={countLabel}>
        <span aria-hidden="true">-</span>
        <span className="sr-only">{countLabel}</span>
      </span>
    );
  }

  if (!imageUrl) {
    return (
      <span className="text-xs tabular-nums" title={countLabel}>
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
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 py-1">
        <div
          role="group"
          aria-label="Player record view"
          className="flex items-center gap-1"
        >
          {RECORD_BOOK_VIEWS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={view === option.value}
              onClick={() => onViewChange(option.value)}
              className={cn(
                "min-h-9 rounded px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 sm:text-sm",
                view === option.value
                  ? "bg-slate-100 text-slate-950"
                  : "text-slate-500 hover:text-slate-900",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
        <span
          aria-live="polite"
          className="text-xs tabular-nums text-slate-500"
        >
          {visibleCount} {visibleCount === 1 ? "row" : "rows"}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2 py-2">
        <div
          role="group"
          className="flex items-center gap-0.5"
          aria-label="Player group"
        >
          {(["skater", "goalie"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={group === option}
              onClick={() => onGroupChange(option)}
              className={cn(
                "min-h-9 rounded px-2 py-1 text-xs font-semibold capitalize transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                group === option
                  ? "bg-slate-100 text-slate-950"
                  : "text-slate-500 hover:text-slate-900",
              )}
            >
              {option === "goalie" ? "Goalies" : "Skaters"}
            </button>
          ))}
        </div>
        <div
          role="group"
          className="flex items-center gap-0.5"
          aria-label="Season stage"
        >
          {seasonTypes.map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={seasonType === option}
              onClick={() => onSeasonTypeChange(option)}
              className={cn(
                "min-h-9 rounded px-2 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
                seasonType === option
                  ? "bg-slate-100 text-slate-950"
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
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm text-slate-900 outline-none transition-shadow placeholder:text-slate-400 focus:ring-2 focus:ring-slate-300"
          />
        </label>
      </div>
    </>
  );
}

function PlayerHistoryTable({
  columns,
  group,
  seasonType,
  onSort,
  rows,
  sort,
  view,
}: RecordBookPlayerTableProps) {
  const visibleAwards = getRecordBookVisibleAwards(group, seasonType);
  const allStarColumns = ALL_STAR_TABLE_COLUMNS.filter((column) =>
    visibleAwards.includes(column.award),
  );
  const trophyColumns = PLAYER_TROPHY_TABLE_COLUMNS.filter((column) =>
    visibleAwards.includes(column.award),
  );
  const hasSeasonColumn = view === "season";
  const emptyColSpan =
    columns.length + allStarColumns.length + trophyColumns.length + 5;

  return (
    <table className="mx-auto min-w-max border-collapse whitespace-nowrap text-xs">
      <caption className="sr-only">
        {view === "career" ? "Career" : "Season-by-season"} player records,
        including complete statistics and honors
      </caption>
      <thead>
        <tr className="bg-gray-800 text-gray-200">
          <SortableHead
            activeSort={sort}
            align="left"
            className="sticky left-0 z-30 w-28 min-w-28 max-w-28 bg-gray-800 px-2 lg:w-auto lg:max-w-none"
            label="Player"
            onSort={onSort}
            sortKey="playerName"
          />
          {hasSeasonColumn ? (
            <SortableHead
              activeSort={sort}
              align="left"
              className="bg-gray-800 px-2"
              label="Season"
              onSort={onSort}
              sortKey="seasonYear"
            />
          ) : null}
          <SortableHead
            activeSort={sort}
            align="left"
            className="w-12 sm:w-16"
            label="Pos"
            onSort={onSort}
            sortKey="positions"
          />
          <th scope="col" className="px-2 font-normal">
            Team
          </th>
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
          <th
            scope="col"
            className="w-14 px-1 text-center text-xs font-normal text-gray-200"
            title="GSHL Cups won with this team"
          >
            <AwardColumnHeading
              iconAward={AwardsList.GSHL_CUP}
              label="Cups"
              title="GSHL Cups won with this team"
            />
          </th>
          {allStarColumns.map((column) => (
            <th
              scope="col"
              key={column.award}
              className="w-14 px-1 text-center text-xs font-normal text-gray-200"
              title={column.title}
            >
              <AwardColumnHeading label={column.label} title={column.title} />
            </th>
          ))}
          {trophyColumns.map((column) => (
            <th
              scope="col"
              key={column.award}
              className="w-16 px-1 text-center text-xs font-normal text-gray-200"
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
              className="group odd:bg-white even:bg-gray-100 hover:bg-slate-200"
            >
              <th
                scope="row"
                className="sticky left-0 z-20 w-28 min-w-28 max-w-28 bg-inherit px-2 py-1 text-left font-normal lg:w-auto lg:max-w-none"
              >
                <CompactPlayerName name={row.playerName} />
              </th>
              {hasSeasonColumn ? (
                <td className="px-2 py-1 tabular-nums">{row.yearsLabel}</td>
              ) : null}
              <td className="w-16 whitespace-nowrap px-2 py-1 text-left text-slate-500">
                {row.positions || "—"}
              </td>
              <td className="px-2 py-1">
                <NHLLogoList teams={row.nhlTeams} size={16} />
              </td>
              {!hasSeasonColumn ? (
                <td className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-slate-600">
                  <span className="font-semibold text-slate-900">
                    {row.seasonCount || "—"}
                  </span>
                  {row.yearsLabel ? (
                    <span className="ml-1.5 text-[10px] text-slate-500">
                      {row.yearsLabel}
                    </span>
                  ) : null}
                </td>
              ) : null}
              {columns.map((column) => (
                <td
                  key={`${row.id}-${column.key}`}
                  className="whitespace-nowrap px-2 py-1 text-right tabular-nums text-slate-700"
                >
                  {formatRecordBookStat(row, column)}
                </td>
              ))}
              <td className="px-1 py-1 text-center">
                <AwardCountMarks
                  count={row.cupCount}
                  iconAward={AwardsList.GSHL_CUP}
                  label="GSHL Cup won with this team"
                />
              </td>
              {allStarColumns.map((column) => (
                <td
                  key={`${row.id}-${column.award}`}
                  className="whitespace-nowrap px-1 py-1 text-center tabular-nums text-slate-700"
                >
                  {(row.awardCounts[column.award] ?? 0) === 0
                    ? "-"
                    : row.awardCounts[column.award]}
                </td>
              ))}
              {trophyColumns.map((column) => (
                <td
                  key={`${row.id}-${column.award}`}
                  className="px-1 py-1 text-center"
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
    <section className="pb-4">
      <div className="mx-auto max-w-[96rem]">
        <div className="mb-3 flex items-baseline justify-between gap-3 px-1">
          <h2 className="text-base font-semibold text-slate-950">
            Player history
          </h2>
          <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
            Owner record book
          </span>
        </div>

        <div className="bg-white">
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
          <TableViewport
            ariaLabel="Complete player record-book statistics"
            scrollHint="Scroll to review every statistic and honor"
            viewportClassName="rounded-none border-0 focus-visible:ring-inset focus-visible:ring-offset-0"
          >
            <PlayerHistoryTable
              group={group}
              seasonType={seasonType}
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
