import { normalizeTimestampFields } from "./timestamps";

export function verifyPlayerDayRemoval(
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
  seasonId: string,
  date: string,
) {
  const snapshot = normalizeTimestampFields("playerDayStatLines", expected);
  delete snapshot.id;
  const stored = normalizeTimestampFields("playerDayStatLines", actual);
  if (stored.seasonId !== seasonId || stored.date !== date)
    throw new Error("Player-day removal is outside the requested season/date.");
  const entries = (row: Record<string, unknown>) =>
    Object.entries(row).sort(([a], [b]) => a.localeCompare(b));
  if (JSON.stringify(entries(stored)) !== JSON.stringify(entries(snapshot)))
    throw new Error(
      "Player day changed since its recovery backup; retry reconciliation.",
    );
}
