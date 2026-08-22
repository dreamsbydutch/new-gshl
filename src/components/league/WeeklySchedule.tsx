"use client";

import Image from "next/image";
import Link from "next/link";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import {
  WeeklyMatchupRowSkeleton,
  WeeklyScheduleSkeleton,
} from "@gshl-skeletons";
import type {
  ScoreDisplayProps,
  TeamDisplayProps,
  WeekScheduleItemProps,
} from "@gshl-types";
import {
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
  const logoAlt = `${team.name ?? (isAway ? "Away team" : "Home team")} logo`;

  return (
    <div className="col-span-4 flex min-w-0 items-center justify-center gap-1.5 p-1 text-center">
      {shouldDisplayRanking(rank) ? (
        <span className="font-oswald text-xs font-bold text-slate-500">
          #{rank}
        </span>
      ) : null}
      {team.logoUrl ? (
        <Image
          className="h-9 w-9 object-contain"
          src={team.logoUrl}
          alt={logoAlt}
          width={TEAM_LOGO_DIMENSIONS.width}
          height={TEAM_LOGO_DIMENSIONS.height}
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded bg-gray-100" />
      )}
      <span className="sr-only font-oswald text-sm sm:not-sr-only sm:max-w-28 sm:truncate">
        {team.name}
      </span>
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
      className="flex flex-col items-center py-1 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500"
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
      <div className="mx-2 mt-4 border-y border-rose-200 py-4 text-center text-sm text-rose-700">
        The weekly schedule could not be loaded.
      </div>
    );
  }

  return (
    <div className="mx-2 mb-6 mt-3">
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
      <div className="divide-y divide-slate-200 border-y border-slate-200">
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
