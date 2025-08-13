import { GSHLTeam } from "@gshl-types";
import {
  ProcessedDraftPick,
  formatDraftPickDescription,
  getOriginalTeamName,
} from "../utils";

interface DraftPickItemProps {
  processedPick: ProcessedDraftPick;
  teams: GSHLTeam[];
}

export const DraftPickItem = ({ processedPick, teams }: DraftPickItemProps) => {
  const { draftPick, originalTeam, isAvailable, selectedPlayer } =
    processedPick;

  if (isAvailable) {
    return (
      <div className="text-gray-800">
        <div className="mx-auto w-5/6 border-t border-gray-300 px-2 py-1 text-center text-xs">
          {formatDraftPickDescription(draftPick)}
          {getOriginalTeamName(draftPick, teams, originalTeam)}
        </div>
      </div>
    );
  }

  return (
    <div className="text-gray-400">
      <div className="mx-auto w-5/6 border-t border-gray-300 px-2 py-1 text-center text-xs">
        {selectedPlayer?.fullName}, {selectedPlayer?.nhlPos.toString()} (
        {formatDraftPickDescription(draftPick)})
      </div>
    </div>
  );
};
