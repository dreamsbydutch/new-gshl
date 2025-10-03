import type { WeekDisplayProps } from "@gshl-utils/team-schedule";
import { getGameTypeDisplay } from "@gshl-utils/team-schedule";

export const WeekDisplay = ({ week, gameType }: WeekDisplayProps) => {
  const display = getGameTypeDisplay(
    gameType,
    week,
    "HOME",
    undefined,
    undefined,
  );

  return <div className="place-self-center font-varela">{display.label}</div>;
};
