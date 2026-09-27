import type { Player } from "../../types";
import type { InjuryReport } from "../../types/injuries";
import { RosterPosition } from "../domain/constants";
import { generateLineupAssignments } from "./draft-admin";
import { findPlayerInjury, isInjuredReserveDesignation } from "./injuries";
import { buildTeamLineup, getBenchPlayers } from "./team-roster";

/** Rebuild the displayed lineup from available players without changing stored assignments. */
export function buildAvailableTeamRoster(
  roster: Player[],
  report: InjuryReport | null,
) {
  const irPlayers: Player[] = [];
  const eligible: Player[] = [];
  for (const player of roster) {
    const injury = report
      ? findPlayerInjury(report.injuries, player.fullName, player.nhlTeam)
      : null;
    const onIR = report
      ? Boolean(injury && isInjuredReserveDesignation(injury.designation))
      : player.lineupPos === RosterPosition.IR;
    (onIR ? irPlayers : eligible).push(player);
  }
  const assignments = new Map(
    generateLineupAssignments(
      eligible.map((player) => ({
        id: player.id,
        nhlPos: player.nhlPos,
        overallRating: player.overallRating,
        // The optimizer preserves saved IR/IR+ slots by default. Current feed status
        // owns this display, and IR+ players must remain eligible for active slots.
        lineupPos: null,
      })),
    ).map((assignment) => [assignment.playerId, assignment.lineupPos]),
  );
  const availableRoster = eligible.map((player) => ({
    ...player,
    lineupPos: assignments.get(player.id) ?? RosterPosition.BN,
  }));
  return {
    irPlayers,
    teamLineup: buildTeamLineup(availableRoster),
    benchPlayers: getBenchPlayers(availableRoster),
  };
}
