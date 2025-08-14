import {
  BenchPlayers,
  CapSpaceDisplay,
  RatingLegend,
  RosterLineup,
} from "./components";
import { useTeamRosterData } from "./hooks";
import type { TeamRosterProps } from "./utils";

export function TeamRoster({
  players,
  contracts,
  currentTeam,
}: TeamRosterProps) {
  const showSalaries = true;

  const { teamLineup, benchPlayers, totalCapHit } = useTeamRosterData(
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

      <CapSpaceDisplay
        contracts={contracts}
        showSalaries={showSalaries}
        totalCapHit={totalCapHit}
      />
    </>
  );
}
