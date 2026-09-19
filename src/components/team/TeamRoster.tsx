"use client";

import type { TeamRosterProps } from "@gshl-types";
import { useTeamRosterView } from "@gshl-hooks";
import { BenchPlayers } from "./roster/BenchPlayers";
import { RatingLegend } from "./roster/RatingLegend";
import { RosterLineup } from "./roster/RosterLineup";

export function TeamRoster({
  players,
  contracts,
  currentTeam,
  showSalaries = false,
}: TeamRosterProps) {
  const {
    benchPlayers,
    contractByPlayerId,
    currentRoster,
    nhlTeamByAbbr,
    teamLineup,
  } = useTeamRosterView({
    players,
    contracts,
    currentTeam,
  });

  return (
    <section className="mx-auto max-w-md" aria-labelledby="team-roster-heading">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="team-roster-heading" className="text-base font-semibold">
          Roster
        </h2>
        <span className="text-xs text-slate-500">
          {currentRoster.length} players
        </span>
      </div>
      {currentRoster.length === 0 && (
        <p className="py-6 text-sm text-slate-500">
          No players on this roster.
        </p>
      )}

      <RosterLineup
        teamLineup={teamLineup}
        contractByPlayerId={contractByPlayerId}
        showSalaries={showSalaries}
        nhlTeamByAbbr={nhlTeamByAbbr}
      />

      <BenchPlayers
        benchPlayers={benchPlayers}
        contractByPlayerId={contractByPlayerId}
        showSalaries={showSalaries}
        nhlTeamByAbbr={nhlTeamByAbbr}
      />

      <RatingLegend />
    </section>
  );
}
