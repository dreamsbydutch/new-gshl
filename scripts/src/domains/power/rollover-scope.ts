import type { DatabaseRecord } from "../../integrations/data/records";

/** Rollover may publish new entering snapshots, never rewrite the ended week. */
export function scopePowerRolloverUpdates(
  afterWeekId: string,
  weeks: readonly DatabaseRecord[],
  matchups: readonly DatabaseRecord[],
  updates: { weekUpdates: DatabaseRecord[]; matchupUpdates: DatabaseRecord[] },
) {
  const boundary = weeks.find((week) => String(week.id) === afterWeekId);
  if (!boundary || !Number.isFinite(Number(boundary.weekNum)))
    throw new Error("Power rollover boundary week is unavailable");
  const future = new Set(
    weeks
      .filter((week) => Number(week.weekNum) > Number(boundary.weekNum))
      .map((week) => String(week.id)),
  );
  const knownWeeks = new Set(weeks.map((week) => String(week.id)));
  const matchupWeeks = new Map(
    matchups.map((row) => [String(row.id), String(row.weekId)]),
  );
  if (
    updates.weekUpdates.some((row) => !knownWeeks.has(String(row.weekId))) ||
    updates.matchupUpdates.some((row) => !matchupWeeks.has(String(row.id)))
  )
    throw new Error("Power rollover update has an unknown week or matchup");
  return {
    weekUpdates: updates.weekUpdates.filter((row) =>
      future.has(String(row.weekId)),
    ),
    matchupUpdates: updates.matchupUpdates.filter((row) =>
      future.has(matchupWeeks.get(String(row.id))!),
    ),
  };
}
