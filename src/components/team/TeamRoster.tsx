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
  const { benchPlayers, contractByPlayerId, nhlTeamByAbbr, teamLineup } =
    useTeamRosterView({
      players,
      contracts,
      currentTeam,
    });

  return (
    <>
      <div className="mx-auto mt-12 text-center text-xl font-bold">
        Current Roster
      </div>

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
    </>
  );
}
