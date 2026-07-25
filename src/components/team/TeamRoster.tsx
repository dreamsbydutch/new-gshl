"use client";

import type { TeamRosterProps } from "@gshl-types";
import { useTeamRosterView } from "@gshl-hooks";
import { BenchPlayers } from "./roster/BenchPlayers";
import { RatingLegend } from "./roster/RatingLegend";
import { RosterLineup } from "./roster/RosterLineup";
import { useAuthSession } from "@gshl-hooks";

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
  const { session } = useAuthSession();
  const canEditLineup =
    session?.user.role === "commissioner" ||
    (session?.user.role === "owner" &&
      session.user.ownerId === currentTeam.ownerId);

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
        canEditLineup={canEditLineup}
      />

      <BenchPlayers
        benchPlayers={benchPlayers}
        contractByPlayerId={contractByPlayerId}
        showSalaries={showSalaries}
        nhlTeamByAbbr={nhlTeamByAbbr}
        canEditLineup={canEditLineup}
      />

      <RatingLegend />
    </>
  );
}
