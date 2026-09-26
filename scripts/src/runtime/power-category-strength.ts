type Row = Record<string, unknown>;
const GOALIE = new Set(["W", "GAA", "SVP", "SV", "SO"]);
const numeric = (value: unknown): number | null =>
  value == null || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);

/** Directional category strength; explicit goalie blanks are aggregation's forfeit marker. */
export function weeklyCategoryStrength(
  rows: Map<string, Row>,
  teamIds: string[],
  categories: string[],
  penalizeForfeits = true,
): Map<string, number> {
  const goalieCategories = categories.filter((field) => GOALIE.has(field));
  const forfeited = new Map(
    teamIds.map((id) => {
      const row = rows.get(id);
      return [
        id,
        penalizeForfeits &&
          !!row &&
          Number(row.GP) > 0 &&
          goalieCategories.length > 0 &&
          goalieCategories.every(
            (field) =>
              Object.prototype.hasOwnProperty.call(row, field) &&
              (row[field] === "" || row[field] === null),
          ),
      ];
    }),
  );
  const metadata = categories.map((field) => {
    const values = teamIds
      .map((id) => numeric(rows.get(id)?.[field]))
      .filter((value): value is number => value !== null);
    const mean = values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
    const sd =
      Math.sqrt(
        values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
          Math.max(1, values.length),
      ) || 1;
    const direction = field === "GAA" ? -1 : 1;
    const penalty = Math.min(
      -2.5,
      ...values.map((value) => (direction * (value - mean)) / sd - 0.5),
    );
    return { field, mean, sd, direction, penalty };
  });
  return new Map(
    teamIds.map((id) => {
      let sum = 0,
        count = 0;
      for (const category of metadata) {
        if (forfeited.get(id) && GOALIE.has(category.field)) {
          sum += category.penalty;
          count++;
          continue;
        }
        const value = numeric(rows.get(id)?.[category.field]);
        if (value === null) continue;
        sum += (category.direction * (value - category.mean)) / category.sd;
        count++;
      }
      return [id, count ? sum / count : 0];
    }),
  );
}
