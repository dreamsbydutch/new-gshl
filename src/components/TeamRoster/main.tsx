import { BenchPlayers, RatingLegend, RosterLineup } from "./components";
import { useTeamRosterData } from "@gshl-hooks";
import type { TeamRosterProps } from "@gshl-utils/team-roster";

export function TeamRoster({
  players,
  contracts,
  currentTeam,
}: TeamRosterProps) {
  const showSalaries = false;

  const { teamLineup, benchPlayers } = useTeamRosterData(
    players,
    contracts,
    currentTeam,
  );

  return (
    <>
      <div className="mx-auto mt-12 text-center text-xl font-bold">
        Current Roster
      </div>

      <RosterLineup
        teamLineup={teamLineup}
        contracts={contracts}
        showSalaries={showSalaries}
      />

      <BenchPlayers
        benchPlayers={benchPlayers}
        contracts={contracts}
        showSalaries={showSalaries}
      />

      <RatingLegend />
    </>
  );
}
