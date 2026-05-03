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
import { type ToggleItem, type NHLTeam } from "@gshl-types";
import { Table, NHLLogo } from "@gshl-ui";
import { HorizontalToggle, SecondaryPageToolbar } from "@gshl-nav";
import {
  type DraftBoardPlayer,
  type DraftBoardToolbarProps,
  type ProjectedDraftPick,
  formatNumber,
  sortByOverallRank,
  excludeGoalies,
} from "@gshl-utils";
import {
  useDraftBoardData,
  useTeamColor,
  lighten,
  readableText,
} from "@gshl-hooks";

function groupProjectedDraftPicksByRound(
  projectedDraftPicks: ProjectedDraftPick[],
): Array<{
  round: string;
  picks: ProjectedDraftPick[];
}> {
  const rounds = new Map<string, ProjectedDraftPick[]>();

  for (const projectedPick of projectedDraftPicks) {
    const round = String(projectedPick.pick.round);
    const picks = rounds.get(round) ?? [];
    picks.push(projectedPick);
    rounds.set(round, picks);
  }

  return Array.from(rounds.entries()).map(([round, picks]) => ({
    round,
    picks,
  }));
}

function getPlayerNhlAbbreviation(value: unknown): string | null {
  if (Array.isArray(value)) {
    const firstTeam = value.find(
      (team): team is string =>
        typeof team === "string" && team.trim().length > 0,
    );
    return firstTeam ?? null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const team = value.trim();
  return team.length > 0 ? team : null;
}

function findNhlTeamByAbbreviation(
  nhlTeams: NHLTeam[],
  abbreviation: unknown,
): NHLTeam | undefined {
  const normalizedAbbreviation = getPlayerNhlAbbreviation(abbreviation);
  return normalizedAbbreviation
    ? nhlTeams.find((team) => team.abbreviation === normalizedAbbreviation)
    : undefined;
}

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
  projectedPick,
  nhlTeams,
}: {
  projectedPick: ProjectedDraftPick;
  nhlTeams: NHLTeam[];
}) {
  const { pick, projectedPlayer, gshlTeam } = projectedPick;
  const teamColor = useTeamColor(gshlTeam?.logoUrl);
  const base = teamColor ? lighten(teamColor, 0.82) : "#f1f5f9"; // lightened background
  const accent = teamColor ?? "#cbd5e1"; // border uses original or neutral
  // Determine readable text against the actual background (base), not the original team color
  const textColor = readableText(base);
  const projectedPlayerNhlTeam = projectedPlayer
    ? findNhlTeamByAbbreviation(nhlTeams, projectedPlayer.nhlTeam)
    : undefined;

  return (
    <div
      className="mx-auto w-full min-w-[18rem] max-w-[24rem] rounded-md border p-0.5 shadow-sm transition-colors xl:min-w-[22rem]"
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
        <span className="whitespace-nowrap text-lg">{gshlTeam?.name}</span>
        <span className="whitespace-nowrap text-xs font-normal opacity-70">
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
              <span className="whitespace-nowrap text-[13px] font-semibold md:text-sm">
                {projectedPlayer.fullName}
              </span>
              <span className="whitespace-nowrap text-[10px] opacity-75">
                {projectedPlayer.nhlPos.toString()} • Age{" "}
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
}: {
  projectedDraftPicks: ProjectedDraftPick[];
  nhlTeams: NHLTeam[];
  toolbarProps?: DraftBoardToolbarProps;
  title?: string;
}) {
  const rounds = groupProjectedDraftPicksByRound(projectedDraftPicks);

  return (
    <div className="mt-8">
      <h2 className="text-center text-2xl font-bold">{title}</h2>
      <div className="mt-6 flex flex-col gap-6">
        {rounds.map(({ round, picks }) => (
          <section
            key={round}
            className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white/70 p-4 text-left shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="h-px flex-1 bg-slate-300" />
              <span className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-600">
                Round {round}
              </span>
              <div className="h-px flex-1 bg-slate-300" />
            </div>
            <div className="mt-4 grid grid-cols-[repeat(auto-fit,minmax(18rem,1fr))] gap-3 xl:grid-cols-[repeat(auto-fit,minmax(22rem,1fr))]">
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
    projectedDraftPicks,
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
        projectedDraftPicks={projectedDraftPicks}
        nhlTeams={nhlTeams}
        toolbarProps={pageToolbarProps}
      />
    );
  }

  // Apply position filter and sorting for table view
  const displayPlayers = navbarToggle
    ? filteredPlayers.filter(excludeGoalies).sort(sortByOverallRank)
    : filteredPlayers.sort(sortByOverallRank);

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
export function MockDraftPreview({
  seasonId,
  limit,
  title,
}: {
  seasonId: string;
  limit?: number;
  title?: string;
}) {
  const { isLoading, nhlTeams, projectedDraftPicks } = useDraftBoardData({
    seasonId,
    selectedType: "mockdraft",
  });
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
      projectedDraftPicks={
        typeof limit === "number"
          ? projectedDraftPicks.slice(0, limit)
          : projectedDraftPicks
      }
      toolbarProps={undefined}
      nhlTeams={nhlTeams}
      title={title}
    />
  );
}
