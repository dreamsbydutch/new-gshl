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
const WeekScheduleItem = ({
  matchup,
  teams,
  teamWeekStatsByTeam,
}: WeekScheduleItemProps) => {
  const homeTeam = findTeamById(teams, matchup.homeTeamId);
  const awayTeam = findTeamById(teams, matchup.awayTeamId);
  const homeTeamStats = teamWeekStatsByTeam[matchup.homeTeamId];
  const awayTeamStats = teamWeekStatsByTeam[matchup.awayTeamId];

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
        "mx-1 mb-3 flex flex-col items-center rounded-xl py-1 shadow-md",
        bgClass,
      )}
    >
      <div className="grid w-full grid-cols-10 items-center">
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
      {awayTeamStats && homeTeamStats ? (
        <table className="my-2 w-11/12 justify-evenly text-center text-xs">
          <thead>
            <tr className="border-b font-bold">
              <td></td>
              <td>G</td>
              <td>A</td>
              <td>P</td>
              <td>PPP</td>
              <td>SOG</td>
              <td>HIT</td>
              <td>BLK</td>
              <td>W</td>
              <td>GAA</td>
              <td>SVP</td>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <Image
                  src={awayTeam!.logoUrl ?? ""}
                  alt={`${awayTeam!.name} Logo`}
                  className="mr-1 inline-block h-4 w-4"
                />
              </td>
              <td
                className={
                  Number(awayTeamStats.G) > Number(homeTeamStats.G)
                    ? "font-semibold"
                    : ""
                }
              >
                {awayTeamStats.G}
              </td>
              <td
                className={
                  Number(awayTeamStats.A) > Number(homeTeamStats.A)
                    ? "font-semibold"
                    : ""
                }
              >
                {awayTeamStats.A}
              </td>
              <td
                className={
                  Number(awayTeamStats.P) > Number(homeTeamStats.P)
                    ? "font-semibold"
                    : ""
                }
              >
                {awayTeamStats.P}
              </td>
              <td
                className={
                  Number(awayTeamStats.PPP) > Number(homeTeamStats.PPP)
                    ? "font-semibold"
                    : ""
                }
              >
                {awayTeamStats.PPP}
              </td>
              <td
                className={
                  Number(awayTeamStats.SOG) > Number(homeTeamStats.SOG)
                    ? "font-semibold"
                    : ""
                }
              >
                {awayTeamStats.SOG}
              </td>
              <td
                className={
                  Number(awayTeamStats.HIT) > Number(homeTeamStats.HIT)
                    ? "font-semibold"
                    : ""
                }
              >
                {awayTeamStats.HIT}
              </td>
              <td
                className={
                  Number(awayTeamStats.BLK) > Number(homeTeamStats.BLK)
                    ? "font-semibold"
                    : ""
                }
              >
                {awayTeamStats.BLK}
              </td>
              <td
                className={
                  Number(awayTeamStats.W) > Number(homeTeamStats.W)
                    ? "font-semibold"
                    : ""
                }
              >
                {awayTeamStats.W}
              </td>
              <td
                className={
                  Number(awayTeamStats.GAA) < Number(homeTeamStats.GAA)
                    ? "font-semibold"
                    : ""
                }
              >
                {(+awayTeamStats.GAA).toFixed(2)}
              </td>
              <td
                className={
                  Number(awayTeamStats.SVP) > Number(homeTeamStats.SVP)
                    ? "font-semibold"
                    : ""
                }
              >
                {(+awayTeamStats.SVP).toFixed(3).toString().slice(1)}
              </td>
            </tr>
            <tr>
              <td>
                <Image
                  src={homeTeam!.logoUrl ?? ""}
                  alt={`${homeTeam!.name} Logo`}
                  className="mr-1 inline-block h-4 w-4"
                />
              </td>
              <td
                className={
                  Number(homeTeamStats.G) > Number(awayTeamStats.G)
                    ? "font-semibold"
                    : ""
                }
              >
                {homeTeamStats.G}
              </td>
              <td
                className={
                  Number(homeTeamStats.A) > Number(awayTeamStats.A)
                    ? "font-semibold"
                    : ""
                }
              >
                {homeTeamStats.A}
              </td>
              <td
                className={
                  Number(homeTeamStats.P) > Number(awayTeamStats.P)
                    ? "font-semibold"
                    : ""
                }
              >
                {homeTeamStats.P}
              </td>
              <td
                className={
                  Number(homeTeamStats.PPP) > Number(awayTeamStats.PPP)
                    ? "font-semibold"
                    : ""
                }
              >
                {homeTeamStats.PPP}
              </td>
              <td
                className={
                  Number(homeTeamStats.SOG) > Number(awayTeamStats.SOG)
                    ? "font-semibold"
                    : ""
                }
              >
                {homeTeamStats.SOG}
              </td>
              <td
                className={
                  Number(homeTeamStats.HIT) > Number(awayTeamStats.HIT)
                    ? "font-semibold"
                    : ""
                }
              >
                {homeTeamStats.HIT}
              </td>
              <td
                className={
                  Number(homeTeamStats.BLK) > Number(awayTeamStats.BLK)
                    ? "font-semibold"
                    : ""
                }
              >
                {homeTeamStats.BLK}
              </td>
              <td
                className={
                  Number(homeTeamStats.W) > Number(awayTeamStats.W)
                    ? "font-semibold"
                    : ""
                }
              >
                {homeTeamStats.W}
              </td>
              <td
                className={
                  Number(homeTeamStats.GAA) < Number(awayTeamStats.GAA)
                    ? "font-semibold"
                    : ""
                }
              >
                {(+homeTeamStats.GAA).toFixed(2)}
              </td>
              <td
                className={
                  Number(homeTeamStats.SVP) > Number(awayTeamStats.SVP)
                    ? "font-semibold"
                    : ""
                }
              >
                {(+homeTeamStats.SVP).toFixed(3).toString().slice(1)}
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        "Team stats unavailable"
      )}
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
  const { matchups, teams, teamWeekStatsByTeam } = useWeeklyScheduleData();

  return (
    <div className="mx-2 mb-40 mt-4">
      <ScheduleHeader />
      <div>
        {matchups.map((matchup) => (
          <WeekScheduleItem
            key={`week-${matchup.id}`}
            matchup={matchup}
            teams={teams}
            teamWeekStatsByTeam={teamWeekStatsByTeam}
          />
        ))}
      </div>
    </div>
  );
}
