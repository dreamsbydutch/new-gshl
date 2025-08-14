import { DraftPickListSkeleton } from "@gshl-skeletons";
import { DraftPickItem } from "./components";
import { useTeamDraftPickListData } from "./hooks";
import type { TeamDraftPickListProps } from "./utils";

export function TeamDraftPickList({
  teams,
  draftPicks,
  contracts,
  players,
}: TeamDraftPickListProps) {
  const { processedDraftPicks, isDataReady } = useTeamDraftPickListData(
    teams,
    draftPicks,
    contracts,
    players,
  );

  if (!isDataReady) {
    return <DraftPickListSkeleton />;
  }

  return (
    <>
      <div className="mx-auto mt-4 text-center text-xl font-bold">
        Draft Picks
      </div>
      {processedDraftPicks.map((processedPick, index) => (
        <DraftPickItem
          key={index + 1}
          processedPick={processedPick}
          teams={teams!}
        />
      ))}
    </>
  );
}
