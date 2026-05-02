"use client";

/**
 * @fileoverview Team Roster Component
 *
 * Complete team roster display showing lineup positions, bench players,
 * and rating legend. Displays player cards with NHL team logos, ratings,
 * and optional salary information.
 *
 * Uses `useTeamRosterData` hook for roster organization and lineup building,
 * with utilities for salary formatting and rating color coding.
 *
 * @module components/team/TeamRoster
 */

import { useMemo } from "react";
import Image from "next/image";
import {
  ContractStatus,
  type Contract,
  type Player,
  type NHLTeam,
} from "@gshl-types";
import {
  cn,
  formatNumber,
  formatMoney,
  getRatingColorClass,
  CAP_CEILING,
  RATING_RANGES,
  toNumber,
} from "@gshl-utils";
import type { TeamRosterProps } from "@gshl-utils";
import { useTeamRosterData, useNHLTeams } from "@gshl-hooks";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * PlayerCard Component
 *
 * Displays individual player information including name, position,
 * NHL team logo, rating, and optional salary.
 */
interface PlayerCardProps {
  player: Player;
  contract?: Contract;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}

const PlayerCard = ({
  player,
  contract,
  showSalaries,
  nhlTeamByAbbr,
}: PlayerCardProps) => {
  const playerNhlAbbr = getPlayerNhlAbbreviation(player);
  const playerNhlTeam = playerNhlAbbr
    ? nhlTeamByAbbr.get(playerNhlAbbr)
    : undefined;
  const playerSalary = toNumber(player.salary, 0);
  const ratingValue =
    typeof player.seasonRating === "number" &&
    Number.isFinite(player.seasonRating)
      ? formatNumber(player.seasonRating, 2)
      : "--";

  return (
    <div className="col-span-2 grid grid-cols-2 px-2 text-center">
      <div className="col-span-3 text-sm">{player.fullName}</div>
      <div className="text-2xs">{player.nhlPos?.toString() ?? ""}</div>
      <div>
        {playerNhlTeam?.logoUrl ? (
          <Image
            src={playerNhlTeam.logoUrl}
            alt={playerNhlTeam.fullName ?? playerNhlAbbr ?? "NHL Team Logo"}
            className="mx-auto h-4 w-4"
            width={16}
            height={16}
          />
        ) : (
          <span className="text-2xs font-semibold">{playerNhlAbbr ?? "-"}</span>
        )}
      </div>
      <div
        className={cn(
          "max-w-fit place-self-center rounded-lg px-2 text-2xs",
          getRosterRatingClass(player.seasonRk),
        )}
      >
        {ratingValue}
      </div>
      <div
        className={cn(
          "col-span-3 my-1 rounded-xl text-2xs",
          contract?.expiryStatus === ContractStatus.RFA
            ? "text-orange-700"
            : "text-gray-900",
          !showSalaries && "hidden",
        )}
      >
        {player.isSignable && playerSalary > 0 && formatMoney(playerSalary)}
      </div>
    </div>
  );
};

/**
 * RosterLineup Component
 *
 * Displays the main roster lineup organized by position groups
 * with dividers between sections.
 */
interface RosterLineupProps {
  teamLineup: (Player | null)[][][];
  contracts: Contract[] | undefined;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}

export const RosterLineup = ({
  teamLineup,
  contracts,
  showSalaries,
  nhlTeamByAbbr,
}: RosterLineupProps) => {
  return (
    <div className="mx-auto flex max-w-md flex-col rounded-xl border bg-gray-50">
      {teamLineup.map((lineupSection, sectionIndex) => {
        return (
          <div key={sectionIndex}>
            {lineupSection.map((positionalArray, i) => {
              return (
                <div key={i} className="grid grid-cols-6 items-center py-1.5">
                  {positionalArray.map((player, j) => {
                    if (!player) {
                      return <div key={j} className="col-span-1"></div>;
                    }
                    const contract = contracts?.find(
                      (b) => b.playerId === player.id,
                    );
                    return (
                      <PlayerCard
                        key={j}
                        player={player}
                        contract={contract}
                        showSalaries={showSalaries}
                        nhlTeamByAbbr={nhlTeamByAbbr}
                      />
                    );
                  })}
                </div>
              );
            })}
            {sectionIndex < 2 && (
              <div className="mx-auto w-4/6 border-b border-gray-400"></div>
            )}
          </div>
        );
      })}
    </div>
  );
};

/**
 * BenchPlayers Component
 *
 * Displays players who are not in the main lineup positions,
 * organized in a 2-column grid layout.
 */
interface BenchPlayersProps {
  benchPlayers: Player[];
  contracts: Contract[] | undefined;
  showSalaries: boolean;
  nhlTeamByAbbr: Map<string, NHLTeam>;
}

export const BenchPlayers = ({
  benchPlayers,
  contracts,
  showSalaries,
  nhlTeamByAbbr,
}: BenchPlayersProps) => {
  if (benchPlayers.length === 0) return null;

  return (
    <div className="mx-auto mt-2 flex max-w-md flex-col rounded-xl border bg-brown-50">
      <div className="mx-2 my-1 grid grid-cols-2 items-center">
        {benchPlayers.map((player, i) => {
          const contract = contracts?.find((b) => b.playerId === player.id);
          const playerNhlAbbr = getPlayerNhlAbbreviation(player);
          const playerNhlTeam = playerNhlAbbr
            ? nhlTeamByAbbr.get(playerNhlAbbr)
            : undefined;
          const playerSalary = toNumber(player.salary, 0);
          const ratingValue =
            typeof player.seasonRating === "number" &&
            Number.isFinite(player.seasonRating)
              ? formatNumber(player.seasonRating, 2)
              : "--";

          return (
            <div key={i} className="my-2 grid grid-cols-2 px-2 text-center">
              <div className="col-span-3 text-sm">{player?.fullName}</div>
              <div className="text-2xs">{player?.nhlPos?.toString() ?? ""}</div>
              <div>
                {playerNhlTeam?.logoUrl ? (
                  <Image
                    src={playerNhlTeam.logoUrl}
                    alt={playerNhlAbbr ?? "NHL Team Logo"}
                    className="mx-auto h-4 w-4"
                    width={16}
                    height={16}
                  />
                ) : (
                  <span className="text-2xs font-semibold">
                    {playerNhlAbbr ?? "-"}
                  </span>
                )}
              </div>
              <div
                className={cn(
                  "max-w-fit place-self-center rounded-lg px-2 text-2xs",
                  getRosterRatingClass(player.seasonRk),
                )}
              >
                {ratingValue}
              </div>
              <div
                className={cn(
                  "col-span-3 my-1 rounded-xl text-2xs",
                  contract?.expiryStatus === ContractStatus.RFA
                    ? "text-orange-700"
                    : "text-gray-900",
                  !showSalaries && "hidden",
                )}
              >
                {player.isSignable &&
                  playerSalary > 0 &&
                  formatMoney(playerSalary)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/**
 * RatingLegend Component
 *
 * Displays a legend showing the color coding for player ratings.
 */
const RatingLegend = () => {
  return (
    <div className="my-2 flex justify-center gap-2">
      {RATING_RANGES.map((rating) => (
        <div
          key={rating.range}
          className={`max-w-fit place-self-center rounded-lg px-2 text-2xs ${rating.class}`}
        >
          {rating.range}
        </div>
      ))}
    </div>
  );
};

/**
 * CapSpaceDisplay Component
 *
 * Displays the team's remaining salary cap space.
 */
interface CapSpaceDisplayProps {
  contracts: Contract[] | undefined;
  showSalaries: boolean;
  totalCapHit: number;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const CapSpaceDisplay = ({
  contracts,
  showSalaries,
  totalCapHit,
}: CapSpaceDisplayProps) => {
  if (!showSalaries) return null;

  return (
    <div className="font-medum mx-auto pb-4 text-center text-lg">
      Cap Space - {contracts && formatMoney(CAP_CEILING - totalCapHit)}
    </div>
  );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * TeamRoster Component
 *
 * Displays a team's complete roster organized by position with ratings and salaries.
 * Shows main lineup positions, bench players, and rating legend.
 *
 * **Component Responsibilities:**
 * - Display organized lineup by position groups
 * - Show bench players in grid layout
 * - Render rating legend for color coding
 * - Display player details (position, NHL team, rating, salary)
 *
 * **Data Flow:**
 * - Uses `useTeamRosterData` hook for roster organization
 * - Hook handles: lineup building, bench identification, cap calculations
 * - Component handles: rendering organized data
 *
 * @param players - Array of all players
 * @param contracts - Array of player contracts
 * @param currentTeam - The current team being displayed
 * @returns Complete roster display with lineup and bench
 *
 * @example
 * ```tsx
 * <TeamRoster
 *   players={allPlayers}
 *   contracts={teamContracts}
 *   currentTeam={team}
 * />
 * ```
 */
export function TeamRoster({
  players,
  contracts,
  currentTeam,
  showSalaries = false,
}: TeamRosterProps) {
  const { teamLineup, benchPlayers } = useTeamRosterData({
    players,
    contracts,
    currentTeam,
  });
  const { data: nhlTeamsData } = useNHLTeams();
  const nhlTeamByAbbr = useMemo(() => {
    return ((nhlTeamsData ?? []) as NHLTeam[]).reduce((map, team) => {
      if (team.abbreviation) {
        map.set(team.abbreviation, team);
      }
      return map;
    }, new Map<string, NHLTeam>());
  }, [nhlTeamsData]);

  return (
    <>
      <div className="mx-auto mt-12 text-center text-xl font-bold">
        Current Roster
      </div>

      <RosterLineup
        teamLineup={teamLineup}
        contracts={contracts}
        showSalaries={showSalaries}
        nhlTeamByAbbr={nhlTeamByAbbr}
      />

      <BenchPlayers
        benchPlayers={benchPlayers}
        contracts={contracts}
        showSalaries={showSalaries}
        nhlTeamByAbbr={nhlTeamByAbbr}
      />

      <RatingLegend />
    </>
  );
}

function getPlayerNhlAbbreviation(player: Player): string | null {
  const rawTeam: unknown = player.nhlTeam;

  if (Array.isArray(rawTeam)) {
    const firstTeam = rawTeam.find(
      (team): team is string =>
        typeof team === "string" && team.trim().length > 0,
    );
    return firstTeam ?? null;
  }

  if (typeof rawTeam !== "string") {
    return null;
  }

  const value = rawTeam.trim();
  return value.length > 0 ? value : null;
}

function getRosterRatingClass(seasonRk: Player["seasonRk"]) {
  return typeof seasonRk === "number" && Number.isFinite(seasonRk)
    ? getRatingColorClass(seasonRk)
    : "bg-gray-200 text-gray-700";
}
