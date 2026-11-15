"use client";

import { useState } from "react";
import type { GSHLTeam, Season } from "@gshl-types";
import { useTeamPicks } from "@gshl-hooks/features/useTeamPicks";
import { TeamDraftPickList } from "./TeamDraftPickList";
import { TeamDraftPickHistory } from "./TeamDraftPickHistory";

export function TeamPicks({
  team,
  teams,
  seasons,
}: {
  team: GSHLTeam;
  teams: GSHLTeam[];
  seasons: Season[];
}) {
  const view = useTeamPicks(team, teams, seasons);
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <TeamDraftPickList
          teams={teams}
          allTeams={teams}
          seasons={seasons}
          gshlTeamId={team.id}
          selectedSeasonId={view.season?.id ?? ""}
          onSelectSeason={view.selectSeason}
          draftPicks={view.picks}
          contracts={[]}
          players={view.players}
          isLoading={view.isLoading}
        />
      </section>
      <details
        className="border-t border-slate-200"
        onToggle={(event) => setHistoryOpen(event.currentTarget.open)}
      >
        <summary className="cursor-pointer py-4 text-sm font-semibold">
          Draft history & results
        </summary>
        {historyOpen ? (
          <TeamDraftPickHistory currentTeam={team} seasons={seasons} />
        ) : null}
      </details>
    </div>
  );
}
