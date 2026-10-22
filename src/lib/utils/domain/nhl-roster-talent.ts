import type {
  NhlRosterTalentPlayer,
  NhlRosterTalentPosition,
  NhlRosterTalentTeam,
} from "../../types/nhl-roster-talent";

export const NHL_ROSTER_TALENT_DEPTH = { F: 14, D: 8, G: 2 } as const;
const positions: readonly NhlRosterTalentPosition[] = ["F", "D", "G"];

/** Workload-based GAR values: delivered season totals or projected annual values.
 * Projected annual GAR already includes usage and participation risk.
 * Select depth within position; sum signed values without a second TOI weight.
 * Unmodeled players are listed separately, never treated as replacement zeros.
 */
export function rankNhlRosterTalent(teams: readonly NhlRosterTalentTeam[]) {
  const teamIds = new Set<string>();
  const playerIds = new Set<string>();
  const nhlIds = new Set<number>();
  for (const team of teams) {
    if (!team.id || teamIds.has(team.id)) throw Error("Duplicate NHL team");
    teamIds.add(team.id);
    for (const player of team.roster) {
      if (!player.id || playerIds.has(player.id))
        throw Error("Duplicate NHL roster player");
      playerIds.add(player.id);
      if (player.nhlPlayerId !== null) {
        if (
          !Number.isSafeInteger(player.nhlPlayerId) ||
          player.nhlPlayerId <= 0 ||
          nhlIds.has(player.nhlPlayerId)
        )
          throw Error("Invalid or duplicate canonical NHL identity");
        nhlIds.add(player.nhlPlayerId);
      }
      if (
        player.gar !== null &&
        (!Number.isFinite(player.gar) || player.nhlPlayerId === null)
      )
        throw Error("NHL roster GAR requires a finite value and identity");
      if (
        !["qualified", "research", "unavailable"].includes(player.status) ||
        (player.gar === null) !== (player.status === "unavailable")
      )
        throw Error("NHL roster status disagrees with its value");
    }
  }
  const result = teams.map((team) => {
    const available = team.roster
      .filter(
        (p) =>
          positions.some((position) => position === p.position) &&
          p.gar !== null,
      )
      .sort((a, b) => a.nhlPlayerId! - b.nhlPlayerId!);
    const groups = positions.map((position) => {
      const roster = available
        .filter((p) => p.position === position)
        .sort((a, b) => b.gar! - a.gar! || a.nhlPlayerId! - b.nhlPlayerId!)
        .slice(0, NHL_ROSTER_TALENT_DEPTH[position]);
      const total = roster.reduce((sum, p) => sum + p.gar!, 0);
      if (!Number.isFinite(total)) throw Error("Nonfinite NHL roster total");
      return {
        position,
        roster,
        total,
        required: NHL_ROSTER_TALENT_DEPTH[position],
      };
    });
    const selected: NhlRosterTalentPlayer[] = groups.flatMap((g) => g.roster);
    const selectedIds = new Set(selected.map((p) => p.id));
    const complete = groups.every((g) => g.roster.length === g.required);
    const knownSubtotal = groups.reduce((sum, g) => sum + g.total, 0);
    if (!Number.isFinite(knownSubtotal))
      throw Error("Nonfinite NHL team total");
    const unmodeled = team.roster
      .filter((p) => !available.includes(p))
      .sort((a, b) => a.id.localeCompare(b.id));
    const researchPlayers = selected.filter((p) => p.status === "research");
    return {
      id: team.id,
      name: team.name,
      abbr: team.abbr,
      groups,
      selected,
      unmodeled,
      unallocated: [...(team.unallocated ?? [])].sort((a, b) =>
        a.id.localeCompare(b.id),
      ),
      researchPlayers,
      outsideDepth: available.filter((p) => !selectedIds.has(p.id)),
      complete,
      knownSubtotal,
      modeledGar: selected.length ? knownSubtotal : null,
      provisional:
        !complete ||
        unmodeled.length > 0 ||
        researchPlayers.length > 0 ||
        (team.unallocated?.length ?? 0) > 0 ||
        team.populationComplete === false,
      gar: complete ? knownSubtotal : null,
    };
  });
  result.sort(
    (a, b) =>
      Number(b.modeledGar !== null) - Number(a.modeledGar !== null) ||
      (b.modeledGar ?? 0) - (a.modeledGar ?? 0) ||
      a.name.localeCompare(b.name) ||
      a.id.localeCompare(b.id),
  );
  let previous: number | null = null;
  let rank = 0;
  return result.map((team, i) => {
    if (team.modeledGar !== null && team.modeledGar !== previous) rank = i + 1;
    previous = team.modeledGar;
    return { ...team, rank: team.modeledGar === null ? null : rank };
  });
}
