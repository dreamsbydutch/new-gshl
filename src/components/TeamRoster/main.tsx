import {
  Contract,
  GSHLTeam,
  Player,
  PlayerNHLStatLine,
  RosterPosition,
} from "@gshl-types";
import { cn, formatCurrency } from "@gshl-utils";
import {
  BenchPlayers,
  CapSpaceDisplay,
  RatingLegend,
  RosterLineup,
} from "./components";
import { useTeamRosterData } from "./hooks";
import { TeamRosterProps } from "./utils";

export function TeamRoster({
  nhlPlayerStats,
  players,
  contracts,
  currentTeam,
}: TeamRosterProps) {
  console.log(currentTeam);
  console.log(players);
  const showSalaries = true;

  const { currentRoster, teamLineup, benchPlayers, totalCapHit } =
    useTeamRosterData(nhlPlayerStats, players, contracts, currentTeam);

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
