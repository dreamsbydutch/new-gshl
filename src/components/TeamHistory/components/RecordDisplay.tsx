import {
  type RecordDisplayProps,
  calculateWinPercentage,
} from "@gshl-utils/team-history";

export const RecordDisplay = ({ winLossRecord }: RecordDisplayProps) => {
  const winPercentage = calculateWinPercentage(winLossRecord);

  return (
    <div className="mt-12 text-xl font-bold">
      <div>All-Time Record:</div>
      <div>
        {winLossRecord[0]}-{winLossRecord[1]}-{winLossRecord[2]} -{" "}
        {winPercentage}%
      </div>
    </div>
  );
};
