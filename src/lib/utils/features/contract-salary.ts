import type { PlayerNhlSalaryRow } from "@gshl-types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function identifier(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "";
}

export function normalizePlayerNhlSalaryRows(
  value: unknown,
): PlayerNhlSalaryRow[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((row) => {
    if (!isRecord(row)) return [];
    const salary =
      typeof row.salary === "number" || typeof row.salary === "string"
        ? row.salary
        : null;
    return [
      {
        playerId: identifier(row.playerId),
        seasonId: identifier(row.seasonId),
        salary,
      },
    ];
  });
}
