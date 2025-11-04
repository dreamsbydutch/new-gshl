"use client";

/**
 * WeeklySchedule Component
 *
 * Displays the weekly schedule of matchups with team logos, rankings,
 * and scores. Shows completed games with color-coded win/loss indicators
 * and upcoming games with an "@" symbol separator.
 *
 * Features:
 * - Color-coded scores (green for wins, red for losses)
 * - Team rankings for top teams
 * - Team logos with fallback placeholders
 * - Different background colors by game type and conference matchup
 * - Responsive grid layout
 *
 * @example
 * ```tsx
 * <WeeklySchedule />
 * ```
 */

import Image from "next/image";
import { LoadingSpinner } from "@gshl-ui";
import { cn } from "@gshl-utils";
import type {
  ScoreDisplayProps,
  TeamDisplayProps,
  WeekScheduleItemProps,
} from "@gshl-utils";
import {
  getGameBackgroundClass,
  getScoreClass,
  isMatchupCompleted,
  isValidMatchup,
  shouldDisplayRanking,
  TEAM_LOGO_DIMENSIONS,
} from "@gshl-utils";
import { findTeamById } from "@gshl-utils/domain/team";
import { useWeeklyScheduleData } from "@gshl-hooks";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

/**
 * ScheduleHeader Component
 *
 * Displays column headers for the weekly schedule table.
 */
const ScheduleHeader = () => {
  return (
    <div className="mx-auto mb-2 grid grid-cols-10 text-center font-varela text-xs font-semibold">
      <div className="col-span-4">Away Team</div>
      <div className="col-span-2">Score</div>
      <div className="col-span-4">Home Team</div>
    </div>
  );
};

/**
 * ScoreDisplay Component
 *
 * Displays the score of a matchup, with color-coded styling for
 * completed games or "@" symbol for upcoming games.
 */
const ScoreDisplay = ({ matchup }: ScoreDisplayProps) => {
  const hasScores = isMatchupCompleted(matchup);

  if (hasScores) {
    return (
      <div className="xs:text-lg col-span-2 text-center font-oswald text-xl">
        <span className={getScoreClass(!!matchup.awayWin, !!matchup.homeWin)}>
          {matchup.awayScore}
        </span>
        {" - "}
        <span className={getScoreClass(!!matchup.homeWin, !!matchup.awayWin)}>
          {matchup.homeScore}
        </span>
      </div>
    );
  }

  return (
    <div className="xs:text-lg col-span-2 text-center font-oswald text-xl">
      @
    </div>
  );
};

/**
 * TeamDisplay Component
 *
 * Displays a team's information including logo, ranking (if applicable),
 * and team name. Handles fallback for missing logos.
 */
const TeamDisplay = ({ team, rank, isAway = false }: TeamDisplayProps) => {
  const showRank = shouldDisplayRanking(rank);

  return (
    <div
      className={cn(
        "col-span-4 flex flex-col items-center justify-center gap-2 whitespace-nowrap p-2 text-center",
      )}
    >
      {showRank ? (
        <div className="flex flex-row">
          <span className="xs:text-base pr-1 font-oswald text-sm font-bold text-black">
            {"#" + rank}
          </span>
          {team.logoUrl ? (
            <Image
              className="xs:w-12 w-8"
              src={team.logoUrl}
              alt={`${isAway ? "Away" : "Home"} Team Logo`}
              width={TEAM_LOGO_DIMENSIONS.width}
              height={TEAM_LOGO_DIMENSIONS.height}
            />
          ) : (
            <div className="xs:w-12 xs:h-12 flex h-8 w-8 items-center justify-center rounded bg-gray-200" />
          )}
        </div>
      ) : team.logoUrl ? (
        <Image
          className="xs:w-12 w-8"
          src={team.logoUrl}
          alt={`${isAway ? "Away" : "Home"} Team Logo`}
          width={TEAM_LOGO_DIMENSIONS.width}
          height={TEAM_LOGO_DIMENSIONS.height}
        />
      ) : (
        <div className="xs:w-12 xs:h-12 flex h-8 w-8 items-center justify-center rounded bg-gray-200" />
      )}
      <div className="xs:text-base text-wrap font-oswald text-sm">
        {team.name}
      </div>
    </div>
  );
};

/**
 * WeekScheduleItem Component
 *
 * Displays a single matchup with both teams, their logos, rankings,
 * and score. Background color varies by game type and conference matchup.
 */
const WeekScheduleItem = ({ matchup, teams }: WeekScheduleItemProps) => {
  const homeTeam = findTeamById(teams, matchup.homeTeamId);
  const awayTeam = findTeamById(teams, matchup.awayTeamId);

  // Show loading if required data is missing or invalid
  if (!isValidMatchup(matchup, homeTeam, awayTeam)) {
    return <LoadingSpinner />;
  }

  const bgClass = getGameBackgroundClass(
    matchup.gameType,
    awayTeam!.confAbbr ?? "",
    homeTeam!.confAbbr ?? "",
  );

  return (
    <div
      className={cn(
        "mx-1 mb-3 grid grid-cols-10 items-center rounded-xl bg-red-400 py-1 shadow-md",
        bgClass,
      )}
    >
      <TeamDisplay
        team={awayTeam!}
        rank={matchup.awayRank?.toString()}
        isAway={true}
      />

      <ScoreDisplay matchup={matchup} />

      <TeamDisplay
        team={homeTeam!}
        rank={matchup.homeRank?.toString()}
        isAway={false}
      />
    </div>
  );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * WeeklySchedule Component
 *
 * Main weekly schedule orchestrator that fetches matchup data and renders
 * the schedule with header and individual matchup items.
 *
 * Uses the useWeeklyScheduleData hook to get the current week's matchups
 * and team information.
 */
export function WeeklySchedule() {
  const { matchups, teams } = useWeeklyScheduleData();

  return (
    <div className="mx-2 mb-40 mt-4">
      <ScheduleHeader />
      <div>
        {matchups.map((matchup) => (
          <WeekScheduleItem
            key={`week-${matchup.id}`}
            matchup={matchup}
            teams={teams}
          />
        ))}
      </div>
    </div>
  );
}
