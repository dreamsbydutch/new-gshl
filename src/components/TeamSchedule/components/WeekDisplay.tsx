import type { WeekDisplayProps } from "../utils/types";
import { getGameTypeDisplay } from "../utils";

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
