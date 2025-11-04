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
import {
  type ToggleItem,
  type DraftPick,
  type NHLTeam,
  type GSHLTeam,
} from "@gshl-types";
import { Table, NHLLogo } from "@gshl-ui";
import { HorizontalToggle, SecondaryPageToolbar } from "@gshl-nav";
import {
  type DraftBoardPlayer,
  type DraftBoardToolbarProps,
  formatNumber,
  sortByPreDraftRank,
  excludeGoalies,
} from "@gshl-utils";
import {
  useDraftBoardData,
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
  return (
    <tr key={player.id} className="py-2" onClick={() => setIsOpen(!isOpen)}>
      <td className="whitespace-nowrap px-1">{player.overallRk}</td>
      <td className="whitespace-nowrap px-1">
        {isNaN(+formatNumber(player.preDraftRk, 1))
          ? "—"
          : (+formatNumber(player.preDraftRk, 1)).toFixed(1)}
      </td>
      <td>
        <NHLLogo
          team={nhlTeams.find(
            (t: NHLTeam) => t.abbreviation === player.nhlTeam.toString(),
          )}
        />
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
}: {
  navbar?: boolean;
  draftPlayers: DraftBoardPlayer[];
  totalCount: number;
  nhlTeams: NHLTeam[];
  toolbarProps: DraftBoardToolbarProps;
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
  pick,
  index,
  draftPlayers,
  nhlTeams,
  gshlTeam,
}: {
  pick: DraftPick;
  index: number;
  draftPlayers: DraftBoardPlayer[];
  nhlTeams: NHLTeam[];
  gshlTeam: GSHLTeam | undefined;
}) {
  const projectedPlayer: DraftBoardPlayer | undefined = draftPlayers[index];
  const teamColor = useTeamColor(gshlTeam?.logoUrl);
  const base = teamColor ? lighten(teamColor, 0.82) : "#f1f5f9"; // lightened background
  const accent = teamColor ?? "#cbd5e1"; // border uses original or neutral
  // Determine readable text against the actual background (base), not the original team color
  const textColor = readableText(base);
  return (
    <div
      className="w-[350px] rounded-md border p-0.5 shadow-sm transition-colors"
      style={{ backgroundColor: base, borderColor: accent }}
    >
      <div
        className="ml-4 flex flex-row items-center gap-2 font-varela font-semibold"
        style={{ color: textColor }}
      >
        {gshlTeam?.logoUrl ? (
          <Image
            className="shrink-0 rounded-sm ring-1 ring-white/40"
            src={gshlTeam.logoUrl}
            alt={gshlTeam?.name ?? ""}
            width={32}
            height={32}
          />
        ) : (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm bg-gray-200 ring-1 ring-white/40">
            <span className="text-xs text-gray-400">?</span>
          </div>
        )}
        <span className="text-lg">{gshlTeam?.name}</span>
        <span className="text-xs font-normal opacity-70">
          Rd {pick.round}, Pk {pick.pick}
        </span>
      </div>
      <div
        className="rounded p-0.5 text-[11px] leading-tight"
        style={{ color: textColor }}
      >
        {projectedPlayer ? (
          <div className="mx-auto flex max-w-[250px] flex-row items-center">
            <NHLLogo
              size={24}
              team={nhlTeams.find(
                (t: NHLTeam) =>
                  t.abbreviation === projectedPlayer.nhlTeam.toString(),
              )}
            />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[13px] font-semibold md:text-sm">
                {projectedPlayer.fullName}
              </span>
              <span className="text-center text-[10px] opacity-75">
                {projectedPlayer.nhlPos.toString()} • Age{" "}
                {(+formatNumber(projectedPlayer.age, 1)).toFixed(1)}
              </span>
            </div>
            <div className="ml-auto flex flex-col items-end gap-0.5 text-[10px]">
              <span>
                24-25{" "}
                {(+formatNumber(projectedPlayer.seasonRating ?? 0, 2)).toFixed(
                  2,
                )}{" "}
                (#{projectedPlayer.seasonRk})
              </span>
              <span>
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
  seasonDraftPicks,
  draftPlayers,
  nhlTeams,
  gshlTeams,
  toolbarProps,
}: {
  seasonDraftPicks: DraftPick[];
  draftPlayers: DraftBoardPlayer[];
  nhlTeams: NHLTeam[];
  gshlTeams: GSHLTeam[];
  toolbarProps?: DraftBoardToolbarProps;
}) {
  return (
    <div className="mt-8 text-center">
      <h2 className="mb-4 text-2xl font-bold">GSHL Mock Draft</h2>
      <div className="flex flex-col gap-1">
        {seasonDraftPicks.map((dp: DraftPick, i: number) => {
          const gshlTeam = gshlTeams.find(
            (team: GSHLTeam) => team.id === dp.gshlTeamId,
          );
          const showRoundHeader =
            i === 0 || seasonDraftPicks[i - 1]?.round !== dp.round;
          return (
            <div key={dp.id} className="flex flex-col items-center gap-1">
              {showRoundHeader && (
                <div className="mt-4 flex items-center gap-2">
                  <div className="h-px flex-1 bg-gray-300" />
                  <span className="m-2 text-lg font-semibold uppercase tracking-wide text-gray-600">
                    Round {dp.round}
                  </span>
                  <div className="h-px flex-1 bg-gray-300" />
                </div>
              )}
              <MockDraftPickCard
                pick={dp}
                index={i}
                draftPlayers={draftPlayers}
                nhlTeams={nhlTeams}
                gshlTeam={gshlTeam}
              />
            </div>
          );
        })}
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
  seasonId = "12",
  navbarToggle = false,
}: {
  seasonId?: string;
  navbarToggle?: boolean;
}) {
  const [selectedType, setSelectedType] = useState<string>("all");
  const {
    isLoading,
    draftPlayers,
    filteredPlayers,
    nhlTeams,
    gshlTeams,
    seasonDraftPicks,
  } = useDraftBoardData({ seasonId, selectedType });

  if (isLoading) {
    return (
      <div className="mt-6">
        <h2 className="mb-1 text-xl font-semibold">Draft Board</h2>
        <p className="text-gray-500">Loading players...</p>
      </div>
    );
  }

  const pageToolbarProps: {
    toolbarKeys: ToggleItem<string | null>[];
    activeKey: string | null;
    className?: [string?, string?, string?];
  } = {
    className: ["bottom-24 h-8", "h-6", "text-xs"],
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
        seasonDraftPicks={seasonDraftPicks}
        draftPlayers={draftPlayers}
        nhlTeams={nhlTeams}
        gshlTeams={gshlTeams}
        toolbarProps={pageToolbarProps}
      />
    );
  }

  // Apply position filter and sorting for table view
  const displayPlayers = navbarToggle
    ? filteredPlayers.filter(excludeGoalies).sort(sortByPreDraftRank)
    : filteredPlayers.sort(sortByPreDraftRank);

  return (
    <DraftBoardTable
      navbar={navbarToggle}
      draftPlayers={displayPlayers}
      totalCount={draftPlayers.length}
      nhlTeams={nhlTeams}
      toolbarProps={pageToolbarProps}
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
export function MockDraftPreview({ seasonId = "12" }: { seasonId?: string }) {
  const { isLoading, draftPlayers, nhlTeams, gshlTeams, seasonDraftPicks } =
    useDraftBoardData({ seasonId, selectedType: "mockdraft" });
  if (isLoading) {
    return (
      <div className="mt-6 text-center">
        <h2 className="mb-1 text-xl font-semibold">GSHL Mock Draft</h2>
        <p className="text-gray-500">Loading mock draft...</p>
      </div>
    );
  }
  return (
    <MockDraftList
      seasonDraftPicks={seasonDraftPicks}
      draftPlayers={draftPlayers}
      toolbarProps={undefined}
      nhlTeams={nhlTeams}
      gshlTeams={gshlTeams}
    />
  );
}
