"use client";

import type { TeamHistoryProps } from "@gshl-types";
import { useTeamHistoryData, useTeamHistoryRows } from "@gshl-hooks";
import { LoadingSpinner } from "@gshl-components/ui";
import { FilterDropdowns } from "./history/FilterDropdowns";
import { HistoryMatchupList } from "./history/HistoryMatchupList";
import { RecordDisplay } from "./history/RecordDisplay";

export function TeamHistoryContainer({ teamInfo }: TeamHistoryProps) {
  const {
    gameTypeValue,
    setGameTypeValue,
    seasonValue,
    setSeasonValue,
    ownerValue,
    setOwnerValue,
    gameTypeOptions,
    seasonOptions,
    ownerOptions,
    schedule,
    teams,
    winLossRecord,
    isDataReady,
  } = useTeamHistoryData({ teamInfo });
  const rows = useTeamHistoryRows(schedule);

  if (!isDataReady) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <FilterDropdowns
        seasonValue={seasonValue}
        setSeasonValue={setSeasonValue}
        gameTypeValue={gameTypeValue}
        setGameTypeValue={setGameTypeValue}
        ownerValue={ownerValue}
        setOwnerValue={setOwnerValue}
        seasonOptions={seasonOptions}
        gameTypeOptions={gameTypeOptions}
        ownerOptions={ownerOptions}
      />

      <RecordDisplay winLossRecord={winLossRecord} />

      <HistoryMatchupList rows={rows} teams={teams} teamInfo={teamInfo} />
    </>
  );
}
