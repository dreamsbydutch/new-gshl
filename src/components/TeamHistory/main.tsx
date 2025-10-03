import React from "react";
import { FilterDropdowns, RecordDisplay, MatchupList } from "./components";
import { useTeamHistoryData } from "@gshl-hooks/team-history";
import type { TeamHistoryProps } from "@gshl-utils/team-history";

// Import your actual LoadingSpinner component here
declare const LoadingSpinner: React.ComponentType;

export function TeamHistoryContainer({ teamInfo }: TeamHistoryProps) {
  const {
    // Filter states
    gameTypeValue,
    setGameTypeValue,
    seasonValue,
    setSeasonValue,
    ownerValue,
    setOwnerValue,

    // Options
    gameTypeOptions,
    seasonOptions,
    ownerOptions,

    // Data
    schedule,
    teams,
    winLossRecord,
    isDataReady,
  } = useTeamHistoryData(teamInfo);

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

      <MatchupList schedule={schedule!} teams={teams} teamInfo={teamInfo} />
    </>
  );
}
