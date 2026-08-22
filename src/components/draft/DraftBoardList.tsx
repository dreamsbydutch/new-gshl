"use client";

/**
 * DraftBoardList Component
 *
 * Displays draft-eligible players in various views including a mock draft
 * with team colors and a filterable table view by position. Shows player
 * ratings, NHL team affiliations, physical attributes, and projected picks.
 *
 * Features:
 * - Mock draft view with team branding and projected picks
 * - Table view with position filtering (All, F, C, LW, RW, D, G, Wildcard)
 * - Player ratings (season and overall)
 * - Physical attributes (age, height, weight, handedness)
 * - NHL team logos
 * - Responsive design with mobile optimization
 *
 * @example
 * ```tsx
 * // Full draft board with all filters
 * <DraftBoardList seasonId="12" />
 *
 * // Mock draft preview for homepage (no toolbar)
 * <MockDraftPreview seasonId="12" />
 * ```
 */

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  type MockDraftDisplayNhlTeam,
  type MockDraftDisplayPick,
  type MockDraftPreviewProps,
  type MockDraftProps,
  type ToggleItem,
  type NHLTeam,
} from "@gshl-types";
import { Table } from "@gshl-ui";
import { NHLLogo } from "@gshl-components/player/NHLLogo";
import { HorizontalToggle, SecondaryPageToolbar } from "@gshl-nav";
import { DraftBoardTableSkeleton, MockDraftSkeleton } from "@gshl-skeletons";
import {
  type DraftBoardPlayer,
  type DraftBoardToolbarProps,
  cn,
  findNhlTeamByAbbreviation,
  formatNumber,
  groupProjectedDraftPicksByRound,
  selectHomeMockDraftPreview,
  sortByOverallRank,
  excludeGoalies,
} from "@gshl-utils";
import {
  useDraftBoardData,
  useMockDraftPreview,
  useTeamColor,
  lighten,
  readableText,
} from "@gshl-hooks";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * DraftBoardPlayerListing Component
 *
 * Displays a single player row in the draft board table with all stats.
 */
function DraftBoardPlayerListing({
  player,
  nhlTeams,
}: {
  player: DraftBoardPlayer;
  nhlTeams: NHLTeam[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const nhlTeam = findNhlTeamByAbbreviation(nhlTeams, player.nhlTeam);

  return (
    <tr key={player.id} className="py-2" onClick={() => setIsOpen(!isOpen)}>
      <td className="whitespace-nowrap px-1">{player.overallRk}</td>
      <td className="whitespace-nowrap px-1">
        {isNaN(+formatNumber(player.preDraftRk, 1))
          ? "—"
          : (+formatNumber(player.preDraftRk, 1)).toFixed(1)}
      </td>
      <td>
        <NHLLogo team={nhlTeam} />
      </td>
      <td className="whitespace-nowrap px-2">{player.fullName}</td>
      <td className="whitespace-nowrap px-2">{player.nhlPos.join(", ")}</td>
      <td className="whitespace-nowrap px-2">{player.handedness}</td>
      <td className="whitespace-nowrap px-2">
        {(+formatNumber(player.age, 1)).toFixed(1)}
      </td>
      <td className="whitespace-nowrap px-2">{player.height}</td>
      <td className="whitespace-nowrap px-2">{player.weight}</td>
      <td className="whitespace-nowrap px-2">
        {(+(player.seasonRating ?? 0)).toFixed(2)}
      </td>
      <td className="whitespace-nowrap px-2">
        {(+(player.overallRating ?? 0)).toFixed(2)}
      </td>
    </tr>
  );
}

/**
 * DraftBoardTable Component
 *
 * Displays a table of draft-eligible players with filtering toolbar.
 * Shows player stats including ratings, physical attributes, and NHL team.
 */
function DraftBoardTable({
  navbar,
  draftPlayers,
  nhlTeams,
  toolbarProps,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  navbar?: boolean;
  draftPlayers: DraftBoardPlayer[];
  totalCount: number;
  nhlTeams: NHLTeam[];
  toolbarProps: DraftBoardToolbarProps;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <div className="mt-8">
      <h2 className="mb-1 text-center text-xl font-semibold">
        Best Available{" "}
        {toolbarProps.activeKey === "all"
          ? "Players"
          : toolbarProps.activeKey === "forward"
            ? "Forwards"
            : toolbarProps.activeKey === "center"
              ? "Centers"
              : toolbarProps.activeKey === "leftwing"
                ? "Left Wings"
                : toolbarProps.activeKey === "rightwing"
                  ? "Right Wings"
                  : toolbarProps.activeKey === "defense"
                    ? "Defensemen"
                    : toolbarProps.activeKey === "goalie"
                      ? "Goalies"
                      : toolbarProps.activeKey === "wildcard"
                        ? "Wildcard"
                        : ""}
      </h2>
      <Table className="divide-y divide-gray-200 text-center">
        <thead>
          <tr>
            <th>Ovr Rk</th>
            <th>ADP</th>
            <th>Tm</th>
            <th>Player</th>
            <th>Pos</th>
            <th>Hd</th>
            <th>Age</th>
            <th>Ht</th>
            <th>Wt</th>
            <th className="min-w-20">2024-25 Rating</th>
            <th>Overall Rating</th>
          </tr>
        </thead>
        <tbody>
          {draftPlayers.map((player: DraftBoardPlayer) => (
            <DraftBoardPlayerListing
              key={player.id}
              player={player}
              nhlTeams={nhlTeams}
            />
          ))}
        </tbody>
      </Table>
      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            className="min-h-11 rounded-md border bg-white px-5 py-2 text-sm font-semibold shadow-sm disabled:opacity-60"
            disabled={isLoadingMore}
            onClick={onLoadMore}
          >
            {isLoadingMore ? "Loading…" : "Load more players"}
          </button>
        </div>
      ) : null}
      {!navbar && (
        <SecondaryPageToolbar>
          <HorizontalToggle<ToggleItem<string | null>>
            items={toolbarProps.toolbarKeys}
            selectedItem={
              toolbarProps.toolbarKeys.find(
                (item: ToggleItem<string | null>) =>
                  item.key === toolbarProps.activeKey,
              ) ?? null
            }
            onSelect={(type: ToggleItem<string | null>) =>
              type.setter(type.key)
            }
            getItemKey={(type: ToggleItem<string | null>) => type.key}
            getItemLabel={(type: ToggleItem<string | null>) => type.value}
            itemClassName="text-sm text-nowrap"
            className="no-scrollbar flex flex-row overflow-scroll"
          />
        </SecondaryPageToolbar>
      )}
    </div>
  );
}

/**
 * MockDraftPickCard Component
 *
 * Displays a single draft pick card with team branding, projected player,
 * and stats. Uses team colors for background with readable text contrast.
 */
function MockDraftPickCard({
  projectedPick,
  nhlTeams,
}: {
  projectedPick: MockDraftDisplayPick;
  nhlTeams: MockDraftDisplayNhlTeam[];
}) {
  const { pick, projectedPlayer, gshlTeam } = projectedPick;
  const { teamColor } = useTeamColor(gshlTeam?.logoUrl);
  const base = teamColor ? lighten(teamColor, 0.82) : "#f1f5f9"; // lightened background
  const accent = teamColor ?? "#cbd5e1"; // border uses original or neutral
  // Determine readable text against the actual background (base), not the original team color
  const textColor = readableText(base);
  const projectedPlayerNhlTeam = projectedPlayer
    ? findNhlTeamByAbbreviation(nhlTeams, projectedPlayer.nhlTeam)
    : undefined;

  return (
    <div
      className="mx-auto w-full min-w-0 overflow-hidden rounded-md border p-0.5 shadow-sm transition-colors sm:min-w-[18rem] sm:max-w-[24rem]"
      style={{ backgroundColor: base, borderColor: accent }}
    >
      <div
        className="ml-2 flex flex-row items-center gap-2 font-varela font-semibold sm:ml-4"
        style={{ color: textColor }}
      >
        {gshlTeam?.logoUrl ? (
          <Image
            className="shrink-0 rounded-sm ring-1 ring-white/40"
            src={gshlTeam.logoUrl}
            alt={gshlTeam?.name ?? ""}
            width={28}
            height={28}
          />
        ) : (
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-gray-200 ring-1 ring-white/40 sm:h-8 sm:w-8">
            <span className="text-xs text-gray-400">?</span>
          </div>
        )}
        <span className="truncate text-sm font-semibold sm:text-lg">
          {gshlTeam?.name}
        </span>
        <span className="ml-auto shrink-0 whitespace-nowrap pr-1 text-xs font-normal opacity-70">
          Rd {pick.round}, Pk {pick.pick}
        </span>
      </div>
      <div
        className="rounded p-0.5 text-[11px] leading-tight"
        style={{ color: textColor }}
      >
        {projectedPlayer ? (
          <div className="mx-auto flex w-full min-w-0 flex-row items-center gap-2 px-3 py-1">
            <NHLLogo size={24} team={projectedPlayerNhlTeam} />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold md:text-sm">
                {projectedPlayer.fullName}
              </span>
              <span className="whitespace-nowrap text-[10px] opacity-75">
                {projectedPlayer.nhlPos?.toString() ?? ""} • Age{" "}
                {(+formatNumber(projectedPlayer.age, 1)).toFixed(1)}
              </span>
            </div>
            <div className="ml-auto flex shrink-0 flex-col items-end gap-0.5 text-[10px]">
              <span className="whitespace-nowrap">
                24-25{" "}
                {(+formatNumber(projectedPlayer.seasonRating ?? 0, 2)).toFixed(
                  2,
                )}{" "}
                (#{projectedPlayer.seasonRk})
              </span>
              <span className="whitespace-nowrap">
                Ovr{" "}
                {(+formatNumber(projectedPlayer.overallRating ?? 0, 2)).toFixed(
                  2,
                )}{" "}
                (#{projectedPlayer.overallRk})
              </span>
            </div>
          </div>
        ) : (
          <div className="text-[10px] italic opacity-70">
            No projected player for this pick.
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * MockDraftList Component
 *
 * Displays a mock draft with all picks organized by round,
 * showing projected players for each pick with team branding.
 */
function MockDraftList({
  projectedDraftPicks,
  nhlTeams,
  toolbarProps,
  title = "GSHL Mock Draft",
  compact = false,
}: {
  projectedDraftPicks: MockDraftDisplayPick[];
  nhlTeams: MockDraftDisplayNhlTeam[];
  toolbarProps?: DraftBoardToolbarProps;
  title?: string;
  compact?: boolean;
}) {
  const rounds = groupProjectedDraftPicksByRound(projectedDraftPicks);

  return (
    <div className={compact ? "mt-0" : "mt-8"}>
      <h2
        className={cn(
          "text-center font-bold",
          compact ? "text-xl sm:text-2xl" : "text-2xl",
        )}
      >
        {title}
      </h2>
      <div
        className={cn("flex flex-col", compact ? "mt-4 gap-4" : "mt-6 gap-6")}
      >
        {rounds.map(({ round, picks }) => (
          <section
            key={round}
            className={cn(
              "flex h-full flex-col rounded-2xl border border-slate-200 bg-white/70 text-left shadow-sm",
              compact ? "p-3" : "p-4",
            )}
          >
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-300" />
              <span className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-600">
                Round {round}
              </span>
              <div className="h-px flex-1 bg-slate-300" />
            </div>
            <div
              className={cn(
                "grid grid-cols-1 gap-3",
                compact
                  ? "mt-3 sm:grid-cols-2"
                  : "mt-4 sm:grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] xl:grid-cols-[repeat(auto-fit,minmax(22rem,1fr))]",
              )}
            >
              {picks.map((projectedPick) => (
                <MockDraftPickCard
                  key={projectedPick.pick.id}
                  projectedPick={projectedPick}
                  nhlTeams={nhlTeams}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
      {toolbarProps && (
        <SecondaryPageToolbar>
          <HorizontalToggle<ToggleItem<string | null>>
            items={toolbarProps.toolbarKeys}
            selectedItem={
              toolbarProps.toolbarKeys.find(
                (item) => item.key === toolbarProps.activeKey,
              ) ?? null
            }
            onSelect={(type: ToggleItem<string | null>) =>
              type.setter(type.key)
            }
            getItemKey={(type: ToggleItem<string | null>) => type.key}
            getItemLabel={(type: ToggleItem<string | null>) => type.value}
            itemClassName="text-sm text-nowrap"
            className="no-scrollbar flex flex-row overflow-scroll"
          />
        </SecondaryPageToolbar>
      )}
    </div>
  );
}

// ============================================================================
// MAIN EXPORTS
// ============================================================================

/**
 * DraftBoardList Component
 *
 * Main draft board component that provides filtering and display options
 * for draft-eligible players. Supports both table view and mock draft view.
 *
 * @param seasonId - The season ID to display draft data for
 * @param navbarToggle - Whether to show navbar-specific filtering
 */
export function DraftBoardList({
  seasonId,
  navbarToggle = false,
}: {
  seasonId: string;
  navbarToggle?: boolean;
}) {
  const [selectedType, setSelectedType] = useState<string>("all");
  const {
    isLoading,
    draftPlayers,
    filteredPlayers,
    nhlTeams,
    projectedDraftPicks,
    hasMore,
    loadMore,
    isLoadingMore,
  } = useDraftBoardData({ seasonId, selectedType });

  if (isLoading) {
    return <DraftBoardTableSkeleton />;
  }

  const pageToolbarProps: {
    toolbarKeys: ToggleItem<string | null>[];
    activeKey: string | null;
  } = {
    activeKey: selectedType,
    toolbarKeys: [
      {
        key: "mockdraft",
        value: "Mock Draft",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "all",
        value: "All",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "forward",
        value: "F",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "center",
        value: "C",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "leftwing",
        value: "LW",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "rightwing",
        value: "RW",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "defense",
        value: "D",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "goalie",
        value: "G",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
      {
        key: "wildcard",
        value: "WC",
        setter: (type: string | null) => setSelectedType(type ?? ""),
      },
    ],
  };

  if (selectedType === "mockdraft") {
    return (
      <MockDraftList
        projectedDraftPicks={projectedDraftPicks}
        nhlTeams={nhlTeams}
        toolbarProps={pageToolbarProps}
      />
    );
  }

  // Apply position filter and sorting for table view
  const displayPlayers = navbarToggle
    ? filteredPlayers.filter(excludeGoalies).sort(sortByOverallRank)
    : [...filteredPlayers].sort(sortByOverallRank);

  return (
    <DraftBoardTable
      navbar={navbarToggle}
      draftPlayers={displayPlayers}
      totalCount={draftPlayers.length}
      nhlTeams={nhlTeams}
      toolbarProps={pageToolbarProps}
      hasMore={hasMore}
      isLoadingMore={isLoadingMore}
      onLoadMore={() => void loadMore()}
    />
  );
}

/**
 * MockDraftPreview Component
 *
 * Minimal wrapper for homepage that only shows mock draft without toolbar.
 *
 * @param seasonId - The season ID to display mock draft for
 */
export function MockDraftPreview({ seasonId }: MockDraftPreviewProps) {
  const { isLoading, nhlTeams, projectedDraftPicks } =
    useMockDraftPreview(seasonId);
  if (isLoading) {
    return <MockDraftSkeleton compact />;
  }
  const previewPicks = selectHomeMockDraftPreview(projectedDraftPicks);
  return (
    <section aria-label="GSHL mock draft preview">
      <MockDraftList
        projectedDraftPicks={previewPicks}
        toolbarProps={undefined}
        nhlTeams={nhlTeams}
        title="GSHL Mock Draft"
        compact
      />
      <div className="mt-5 flex justify-center">
        <Link
          href="/leagueoffice/mock-draft"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          See the full mock draft
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

/**
 * Full mock draft view for the League Office.
 */
export function MockDraft({ seasonId }: MockDraftProps) {
  const { isLoading, nhlTeams, projectedDraftPicks } = useDraftBoardData({
    seasonId,
    selectedType: "mockdraft",
  });

  if (isLoading) {
    return <MockDraftSkeleton />;
  }

  return (
    <MockDraftList
      projectedDraftPicks={projectedDraftPicks}
      toolbarProps={undefined}
      nhlTeams={nhlTeams}
    />
  );
}
