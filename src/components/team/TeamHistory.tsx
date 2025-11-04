"use client";

/**
 * @fileoverview Team History Component
 *
 * Complete team history display showing all-time record, filterable matchups,
 * and detailed game results. Includes filters for season, game type, and owner.
 *
 * Uses `useTeamHistoryData` hook for all data fetching and filtering logic,
 * with utilities for win/loss calculations and formatting.
 *
 * @module components/team/TeamHistory
 */

import React, { useState, useEffect } from "react";
import Image from "next/image";
import {
  type TeamHistoryProps,
  type FilterDropdownsProps,
  type RecordDisplayProps,
  type MatchupListProps,
  type TeamHistoryMatchupLineProps,
  calculateWinPercentage,
  getMatchupHeaderText,
  getMatchupBackgroundColor,
  getScoreColor,
  SEASON_SPLIT_INITIAL,
} from "@gshl-utils";
import { useTeamHistoryData } from "@gshl-hooks";

// Import your actual LoadingSpinner component here
declare const LoadingSpinner: React.ComponentType;

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * FilterDropdowns Component
 *
 * Provides dropdown filters for season, game type, and owner selection.
 */
const FilterDropdowns = ({
  seasonValue,
  setSeasonValue,
  gameTypeValue,
  setGameTypeValue,
  ownerValue,
  setOwnerValue,
  seasonOptions,
  gameTypeOptions,
  ownerOptions,
}: FilterDropdownsProps) => {
  return (
    <div className="mx-20 flex flex-col gap-1">
      {/* Season Dropdown */}
      <select
        className="border p-2"
        value={seasonValue}
        onChange={(e) => setSeasonValue(e.target.value)}
      >
        <option value="">Select a Season</option>
        {seasonOptions?.map((season, index) => (
          <option key={index} value={[season.name, season.id].join(",")}>
            {season.name}
          </option>
        ))}
      </select>

      {/* Game Type Dropdown */}
      <select
        className="border p-2"
        value={gameTypeValue}
        onChange={(e) => setGameTypeValue(e.target.value)}
      >
        <option value="" disabled>
          Select a Game Type
        </option>
        {gameTypeOptions.map((option, index) => (
          <option key={index} value={option.join(",")}>
            {option[0]}
          </option>
        ))}
      </select>

      {/* Owner Dropdown */}
      <select
        className="border p-2"
        value={ownerValue}
        onChange={(e) => {
          setOwnerValue(e.target.value);
        }}
      >
        <option value="" disabled>
          Select an Owner
        </option>
        {ownerOptions.map((option, index) => (
          <option key={index} value={option.join(",")}>
            {option[0]}
          </option>
        ))}
      </select>
    </div>
  );
};

/**
 * RecordDisplay Component
 *
 * Displays the all-time win-loss-tie record with win percentage.
 */
const RecordDisplay = ({ winLossRecord }: RecordDisplayProps) => {
  const winPercentage = calculateWinPercentage(winLossRecord);

  return (
    <div className="mt-12 text-xl font-bold">
      <div>All-Time Record:</div>
      <div>
        {winLossRecord[0]}-{winLossRecord[1]}-{winLossRecord[2]} -{" "}
        {winPercentage}%
      </div>
    </div>
  );
};

/**
 * TeamHistoryMatchupLine Component
 *
 * Displays a single matchup line showing both teams, their logos,
 * rankings, scores, and game result with color-coded background.
 */
const TeamHistoryMatchupLine = ({
  matchup,
  teams,
  teamInfo,
}: TeamHistoryMatchupLineProps) => {
  const homeTeam = teams.find((obj) => obj.id === matchup.homeTeamId);
  const awayTeam = teams.find((obj) => obj.id === matchup.awayTeamId);

  if (!homeTeam || !awayTeam) return null;

  // Determine win/loss for the current team
  const isHomeTeam = teamInfo.ownerId === homeTeam.ownerId;
  const isAwayTeam = teamInfo.ownerId === awayTeam.ownerId;

  let winLoss = "";
  if (matchup.tie === true) {
    winLoss = "T";
  } else if (isHomeTeam) {
    winLoss = matchup.homeWin === true ? "W" : "L";
  } else if (isAwayTeam) {
    winLoss = matchup.awayWin === true ? "W" : "L";
  }

  // For score colors, we need to determine if home/away team won
  const homeWinLoss =
    matchup.tie === true ? "T" : matchup.homeWin === true ? "W" : "L";
  const awayWinLoss =
    matchup.tie === true ? "T" : matchup.awayWin === true ? "W" : "L";

  const header = getMatchupHeaderText(matchup);
  const backgroundColor = getMatchupBackgroundColor(winLoss);

  return (
    <>
      <div className="px-8 text-left text-sm font-bold">{header}</div>
      <div
        className={`mb-3 grid grid-cols-7 items-center rounded-xl px-1 py-1 shadow-md ${backgroundColor}`}
      >
        {/* Away Team */}
        <div className="col-span-3 flex flex-col items-center justify-center gap-2 whitespace-nowrap p-2 text-center">
          {matchup.awayRank && +matchup.awayRank <= 8 && matchup.awayRank ? (
            <div className="flex flex-row">
              <span className="xs:text-base pr-1 font-oswald text-sm font-bold text-black">
                {"#" + matchup.awayRank}
              </span>
              {awayTeam.logoUrl ? (
                <Image
                  className="xs:w-12 w-8"
                  src={awayTeam.logoUrl}
                  alt="Away Team Logo"
                  width={48}
                  height={48}
                />
              ) : (
                <div className="xs:w-12 xs:h-12 flex h-8 w-8 items-center justify-center rounded bg-gray-200">
                  <span className="text-xs text-gray-400">?</span>
                </div>
              )}
            </div>
          ) : awayTeam.logoUrl ? (
            <Image
              className="xs:w-12 w-8"
              src={awayTeam.logoUrl}
              alt="Away Team Logo"
              width={48}
              height={48}
            />
          ) : (
            <div className="xs:w-12 xs:h-12 flex h-8 w-8 items-center justify-center rounded bg-gray-200">
              <span className="text-xs text-gray-400">?</span>
            </div>
          )}
          <div className="xs:text-lg font-oswald text-base">
            {awayTeam.name}
          </div>
        </div>

        {/* Score */}
        <div className="xs:text-xl text-center font-oswald text-2xl">
          {matchup.homeScore || matchup.awayScore ? (
            <>
              <span className={getScoreColor(awayWinLoss)}>
                {matchup.awayScore}
              </span>
              {" - "}
              <span className={getScoreColor(homeWinLoss)}>
                {matchup.homeScore}
              </span>
            </>
          ) : (
            "@"
          )}
        </div>

        {/* Home Team */}
        <div className="col-span-3 flex flex-col items-center justify-center gap-2 whitespace-nowrap p-2 text-center">
          {matchup.homeRank && +matchup.homeRank <= 8 && matchup.homeRank ? (
            <div className="flex flex-row">
              <span className="xs:text-base pr-1 font-oswald text-sm font-bold text-black">
                {"#" + matchup.homeRank}
              </span>
              {homeTeam.logoUrl ? (
                <Image
                  className="xs:w-12 w-8"
                  src={homeTeam.logoUrl}
                  alt="Home Team Logo"
                  width={48}
                  height={48}
                />
              ) : (
                <div className="xs:w-12 xs:h-12 flex h-8 w-8 items-center justify-center rounded bg-gray-200">
                  <span className="text-xs text-gray-400">?</span>
                </div>
              )}
            </div>
          ) : homeTeam.logoUrl ? (
            <Image
              className="xs:w-12 w-8"
              src={homeTeam.logoUrl}
              alt="Home Team Logo"
              width={48}
              height={48}
            />
          ) : (
            <div className="xs:w-12 xs:h-12 flex h-8 w-8 items-center justify-center rounded bg-gray-200">
              <span className="text-xs text-gray-400">?</span>
            </div>
          )}
          <div className="xs:text-lg font-oswald text-base">
            {homeTeam.name}
          </div>
        </div>
      </div>
    </>
  );
};

/**
 * MatchupList Component
 *
 * Displays a list of matchups with season dividers, showing game history
 * organized chronologically with season breaks.
 */
const MatchupList = ({ schedule, teams, teamInfo }: MatchupListProps) => {
  const [seasonSplit, setSeasonSplit] = useState(SEASON_SPLIT_INITIAL);

  // Reset season split when schedule changes
  useEffect(() => {
    setSeasonSplit(SEASON_SPLIT_INITIAL);
  }, [schedule]);

  let currentSeasonSplit = seasonSplit;

  return (
    <div className="mx-2 my-8 flex flex-col gap-2">
      {schedule.map((matchup, i) => {
        const shouldShowSeasonDivider = matchup.seasonId !== currentSeasonSplit;

        if (shouldShowSeasonDivider) {
          currentSeasonSplit = matchup.seasonId;
          return (
            <div key={`matchup-${matchup.id}-${i}`}>
              {i !== 0 && (
                <div className="my-6 border-2 border-b border-slate-400"></div>
              )}
              <TeamHistoryMatchupLine
                matchup={matchup}
                teams={teams}
                teamInfo={teamInfo}
              />
            </div>
          );
        }

        return (
          <TeamHistoryMatchupLine
            key={`matchup-${matchup.id}-${i}`}
            matchup={matchup}
            teams={teams}
            teamInfo={teamInfo}
          />
        );
      })}
    </div>
  );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * TeamHistoryContainer Component
 *
 * Main container for team history display with filtering and statistics.
 * Shows all-time record, filterable matchup history, and detailed game results.
 *
 * **Component Responsibilities:**
 * - Render filter dropdowns for season, game type, and opponent
 * - Display all-time win/loss record with percentage
 * - Show chronological list of matchups with results
 * - Organize matchups by season with visual dividers
 *
 * **Data Flow:**
 * - Uses `useTeamHistoryData` hook for data and filter state management
 * - Hook handles: matchup filtering, record calculations, option generation
 * - Component handles: rendering filtered data
 *
 * @param teamInfo - The team whose history is being displayed
 * @returns Team history with filters and matchup list
 *
 * @example
 * ```tsx
 * <TeamHistoryContainer teamInfo={currentTeam} />
 * ```
 */
export function TeamHistoryContainer({ teamInfo }: TeamHistoryProps) {
  const {
    // Filter states
    gameTypeValue,
    setGameTypeValue,
    seasonValue,
    setSeasonValue,
    ownerValue,
    setOwnerValue,

    // Options
    gameTypeOptions,
    seasonOptions,
    ownerOptions,

    // Data
    schedule,
    teams,
    winLossRecord,
    isDataReady,
  } = useTeamHistoryData({ teamInfo });

  if (!isDataReady) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <FilterDropdowns
        seasonValue={seasonValue}
        setSeasonValue={setSeasonValue}
        gameTypeValue={gameTypeValue}
        setGameTypeValue={setGameTypeValue}
        ownerValue={ownerValue}
        setOwnerValue={setOwnerValue}
        seasonOptions={seasonOptions}
        gameTypeOptions={gameTypeOptions}
        ownerOptions={ownerOptions}
      />

      <RecordDisplay winLossRecord={winLossRecord} />

      <MatchupList schedule={schedule!} teams={teams} teamInfo={teamInfo} />
    </>
  );
}
