"use client";

import type { TeamHistoryProps } from "@gshl-types";
import { useTeamHistoryData, useTeamHistoryRows } from "@gshl-hooks";
import { TeamHistorySkeleton } from "@gshl-skeletons";
import { FilterDropdowns } from "./history/FilterDropdowns";
import { HistoryMatchupList } from "./history/HistoryMatchupList";
import { RecordDisplay } from "./history/RecordDisplay";

export function TeamHistoryContainer({ teamInfo }: TeamHistoryProps) {
  const {
    seasonOptions,
    selectedSeasonIds,
    setSelectedSeasonIds,
    gameTypeValue,
    setGameTypeValue,
    ownerValue,
    setOwnerValue,
    gameTypeOptions,
    ownerOptions,
    schedule,
    teams,
    winLossRecord,
    isDataReady,
  } = useTeamHistoryData({ teamInfo });
  const rows = useTeamHistoryRows(schedule);

  if (!isDataReady) {
    return <TeamHistorySkeleton />;
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <h2 className="mb-3 text-base font-semibold">Matchups</h2>
      <FilterDropdowns
        seasonOptions={seasonOptions}
        selectedSeasonIds={selectedSeasonIds}
        setSelectedSeasonIds={setSelectedSeasonIds}
        gameTypeValue={gameTypeValue}
        setGameTypeValue={setGameTypeValue}
        ownerValue={ownerValue}
        setOwnerValue={setOwnerValue}
        gameTypeOptions={gameTypeOptions}
        ownerOptions={ownerOptions}
      />

      <RecordDisplay winLossRecord={winLossRecord} />

      <HistoryMatchupList rows={rows} teams={teams} teamInfo={teamInfo} />
    </section>
  );
}
