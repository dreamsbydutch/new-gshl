import type {
  NhlRosterAnalyticsPlayer,
  NhlRosterAnalyticsTeam,
} from "../../types/nhl-contract-analytics";
import type { NhlContractTalentPopulation } from "../../types/nhl-contract-talent-view";
import type {
  NhlRosterTalentPlayer,
  NhlRosterTalentTeam,
} from "../../types/nhl-roster-talent";
import { getPlayerNhlAbbreviations } from "./player";
import { rankNhlRosterTalent } from "./nhl-roster-talent";

/** Actual season GAR, with no forecast or 82-game extrapolation.
 * Aggregate traded-player GAR has no verified club allocation: disclose it on
 * each affected club, but never copy the full value onto either club.
 */
export function buildHistoricalNhlRosterTalent(
  teams: readonly NhlRosterAnalyticsTeam[],
  players: readonly NhlRosterAnalyticsPlayer[],
  population: NhlContractTalentPopulation,
) {
  if (
    !Number.isInteger(population.seasonStartYear) ||
    population.seasonStartYear >= population.currentSeasonStartYear
  )
    throw Error("Historical NHL rankings require a past season");
  const observations = new Map(
    population.observations.map((p) => [p.playerId, p]),
  );
  if (
    observations.size !== population.observations.length ||
    population.observations.some(
      (p) => p.seasonStartYear !== population.seasonStartYear,
    )
  )
    throw Error("Invalid historical NHL talent population");
  const byAbbr = new Map(
    teams.filter((t) => t.id !== "unassigned").map((t) => [t.abbr, t]),
  );
  const assigned = new Map<string, NhlRosterTalentPlayer[]>();
  const unallocated = new Map<
    string,
    Array<{ id: string; playerName: string }>
  >();
  for (const player of players) {
    const abbrs = [
      ...new Set(
        getPlayerNhlAbbreviations(player.nhlTeam).map((abbr) =>
          abbr === "PHX" ? "ARI" : abbr,
        ),
      ),
    ];
    if (abbrs.length !== 1) {
      for (const abbr of abbrs) {
        const team = byAbbr.get(abbr);
        if (!team) continue;
        const rows = unallocated.get(team.id) ?? [];
        rows.push({ id: player.id, playerName: player.playerName });
        unallocated.set(team.id, rows);
      }
      continue;
    }
    const team = byAbbr.get(abbrs[0]!);
    if (!team) continue;
    const observed = observations.get(player.id);
    if (
      player.nhlPlayerId &&
      observed?.nhlPlayerId &&
      player.nhlPlayerId !== observed.nhlPlayerId
    )
      throw Error("Conflicting historical NHL identity");
    const nhlPlayerId = observed?.nhlPlayerId ?? player.nhlPlayerId ?? null;
    const gar =
      observed?.qualification === "ranked" &&
      observed.position === player.position &&
      nhlPlayerId !== null
        ? observed.goalsAboveReplacement
        : null;
    const roster = assigned.get(team.id) ?? [];
    roster.push({
      id: player.id,
      nhlPlayerId,
      playerName: player.playerName,
      position: player.position,
      gar,
      status: gar === null ? "unavailable" : "qualified",
    });
    assigned.set(team.id, roster);
  }
  const inputs: NhlRosterTalentTeam[] = [...byAbbr.values()]
    .filter((t) => assigned.has(t.id) || unallocated.has(t.id))
    .map((t) => ({
      ...t,
      roster: assigned.get(t.id) ?? [],
      unallocated: unallocated.get(t.id) ?? [],
      populationComplete: population.populationComplete,
    }));
  return rankNhlRosterTalent(inputs);
}
