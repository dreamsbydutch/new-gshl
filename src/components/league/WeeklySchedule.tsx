"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { WhatsAppShareButton } from "@gshl-components/ui/WhatsAppShareButton";
import { WeeklyScheduleSkeleton } from "@gshl-skeletons";
import type {
  ScoreDisplayProps,
  TeamDisplayProps,
  WeekScheduleItemProps,
} from "@gshl-types";
import {
  buildMatchupNavigationHref,
  buildScheduleNavigationHref,
  getMatchupOutcomeClass,
  isScheduleItemComplete,
  isValidScheduleMatchup,
  shouldDisplayRank,
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
  if (!isScheduleItemComplete({ matchup, mode: "scores" })) {
    return (
      <div className="xs:text-lg col-span-2 text-center font-oswald text-xl">
        @
      </div>
    );
  }

  return (
    <div className="xs:text-lg col-span-2 text-center font-oswald text-xl">
      <span
        className={getMatchupOutcomeClass({
          isLoser: !!matchup.homeWin,
          isWinner: !!matchup.awayWin,
          lossClass: "text-rose-800",
          winClass: "font-bold text-emerald-700",
        })}
      >
        {matchup.awayScore}
      </span>
      {" - "}
      <span
        className={getMatchupOutcomeClass({
          isLoser: !!matchup.awayWin,
          isWinner: !!matchup.homeWin,
          lossClass: "text-rose-800",
          winClass: "font-bold text-emerald-700",
        })}
      >
        {matchup.homeScore}
      </span>
    </div>
  );
};

const TeamDisplay = ({ team, rank, isAway = false }: TeamDisplayProps) => {
  const [failedLogo, setFailedLogo] = useState<string | null>(null);
  const teamName = team.name?.trim();
  const name =
    teamName !== undefined && teamName.length > 0
      ? teamName
      : isAway
        ? "Away team"
        : "Home team";
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();

  return (
    <div className="col-span-4 flex min-w-0 items-center gap-1 px-1">
      {shouldDisplayRank(rank) ? (
        <span className="shrink-0 text-[10px] font-semibold text-slate-500">
          #{rank}
        </span>
      ) : null}
      {team.logoUrl && failedLogo !== team.logoUrl ? (
        <Image
          className="h-6 w-6 shrink-0 object-contain"
          src={team.logoUrl}
          alt=""
          width={24}
          height={24}
          onError={() => setFailedLogo(team.logoUrl ?? null)}
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-slate-100 text-[10px] font-semibold text-slate-500"
        >
          {initials}
        </span>
      )}
      <span
        title={name}
        className="line-clamp-2 min-w-0 flex-1 text-left text-xs font-medium leading-4 sm:text-sm"
      >
        {name}
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

  if (
    !homeTeam ||
    !awayTeam ||
    !isValidScheduleMatchup({ matchup, homeTeam, awayTeam })
  ) {
    return (
      <p className="px-2 py-3 text-xs text-slate-500">
        Matchup information is unavailable.
      </p>
    );
  }

  return (
    <Link
      href={matchupHref}
      className="flex min-h-11 flex-col justify-center py-1 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-slate-500"
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
    const matchupLabel = isScheduleItemComplete({ matchup, mode: "scores" })
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
