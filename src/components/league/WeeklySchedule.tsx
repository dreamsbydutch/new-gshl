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

import { useEffect, useMemo, useRef, useState } from "react";
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
import { useWeeklyScheduleData, useWeeks } from "@gshl-hooks";
import { clientApi as trpc } from "@gshl-trpc";

// ============================================================================
// INTERNAL COMPONENTS
// ============================================================================

const ScheduleHeader = () => {
  return (
    <div className="mx-auto mb-2 grid grid-cols-10 text-center font-varela text-xs font-semibold">
      <div className="col-span-4">Away Team</div>
      <div className="col-span-2">Score</div>
      <div className="col-span-4">Home Team</div>
    </div>
  );
};

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


const WeekScheduleItem = ({
  matchup,
  teams,
}: WeekScheduleItemProps) => {
  const homeTeam = findTeamById(teams, matchup.homeTeamId);
  const awayTeam = findTeamById(teams, matchup.awayTeamId);

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
    </div>
  );
};

// ============================================================================
// MAIN EXPORT
// ============================================================================

export function WeeklySchedule() {
  const data = useWeeklyScheduleData();
  const {
    matchups,
    teams,
    teamWeekStatsByTeam,
    playerWeekStatsByTeam,
    selectedSeasonId,
    selectedWeekId,
    ready,
  } = data;

  const seasonNumericId = Number(selectedSeasonId ?? "");
  const showPlusMinus = Number.isFinite(seasonNumericId)
    ? seasonNumericId <= 6
    : true;
  const utils = trpc.useUtils();
  const weekList = useWeeks({
    seasonId: selectedSeasonId,
    orderBy: { startDate: "asc" },
    enabled: Boolean(selectedSeasonId),
  });

  const nextWeekIds = useMemo(() => {
    const weeks = weekList.data ?? [];
    const currentIndex = weeks.findIndex((week) => week.id === selectedWeekId);
    if (currentIndex < 0) return [];
    return weeks
      .slice(currentIndex + 1, currentIndex + 3)
      .map((week) => week.id)
      .filter(Boolean);
  }, [selectedWeekId, weekList.data]);

  const prefetchedWeekIds = useRef(new Set<string>());
  const [isPrefetching, setIsPrefetching] = useState(false);

  useEffect(() => {
    prefetchedWeekIds.current.clear();
  }, [selectedSeasonId]);

  useEffect(() => {
    if (!ready || !selectedSeasonId || !selectedWeekId || !nextWeekIds.length) {
      return;
    }

    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return;
    }

    let cancelled = false;

    async function prefetchWeeks() {
      setIsPrefetching(true);
      try {
        await Promise.all(
          nextWeekIds.map(async (weekId) => {
            if (prefetchedWeekIds.current.has(weekId)) {
              return;
            }
            prefetchedWeekIds.current.add(weekId);
            await Promise.all([
              utils.matchup.getAll.prefetch({
                where: { seasonId: selectedSeasonId ?? undefined, weekId },
              }),
              utils.teamStats.weekly.getByWeek.prefetch({
                weekId,
                seasonId: selectedSeasonId ?? undefined,
              }),
              utils.playerStats.weekly.getByWeek.prefetch({
                weekId,
                seasonId: selectedSeasonId ?? undefined,
              }),
            ]);
          }),
        );
      } finally {
        if (!cancelled) {
          setIsPrefetching(false);
        }
      }
    }

    void prefetchWeeks();

    return () => {
      cancelled = true;
    };
  }, [ready, selectedSeasonId, selectedWeekId, nextWeekIds, utils]);

  console.log(matchups);

  return (
    <div className="mx-2 mb-40 mt-4">
      <ScheduleHeader />
      {isPrefetching && (
        <div className="mb-2 flex items-center justify-center gap-2 text-xs font-semibold text-slate-500">
          <LoadingSpinner />
          Prefetching upcoming weeks...
        </div>
      )}
      <div>
        {matchups.map((matchup) => (
          <WeekScheduleItem
            key={`week-${matchup.id}`}
            matchup={matchup}
            teams={teams}
            teamWeekStatsByTeam={teamWeekStatsByTeam}
            playerWeekStatsByTeam={playerWeekStatsByTeam}
            showPlusMinus={showPlusMinus}
          />
        ))}
      </div>
    </div>
  );
}
