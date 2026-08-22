"use client";

import { TeamContractTable } from "@gshl-components/contracts";
import { LockerRoomHeader } from "@gshl-components/team/LockerRoomHeader";
import { TeamDraftPickList } from "@gshl-components/team/TeamDraftPickList";
import { TeamRoster } from "@gshl-components/team/TeamRoster";
import { LockerRoomSkeleton } from "@gshl-skeletons";
import { useDraftHubTeamData } from "@gshl-hooks";
import type { DraftHubTeamPageProps } from "@gshl-types";

export function DraftHubTeamPage({ mode }: DraftHubTeamPageProps) {
  const data = useDraftHubTeamData(mode);
  if (data.isLoading) return <LockerRoomSkeleton />;
  if (!data.season) {
    return (
      <main className="container mx-auto px-3 py-8 text-center text-muted-foreground">
        No configured draft season is available.
      </main>
    );
  }
  if (!data.selectedTeam) {
    return (
      <main className="container mx-auto px-3 py-8">
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {mode === "my-team"
            ? "This account is not linked to a team for the draft season."
            : "Select a team from the team bar to view its draft room."}
        </div>
      </main>
    );
  }

  return (
    <main className="container mx-auto space-y-8 px-3 py-5 sm:px-4">
      <LockerRoomHeader currentTeam={data.selectedTeam} />
      <section className="overflow-hidden rounded-xl border bg-white p-2 shadow-sm">
        <TeamContractTable
          currentSeason={data.season}
          currentTeam={data.selectedTeam}
          players={data.contractPlayers}
          nhlTeams={data.nhlTeams}
          contracts={data.contracts}
          {...data.contractTable}
          title="Salary Cap"
        />
      </section>
      <section className="overflow-hidden rounded-xl border bg-white p-2 shadow-sm">
        <h2 className="mt-3 text-center text-xl font-bold">Current Roster</h2>
        <TeamRoster
          players={data.players}
          contracts={data.contracts}
          currentTeam={data.selectedTeam}
          showSalaries
        />
      </section>
      <section className="overflow-hidden rounded-xl border bg-white p-2 pb-5 shadow-sm">
        <TeamDraftPickList
          teams={data.teams}
          allTeams={data.teams}
          draftPicks={data.draftPicks}
          contracts={data.contracts}
          players={data.players}
          seasons={[data.season]}
          gshlTeamId={data.selectedTeam.id}
          selectedSeasonId={data.season.id}
        />
      </section>
    </main>
  );
}
