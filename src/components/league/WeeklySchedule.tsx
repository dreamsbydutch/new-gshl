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

type PlayerStatRow =
  WeekScheduleItemProps["playerWeekStatsByTeam"][string][number];

type PlayerStatsTableProps = {
  players: PlayerStatRow[];
  team: TeamDisplayProps["team"];
  showPlusMinus: boolean;
};

const formatTeamStatValue = (
  value: string | number | undefined,
  statKey: string,
) => {
  if (statKey === "GAA") {
    return value ? (+value).toFixed(2) : "-";
  }
  if (statKey === "SVP") {
    return value ? (+value).toFixed(3).toString().slice(1) : "-";
  }
  return value ?? "-";
};

const formatPlayerName = (player: PlayerStatRow) => {
  if (player.fullName) {
    return player.fullName;
  }
  const first = player.firstName ?? "";
  const last = player.lastName ?? "";
  return `${first} ${last}`.trim() || "Player";
};

const toNumberSafe = (value: string | number | undefined, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toNumberOrInfinity = (value: string | number | undefined) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
};

const sortPlayers = (players: PlayerStatRow[]) => {
  return [...players].sort(
    (a, b) => toNumberSafe(b.Rating, 0) - toNumberSafe(a.Rating, 0),
  );
};

const PlayerStatsTable = ({
  players,
  team,
  showPlusMinus,
}: PlayerStatsTableProps) => {
  return (
    <table className="mx-2 my-2 w-11/12 min-w-max justify-evenly whitespace-nowrap text-center text-xs">
      <thead>
        <tr className="border-b font-bold">
          <td className="text-left">Player</td>
          <td>G</td>
          <td>A</td>
          <td>P</td>
          {showPlusMinus && <td>PM</td>}
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
        {players.map((player, idx) => (
          <tr
            key={`${team.id ?? team.name}-${idx}`}
            className="gap-0.5 border-b border-gray-200"
          >
            <td className="text-left text-xs">
              <Image
                src={team.logoUrl ?? ""}
                alt={`${team.name} Logo`}
                width={16}
                height={16}
                className="mr-1 inline-block h-3 w-3"
              />
              {formatPlayerName(player)}
            </td>
            <td>{player.G ?? "-"}</td>
            <td>{player.A ?? "-"}</td>
            <td>{player.P ?? "-"}</td>
            {showPlusMinus && <td>{player.PM ?? "-"}</td>}
            <td>{player.PPP ?? "-"}</td>
            <td>{player.SOG ?? "-"}</td>
            <td>{player.HIT ?? "-"}</td>
            <td>{player.BLK ?? "-"}</td>
            <td className="text-center">
              {+player.GS > 0 && String(player.posGroup) === "G"
                ? (player.W ?? "-")
                : "-"}
            </td>
            <td>{player.GAA ? (+player.GAA).toFixed(2) : "-"}</td>
            <td>
              {player.SVP ? (+player.SVP).toFixed(3).toString().slice(1) : "-"}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

const WeekScheduleItem = ({
  matchup,
  teams,
  teamWeekStatsByTeam,
  playerWeekStatsByTeam,
  showPlusMinus = true,
}: WeekScheduleItemProps) => {
  const homeTeam = findTeamById(teams, matchup.homeTeamId);
  const awayTeam = findTeamById(teams, matchup.awayTeamId);
  const homeTeamStats = teamWeekStatsByTeam[matchup.homeTeamId];
  const awayTeamStats = teamWeekStatsByTeam[matchup.awayTeamId];

  const sortedAwayPlayers = useMemo(
    () => sortPlayers(playerWeekStatsByTeam[matchup.awayTeamId] ?? []),
    [matchup.awayTeamId, playerWeekStatsByTeam],
  );
  const sortedHomePlayers = useMemo(
    () => sortPlayers(playerWeekStatsByTeam[matchup.homeTeamId] ?? []),
    [matchup.homeTeamId, playerWeekStatsByTeam],
  );

  if (!isValidMatchup(matchup, homeTeam, awayTeam)) {
    return <LoadingSpinner />;
  }

  const bgClass = getGameBackgroundClass(
    matchup.gameType,
    awayTeam!.confAbbr ?? "",
    homeTeam!.confAbbr ?? "",
  );

  const determineClass = (
    value: string | number | undefined,
    opponentValue: string | number | undefined,
    compareLower = false,
  ) => {
    const left = compareLower ? toNumberOrInfinity(value) : toNumberSafe(value);
    const right = compareLower
      ? toNumberOrInfinity(opponentValue)
      : toNumberSafe(opponentValue);
    if (left === right) return "";
    if (compareLower) {
      return left < right ? "font-semibold" : "";
    }
    return left > right ? "font-semibold" : "";
  };

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
        <>
          <table className="my-2 w-11/12 justify-evenly text-center text-xs">
            <thead>
              <tr className="border-b font-bold">
                <td></td>
                <td>G</td>
                <td>A</td>
                <td>P</td>
                {showPlusMinus && <td>PM</td>}
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
                    width={36}
                    height={36}
                    className="mr-1 inline-block h-4 w-4"
                  />
                </td>
                <td
                  className={determineClass(awayTeamStats.G, homeTeamStats.G)}
                >
                  {formatTeamStatValue(awayTeamStats.G, "G")}
                </td>
                <td
                  className={determineClass(awayTeamStats.A, homeTeamStats.A)}
                >
                  {formatTeamStatValue(awayTeamStats.A, "A")}
                </td>
                <td
                  className={determineClass(awayTeamStats.P, homeTeamStats.P)}
                >
                  {formatTeamStatValue(awayTeamStats.P, "P")}
                </td>
                {showPlusMinus && (
                  <td
                    className={determineClass(
                      awayTeamStats.PM,
                      homeTeamStats.PM,
                    )}
                  >
                    {formatTeamStatValue(awayTeamStats.PM, "PM")}
                  </td>
                )}
                <td
                  className={determineClass(
                    awayTeamStats.PPP,
                    homeTeamStats.PPP,
                  )}
                >
                  {formatTeamStatValue(awayTeamStats.PPP, "PPP")}
                </td>
                <td
                  className={determineClass(
                    awayTeamStats.SOG,
                    homeTeamStats.SOG,
                  )}
                >
                  {formatTeamStatValue(awayTeamStats.SOG, "SOG")}
                </td>
                <td
                  className={determineClass(
                    awayTeamStats.HIT,
                    homeTeamStats.HIT,
                  )}
                >
                  {formatTeamStatValue(awayTeamStats.HIT, "HIT")}
                </td>
                <td
                  className={determineClass(
                    awayTeamStats.BLK,
                    homeTeamStats.BLK,
                  )}
                >
                  {formatTeamStatValue(awayTeamStats.BLK, "BLK")}
                </td>
                <td
                  className={determineClass(awayTeamStats.W, homeTeamStats.W)}
                >
                  {formatTeamStatValue(awayTeamStats.W, "W")}
                </td>
                <td
                  className={determineClass(
                    awayTeamStats.GAA,
                    homeTeamStats.GAA,
                    true,
                  )}
                >
                  {formatTeamStatValue(awayTeamStats.GAA, "GAA")}
                </td>
                <td
                  className={determineClass(
                    awayTeamStats.SVP,
                    homeTeamStats.SVP,
                  )}
                >
                  {formatTeamStatValue(awayTeamStats.SVP, "SVP")}
                </td>
              </tr>
              <tr>
                <td>
                  <Image
                    src={homeTeam!.logoUrl ?? ""}
                    alt={`${homeTeam!.name} Logo`}
                    width={36}
                    height={36}
                    className="mr-1 inline-block h-4 w-4"
                  />
                </td>
                <td
                  className={determineClass(homeTeamStats.G, awayTeamStats.G)}
                >
                  {formatTeamStatValue(homeTeamStats.G, "G")}
                </td>
                <td
                  className={determineClass(homeTeamStats.A, awayTeamStats.A)}
                >
                  {formatTeamStatValue(homeTeamStats.A, "A")}
                </td>
                <td
                  className={determineClass(homeTeamStats.P, awayTeamStats.P)}
                >
                  {formatTeamStatValue(homeTeamStats.P, "P")}
                </td>
                {showPlusMinus && (
                  <td
                    className={determineClass(
                      homeTeamStats.PM,
                      awayTeamStats.PM,
                    )}
                  >
                    {formatTeamStatValue(homeTeamStats.PM, "PM")}
                  </td>
                )}
                <td
                  className={determineClass(
                    homeTeamStats.PPP,
                    awayTeamStats.PPP,
                  )}
                >
                  {formatTeamStatValue(homeTeamStats.PPP, "PPP")}
                </td>
                <td
                  className={determineClass(
                    homeTeamStats.SOG,
                    awayTeamStats.SOG,
                  )}
                >
                  {formatTeamStatValue(homeTeamStats.SOG, "SOG")}
                </td>
                <td
                  className={determineClass(
                    homeTeamStats.HIT,
                    awayTeamStats.HIT,
                  )}
                >
                  {formatTeamStatValue(homeTeamStats.HIT, "HIT")}
                </td>
                <td
                  className={determineClass(
                    homeTeamStats.BLK,
                    awayTeamStats.BLK,
                  )}
                >
                  {formatTeamStatValue(homeTeamStats.BLK, "BLK")}
                </td>
                <td
                  className={determineClass(homeTeamStats.W, awayTeamStats.W)}
                >
                  {formatTeamStatValue(homeTeamStats.W, "W")}
                </td>
                <td
                  className={determineClass(
                    homeTeamStats.GAA,
                    awayTeamStats.GAA,
                    true,
                  )}
                >
                  {formatTeamStatValue(homeTeamStats.GAA, "GAA")}
                </td>
                <td
                  className={determineClass(
                    homeTeamStats.SVP,
                    awayTeamStats.SVP,
                  )}
                >
                  {formatTeamStatValue(homeTeamStats.SVP, "SVP")}
                </td>
              </tr>
            </tbody>
          </table>
          <div className="no-scrollbar w-full overflow-x-auto overflow-y-hidden">
            <PlayerStatsTable
              players={sortedAwayPlayers}
              team={awayTeam!}
              showPlusMinus={showPlusMinus}
            />
            <PlayerStatsTable
              players={sortedHomePlayers}
              team={homeTeam!}
              showPlusMinus={showPlusMinus}
            />
          </div>
        </>
      ) : (
        <div className="text-xs font-semibold text-slate-500">
          Team stats unavailable
        </div>
      )}
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
