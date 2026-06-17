"use client";

/**
 * @fileoverview Team Schedule Component
 *
 * Complete team schedule display with expandable matchup details
 * showing per-category stats breakdown. Selected team is always
 * displayed on top of the stats table when expanded.
 *
 * Uses `useTeamScheduleData` hook for schedule data and
 * `useTeamWeeksByWeekId` for detailed stats on demand.
 *
 * @module components/team/TeamSchedule
 */

import { useMemo, useState } from "react";
import Image from "next/image";
import type {
  TeamScheduleItemProps,
  GameResultProps,
  OpponentDisplayProps,
  WeekDisplayProps,
} from "@gshl-utils";
import type {
  GSHLTeam,
  MatchupCategoryConfig,
  TeamWeekStatLine,
} from "@gshl-types";
import {
  getGameLocation,
  getGameTypeDisplay,
  isGameCompleted,
  didTeamWin,
  getResultStyleClass,
  formatTeamScore,
  formatOpponentDisplay,
} from "@gshl-utils";
import { findTeamById } from "@gshl-utils/domain/team";
import { useSeasons, useTeamScheduleData, useTeams } from "@gshl-hooks";

const MATCHUP_CATEGORY_MAP: Record<string, MatchupCategoryConfig> = {
  G: { field: "G", label: "G" },
  A: { field: "A", label: "A" },
  P: { field: "P", label: "P" },
  PM: { field: "PM", label: "+/-" },
  PIM: { field: "PIM", label: "PIM" },
  PPP: { field: "PPP", label: "PPP" },
  SOG: { field: "SOG", label: "SOG" },
  HIT: { field: "HIT", label: "HIT" },
  BLK: { field: "BLK", label: "BLK" },
  W: { field: "W", label: "W" },
  GA: { field: "GA", label: "GA" },
  GAA: { field: "GAA", label: "GAA", isInverse: true, precision: 2 },
  SV: { field: "SV", label: "SV" },
  SA: { field: "SA", label: "SA" },
  SVP: { field: "SVP", label: "SV%", precision: 3 },
  SO: { field: "SO", label: "SO" },
};

const FALLBACK_MATCHUP_CATEGORIES: MatchupCategoryConfig[] = [
  MATCHUP_CATEGORY_MAP.G!,
  MATCHUP_CATEGORY_MAP.A!,
  MATCHUP_CATEGORY_MAP.P!,
  MATCHUP_CATEGORY_MAP.PPP!,
  MATCHUP_CATEGORY_MAP.SOG!,
  MATCHUP_CATEGORY_MAP.HIT!,
  MATCHUP_CATEGORY_MAP.BLK!,
  MATCHUP_CATEGORY_MAP.W!,
  MATCHUP_CATEGORY_MAP.GAA!,
  MATCHUP_CATEGORY_MAP.SVP!,
];

function normalizeSeasonCategory(category: unknown): string | null {
  const value = String(category ?? "")
    .trim()
    .toUpperCase();
  if (!value) return null;
  if (value === "SV%") return "SVP";
  return value;
}

function resolveMatchupCategories(
  categories: unknown,
): MatchupCategoryConfig[] {
  const normalized = Array.isArray(categories)
    ? categories.map((category) => normalizeSeasonCategory(category))
    : String(categories ?? "")
        .split(",")
        .map((category) => normalizeSeasonCategory(category));

  const resolved = normalized
    .filter((category): category is string => Boolean(category))
    .map((category) => MATCHUP_CATEGORY_MAP[category])
    .filter((category): category is MatchupCategoryConfig => Boolean(category));

  return resolved.length > 0 ? resolved : FALLBACK_MATCHUP_CATEGORIES;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Determine if team won a specific stat category
 * @param teamValue - The team's stat value
 * @param opponentValue - The opponent's stat value
 * @param isInverse - Whether lower is better (like GAA)
 * @returns True if team won this category
 */
function didWinCategory(
  teamValue: number,
  opponentValue: number,
  isInverse = false,
): boolean {
  if (isInverse) {
    // For GAA, lower is better, but both must be > 0
    return teamValue > 0 && opponentValue > 0 && teamValue < opponentValue;
  }
  return teamValue > opponentValue;
}

/**
 * Get CSS classes for stat category based on win/loss
 */
function getStatCellClass(won: boolean): string {
  return `py-1 text-center ${won ? "font-semibold" : "font-light text-gray-400"}`;
}

/**
 * Get CSS classes for score cell based on win/loss
 */
function getScoreCellClass(won: boolean): string {
  return `justify-center py-1 text-center text-lg ${won ? "font-semibold" : "font-light text-gray-400"}`;
}

function toCategoryNumber(
  stats: TeamWeekStatLine,
  category: MatchupCategoryConfig,
): number {
  const rawValue = stats[category.field];
  return Number(rawValue ?? 0);
}

function formatCategoryValue(
  stats: TeamWeekStatLine,
  category: MatchupCategoryConfig,
): string {
  const value = toCategoryNumber(stats, category);
  if (!Number.isFinite(value)) return "0";
  if (category.precision !== undefined)
    return value.toFixed(category.precision);
  return String(value);
}

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * Team schedule table header
 * Displays column labels for week, opponent, and score
 */
function TeamScheduleHeader() {
  return (
    <div className="mx-auto mb-2 grid grid-cols-9 text-center font-varela text-xs font-semibold">
      <div className="">Week</div>
      <div className="col-span-6">Opponent</div>
      <div className="col-span-2">Score</div>
    </div>
  );
}

/**
 * Week display component
 * Shows week number or game type label
 */
function WeekDisplay({ week, gameType }: WeekDisplayProps) {
  const display = getGameTypeDisplay(
    gameType,
    week,
    "HOME",
    undefined,
    undefined,
  );

  return <div className="place-self-center font-varela">{display.label}</div>;
}

/**
 * Opponent display component
 * Formats and displays opponent team name with home/away indicator
 */
function OpponentDisplay({
  matchup,
  homeTeam,
  awayTeam,
  gameLocation,
}: OpponentDisplayProps) {
  const opponentText = formatOpponentDisplay(
    gameLocation,
    matchup,
    homeTeam,
    awayTeam,
  );

  return (
    <div className="col-span-6 place-self-center font-varela text-base">
      {opponentText}
    </div>
  );
}

/**
 * Game result display component
 * Shows W/L and score for completed games
 */
function GameResult({ matchup, selectedTeamId, week }: GameResultProps) {
  if (!isGameCompleted(week)) {
    return null;
  }

  const teamWon = didTeamWin(matchup, selectedTeamId);
  const styleClass = getResultStyleClass(matchup, selectedTeamId);
  const scoreText = formatTeamScore(matchup, selectedTeamId);

  return (
    <div
      className={`col-span-2 my-auto text-center font-varela text-sm ${styleClass}`}
    >
      <span className="pr-2">{teamWon ? "W" : "L"}</span>
      <span>{scoreText}</span>
    </div>
  );
}

/**
 * Team logo cell component
 */
function TeamLogoCell({ team }: { team?: GSHLTeam | null }) {
  if (!team?.logoUrl) return <td className="w-6" />;

  return (
    <td className="w-6">
      <Image
        src={team.logoUrl}
        alt={team.name ?? "Team"}
        width={24}
        height={24}
        className="h-6 w-6"
      />
    </td>
  );
}

/**
 * Stat category headers row
 */
function StatHeadersRow({
  categories,
}: {
  categories: MatchupCategoryConfig[];
}) {
  const headers = [
    "",
    "Score",
    ...categories.map((category) => category.label),
  ];

  return (
    <tr className="rounded-lg bg-gray-100 text-gray-600">
      {headers.map((header, idx) => (
        <td
          key={idx}
          className={`py-1 text-center text-[10px] ${idx > 1 ? "min-w-4" : ""}`}
        >
          {header}
        </td>
      ))}
    </tr>
  );
}

/**
 * Team stats row component
 * Displays all stats for a team with conditional styling based on category wins
 */
interface TeamStatsRowProps {
  team?: GSHLTeam | null;
  teamStats: TeamWeekStatLine;
  opponentStats: TeamWeekStatLine;
  teamScore: number | null;
  opponentScore: number | null;
  categories: MatchupCategoryConfig[];
}

function TeamStatsRow({
  team,
  teamStats,
  opponentStats,
  teamScore,
  opponentScore,
  categories,
}: TeamStatsRowProps) {
  const scoreWon = Number(teamScore) > Number(opponentScore);
  const categoryStates = categories.map((category) => {
    const teamValue = toCategoryNumber(teamStats, category);
    const opponentValue = toCategoryNumber(opponentStats, category);
    const won = didWinCategory(teamValue, opponentValue, category.isInverse);
    return {
      key: String(category.field),
      won,
      display: formatCategoryValue(teamStats, category),
    };
  });

  return (
    <tr>
      <TeamLogoCell team={team} />
      <td className={getScoreCellClass(scoreWon)}>{teamScore}</td>
      {categoryStates.map((categoryState) => (
        <td
          key={categoryState.key}
          className={getStatCellClass(categoryState.won)}
        >
          {categoryState.display}
        </td>
      ))}
    </tr>
  );
}

/**
 * Matchup stats table component
 * Displays detailed stats breakdown with selected team always on top
 */
interface MatchupStatsTableProps {
  selectedTeam: GSHLTeam | null;
  selectedTeamStats: TeamWeekStatLine;
  selectedTeamScore: number | null;
  opponentTeam: GSHLTeam | null;
  opponentStats: TeamWeekStatLine;
  opponentScore: number | null;
  categories: MatchupCategoryConfig[];
}

function MatchupStatsTable({
  selectedTeam,
  selectedTeamStats,
  selectedTeamScore,
  opponentTeam,
  opponentStats,
  opponentScore,
  categories,
}: MatchupStatsTableProps) {
  return (
    <div className="mx-auto w-5/6 py-1.5">
      <table className="w-full text-xs">
        <tbody>
          {/* Selected Team Row (always on top) */}
          <TeamStatsRow
            team={selectedTeam}
            teamStats={selectedTeamStats}
            opponentStats={opponentStats}
            teamScore={selectedTeamScore}
            opponentScore={opponentScore}
            categories={categories}
          />

          {/* Header Row */}
          <StatHeadersRow categories={categories} />

          {/* Opponent Team Row (always on bottom) */}
          <TeamStatsRow
            team={opponentTeam}
            teamStats={opponentStats}
            opponentStats={selectedTeamStats}
            teamScore={opponentScore}
            opponentScore={selectedTeamScore}
            categories={categories}
          />
        </tbody>
      </table>
    </div>
  );
}

/**
 * Team schedule item component
 * Displays a single matchup with expandable stats detail
 * Selected team is always shown on top of the stats table
 */
function TeamScheduleItem({
  matchup,
  week,
  teams,
  selectedTeamId,
  categories,
}: TeamScheduleItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const homeTeam = findTeamById(teams, matchup.homeTeamId);
  const awayTeam = findTeamById(teams, matchup.awayTeamId);
  const gameLocation = getGameLocation(matchup, selectedTeamId);

  // Determine which team is the selected team
  const isHomeTeamSelected =
    String(matchup.homeTeamId) === String(selectedTeamId);
  const selectedTeam = isHomeTeamSelected ? homeTeam : awayTeam;
  const opponentTeam = isHomeTeamSelected ? awayTeam : homeTeam;

  // Fetch team week stats for this matchup
  const { data: teamWeeksRaw = [] } = useTeams({
    statsLevel: "weekly",
    weekId: String(matchup.weekId),
  });
  const teamWeeks = teamWeeksRaw as TeamWeekStatLine[];

  const homeTeamStats = teamWeeks.find(
    (tw) => String(tw.gshlTeamId) === String(matchup.homeTeamId),
  );
  const awayTeamStats = teamWeeks.find(
    (tw) => String(tw.gshlTeamId) === String(matchup.awayTeamId),
  );

  // Map stats to selected/opponent
  const selectedTeamStats = isHomeTeamSelected ? homeTeamStats : awayTeamStats;
  const opponentStats = isHomeTeamSelected ? awayTeamStats : homeTeamStats;
  const selectedTeamScore = isHomeTeamSelected
    ? matchup.homeScore
    : matchup.awayScore;
  const opponentScore = isHomeTeamSelected
    ? matchup.awayScore
    : matchup.homeScore;

  const gameDisplay = getGameTypeDisplay(
    String(matchup.gameType),
    week,
    gameLocation,
    awayTeam,
    homeTeam,
  );

  const toggleExpanded = () => {
    // Only allow toggle if game is completed
    if (matchup.homeScore !== null || matchup.awayScore !== null) {
      setIsExpanded(!isExpanded);
    }
  };

  const hasStats = selectedTeamStats && opponentStats;

  return (
    <div className="border-b">
      <div
        onClick={toggleExpanded}
        className={`grid grid-cols-9 py-2 ${gameDisplay.className} ${
          matchup.homeScore !== null || matchup.awayScore !== null
            ? "cursor-pointer hover:bg-gray-50"
            : ""
        }`}
      >
        <WeekDisplay week={week} gameType={String(matchup.gameType)} />

        <OpponentDisplay
          matchup={matchup}
          homeTeam={homeTeam}
          awayTeam={awayTeam}
          gameLocation={gameLocation}
        />

        <GameResult
          matchup={matchup}
          selectedTeamId={selectedTeamId}
          week={week}
        />
      </div>

      {isExpanded && (
        <>
          {!hasStats ? (
            <div className="mx-auto w-5/6 py-1.5 text-center text-sm text-gray-600">
              Loading stats...
            </div>
          ) : (
            <MatchupStatsTable
              selectedTeam={selectedTeam ?? null}
              selectedTeamStats={selectedTeamStats}
              selectedTeamScore={selectedTeamScore ?? null}
              opponentTeam={opponentTeam ?? null}
              opponentStats={opponentStats}
              opponentScore={opponentScore ?? null}
              categories={categories}
            />
          )}
        </>
      )}
    </div>
  );
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * TeamSchedule Component
 *
 * Displays a team's full schedule with expandable matchup details.
 * Shows week-by-week games with scores and detailed statistical breakdowns.
 *
 * **Component Responsibilities:**
 * - Display schedule grid with week, opponent, and score columns
 * - Provide expandable rows for detailed category-by-category stats
 * - Always show selected team on top of expanded stats table
 * - Handle click interactions for expanding/collapsing matchup details
 *
 * **Data Flow:**
 * - Uses `useTeamScheduleData` hook for schedule and team context
 * - Uses `useTeamWeeksByWeekId` hook on-demand for detailed stats
 * - Hook handles: matchup filtering, sorting, team lookups
 * - Component handles: expansion state, rendering
 *
 * @returns Team schedule with expandable matchup details
 *
 * @example
 * ```tsx
 * <TeamSchedule />
 * ```
 */
export function TeamSchedule() {
  const { selectedTeam, selectedSeasonId, matchups, teams } =
    useTeamScheduleData();
  const { data: selectedSeasonData = [] } = useSeasons({
    seasonId: selectedSeasonId,
    enabled: Boolean(selectedSeasonId),
  });
  const selectedSeason = selectedSeasonData[0] ?? null;
  const matchupCategories = useMemo(
    () => resolveMatchupCategories(selectedSeason?.categories),
    [selectedSeason?.categories],
  );

  if (!selectedTeam) {
    return (
      <div className="mx-2 mb-40 mt-4">
        <div className="text-center text-gray-500">No team selected</div>
      </div>
    );
  }

  return (
    <div className="mx-2 mb-40 mt-4">
      <TeamScheduleHeader />
      <div>
        {matchups
          .sort((a, b) => (a.week?.weekNum ?? 0) - (b.week?.weekNum ?? 0))
          .map(({ matchup, week }) => (
            <TeamScheduleItem
              key={`team-${matchup.id}`}
              matchup={matchup}
              week={week}
              teams={teams}
              selectedTeamId={selectedTeam.id}
              categories={matchupCategories}
            />
          ))}
      </div>
    </div>
  );
}
