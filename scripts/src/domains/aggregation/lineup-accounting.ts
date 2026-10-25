import type { DatabaseRecord } from "../../integrations/data/records";

export const ACCOUNTING_FIELDS = ["MS", "BS", "MG"] as const;
const dimensions: Record<string, readonly string[]> = {
  playerWeekStatLines: ["seasonId", "weekId", "gshlTeamId", "playerId"],
  playerSplitStatLines: ["seasonId", "gshlTeamId", "playerId", "seasonType"],
  playerTotalStatLines: ["seasonId", "playerId", "seasonType"],
  teamDayStatLines: ["seasonId", "gshlTeamId", "date"],
  teamWeekStatLines: ["seasonId", "gshlTeamId", "weekId"],
  teamSeasonStatLines: ["seasonId", "gshlTeamId", "seasonType"],
  playerCareerSplitStatLines: ["gshlTeamId", "playerId", "seasonType"],
  playerCareerTotalStatLines: ["playerId", "seasonType"],
};
export function accountingKey(table: string, row: DatabaseRecord): string {
  const fields = dimensions[table];
  if (!fields) throw Error("Unsupported accounting aggregate");
  return JSON.stringify(
    fields.map((field) => {
      const value = row[field];
      if (field === "seasonType") {
        if (value === "LT") return "PO";
        if (value === "RS" || value === "PO") return value;
      }
      if (typeof value !== "string" || !value)
        throw Error(`Missing accounting dimension ${field}`);
      return value;
    }),
  );
}

/** All roster slots contribute management counters, including bench and IR. */
export function buildAccountingTotals(rows: readonly DatabaseRecord[]) {
  const totals = new Map<
    string,
    Map<string, Record<(typeof ACCOUNTING_FIELDS)[number], number>>
  >();
  for (const table of Object.keys(dimensions)) totals.set(table, new Map());
  for (const row of rows)
    for (const [table, buckets] of totals) {
      const key = accountingKey(table, row);
      const sum = buckets.get(key) ?? { MS: 0, BS: 0, MG: 0 };
      for (const field of ACCOUNTING_FIELDS) {
        const value = Number(row[field] ?? 0);
        if (!Number.isInteger(value) || value < 0 || value > 1)
          throw Error("Invalid daily accounting flag");
        sum[field] += value;
      }
      buckets.set(key, sum);
    }
  return totals;
}
