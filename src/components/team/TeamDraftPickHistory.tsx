"use client";

import { useTeamDraftPickHistoryData } from "@gshl-hooks";
import type { TeamDraftPickHistoryProps } from "@gshl-types";
import { TeamDraftPickList } from "./TeamDraftPickList";

export function TeamDraftPickHistory({
  currentTeam,
  seasons,
}: TeamDraftPickHistoryProps) {
  const data = useTeamDraftPickHistoryData({ currentTeam, seasons });

  if (!data.selectedSeasonId) {
    return (
      <section className="py-6 text-center">
        <h2 className="text-xl font-bold">Draft Picks</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          No draft seasons found.
        </p>
      </section>
    );
  }

  return (
    <TeamDraftPickList
      teams={data.teams}
      allTeams={data.teams}
      draftPicks={data.draftPicks}
      contracts={[]}
      players={data.players}
      seasons={data.seasonOptions}
      gshlTeamId={data.selectedTeam?.id ?? currentTeam.id}
      selectedSeasonId={data.selectedSeasonId}
      isLoading={data.isLoading}
      onSelectSeason={data.selectSeason}
    />
  );
}
