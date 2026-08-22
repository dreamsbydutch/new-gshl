"use client";

import Image from "next/image";
import Link from "next/link";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import {
  WeeklyMatchupRowSkeleton,
  WeeklyScheduleSkeleton,
} from "@gshl-skeletons";
import { cn } from "@gshl-utils";
import type {
  ScoreDisplayProps,
  TeamDisplayProps,
  WeekScheduleItemProps,
} from "@gshl-types";
import {
  getGameBackgroundClass,
  buildMatchupNavigationHref,
  buildScheduleNavigationHref,
  getScoreClass,
  isMatchupCompleted,
  isValidMatchup,
  shouldDisplayRanking,
  TEAM_LOGO_DIMENSIONS,
} from "@gshl-utils";
import { useAuthSession, useWeeklyScheduleData } from "@gshl-hooks";
import {
  buildWhatsAppShareMessage,
  canShareCommissionerContent,
} from "@gshl-utils/features/whatsapp-share";

const ScheduleHeader = () => (
  <div className="mx-auto mb-2 grid grid-cols-10 text-center font-varela text-xs font-semibold">
    <div className="col-span-4">Away Team</div>
    <div className="col-span-2">Score</div>
    <div className="col-span-4">Home Team</div>
  </div>
);

const ScoreDisplay = ({ matchup }: ScoreDisplayProps) => {
  if (!isMatchupCompleted(matchup)) {
    return (
      <div className="xs:text-lg col-span-2 text-center font-oswald text-xl">
        @
      </div>
    );
  }

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
};

const TeamDisplay = ({ team, rank, isAway = false }: TeamDisplayProps) => {
  const logoAlt = `${isAway ? "Away" : "Home"} Team Logo`;

  return (
    <div className="col-span-4 flex flex-col items-center justify-center gap-2 whitespace-nowrap p-2 text-center">
      {shouldDisplayRanking(rank) ? (
        <div className="flex flex-row">
          <span className="xs:text-base pr-1 font-oswald text-sm font-bold text-black">
            #{rank}
          </span>
          {team.logoUrl ? (
            <Image
              className="xs:w-12 w-8"
              src={team.logoUrl}
              alt={logoAlt}
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
          alt={logoAlt}
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
  matchupHref,
}: WeekScheduleItemProps) => {
  const homeTeam = teams.find((team) => team.id === matchup.homeTeamId);
  const awayTeam = teams.find((team) => team.id === matchup.awayTeamId);

  if (!homeTeam || !awayTeam || !isValidMatchup(matchup, homeTeam, awayTeam)) {
    return <WeeklyMatchupRowSkeleton />;
  }

  return (
    <Link
      href={matchupHref}
      className={cn(
        "mx-1 mb-3 flex flex-col items-center rounded-xl py-1 shadow-md transition hover:-translate-y-0.5 hover:shadow-lg",
        getGameBackgroundClass(
          matchup.gameType,
          awayTeam.confAbbr ?? "",
          homeTeam.confAbbr ?? "",
        ),
      )}
    >
      <div className="grid w-full grid-cols-10 items-center">
        <TeamDisplay
          team={awayTeam}
          rank={matchup.awayRank?.toString()}
          isAway
        />
        <ScoreDisplay matchup={matchup} />
        <TeamDisplay team={homeTeam} rank={matchup.homeRank?.toString()} />
      </div>
    </Link>
  );
};

export function WeeklySchedule() {
  const { session } = useAuthSession();
  const {
    matchups,
    teams,
    error,
    isLoading,
    selectedSeasonId,
    selectedWeekId,
  } = useWeeklyScheduleData();
  const shareLines = matchups.map((matchup, index) => {
    const awayTeam = teams.find((team) => team.id === matchup.awayTeamId);
    const homeTeam = teams.find((team) => team.id === matchup.homeTeamId);
    const awayName = awayTeam?.name ?? "Away team";
    const homeName = homeTeam?.name ?? "Home team";
    const matchupLabel = isMatchupCompleted(matchup)
      ? `${awayName} ${matchup.awayScore} - ${matchup.homeScore} ${homeName}`
      : `${awayName} at ${homeName}`;
    return `${index + 1}. ${matchupLabel}`;
  });
  const shareMessage = buildWhatsAppShareMessage({
    title: "GSHL Weekly Schedule",
    lines: shareLines,
  });
  const sharePath = buildScheduleNavigationHref("", {
    view: "week",
    season: selectedSeasonId,
    week: selectedWeekId,
  });

  if (isLoading) {
    return <WeeklyScheduleSkeleton />;
  }

  if (error) {
    return (
      <div className="mx-2 mt-4 rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
        The weekly schedule could not be loaded.
      </div>
    );
  }

  return (
    <div className="mx-2 mb-8 mt-4">
      {canShareCommissionerContent(session?.user.role) ? (
        <div className="mb-3 flex justify-end">
          <WhatsAppShareButton
            message={shareMessage}
            path={sharePath}
            label="Share schedule"
            disabled={matchups.length === 0}
          />
        </div>
      ) : null}
      <ScheduleHeader />
      <div>
        {matchups.map((matchup) => (
          <WeekScheduleItem
            key={`week-${matchup.id}`}
            matchup={matchup}
            teams={teams}
            matchupHref={buildMatchupNavigationHref(String(matchup.id), {
              from: "schedule",
              view: "week",
              season: selectedSeasonId,
              week: selectedWeekId,
              side: "away",
            })}
          />
        ))}
      </div>
    </div>
  );
}
