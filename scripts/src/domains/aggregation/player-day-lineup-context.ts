import type { DatabaseRecord } from "../../integrations/data/records";
import { computePlayerDayLineupFlags } from "./player-day-flags";

type Slot = { position: string; eligiblePositions: readonly string[] };
type Optimizer = (
  players: DatabaseRecord[],
  slots?: readonly Slot[],
) => DatabaseRecord[];

/** Rebuild hindsight positions after stats/ratings arrive, preserving Yahoo decisions. */
export function refreshPlayerDayLineupContext(
  rows: readonly DatabaseRecord[],
  optimize: Optimizer,
  slots?: readonly Slot[],
): DatabaseRecord[] {
  const result = rows.map((row) => ({ ...row }));
  const groups = new Map<string, DatabaseRecord[]>();
  for (const row of result) {
    if (!row.seasonId || !row.gshlTeamId || !row.date || !row.playerId)
      throw Error(
        "Complete dated team/player identity required for lineup accounting",
      );
    const key = JSON.stringify([row.seasonId, row.gshlTeamId, row.date]);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    if (
      group.every((row) => row.lineupAccountingFinalized !== false) &&
      group.some((row) => Number(row.GP) === 1)
    ) {
      const optimized = optimize(group, slots);
      const byId = new Map(optimized.map((row) => [String(row.playerId), row]));
      if (byId.size !== group.length || optimized.length !== group.length)
        throw Error(
          "Lineup accounting cannot change the dated roster population",
        );
      for (const row of group) {
        const selected = byId.get(String(row.playerId));
        if (!selected || !selected.fullPos || !selected.bestPos)
          throw Error("Missing optimized lineup positions");
        row.fullPos = selected.fullPos;
        row.bestPos = selected.bestPos;
      }
    }
    for (const row of group)
      Object.assign(row, computePlayerDayLineupFlags(row));
  }
  return result;
}
