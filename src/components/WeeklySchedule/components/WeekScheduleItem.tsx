import { LoadingSpinner } from "@gshl-ui";
import { cn } from "@gshl-utils";
import {
  findTeamById,
  getGameBackgroundClass,
  isValidMatchup,
  type WeekScheduleItemProps,
} from "@gshl-utils/weekly-schedule";
import { TeamDisplay } from "./TeamDisplay";
import { ScoreDisplay } from "./ScoreDisplay";

export const WeekScheduleItem = ({ matchup, teams }: WeekScheduleItemProps) => {
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
