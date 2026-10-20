import {
  careerImpactKey,
  impactFields,
  UNIFORM_IMPACT_VERSION,
  type ImpactFields,
} from "./uniform-impact";

type Row = Record<string, unknown>;
const SCALE = 100_000;

/** Career units are the sum of published season units, not hidden precision. */
export function sumPublishedCareerImpact(rows: readonly Row[]): ImpactFields {
  let ticks = 0;
  let appearances = 0;
  for (const row of rows) {
    if (
      row.ratingVersion !== UNIFORM_IMPACT_VERSION ||
      typeof row.Rating !== "number" ||
      !Number.isFinite(row.Rating) ||
      typeof row.averageRating !== "number" ||
      !Number.isFinite(row.averageRating) ||
      typeof row.ratingAppearances !== "number" ||
      !Number.isSafeInteger(row.ratingAppearances) ||
      row.ratingAppearances < 0
    )
      throw Error(
        "Career contribution requires all four published v3 rating fields",
      );
    const units = Math.round(row.Rating * SCALE);
    if (
      !Number.isSafeInteger(units) ||
      Math.abs(row.Rating - units / SCALE) > 1e-10
    )
      throw Error(
        "Career contribution requires a five-decimal published season Rating",
      );
    const averageTicks = Math.round(row.averageRating * SCALE);
    if (
      !Number.isSafeInteger(averageTicks) ||
      Math.abs(row.averageRating - averageTicks / SCALE) > 1e-10 ||
      (row.ratingAppearances > 0 &&
        Math.abs(
          row.averageRating -
            impactFields(row.Rating, row.ratingAppearances).averageRating,
        ) >
          1 / SCALE + 1e-10)
    )
      throw Error("Invalid published season average contribution");
    if (row.ratingAppearances === 0 && (units !== 0 || row.averageRating !== 0))
      throw Error("Zero-appearance season contribution must be zero");
    ticks += units;
    appearances += row.ratingAppearances;
    if (!Number.isSafeInteger(ticks) || !Number.isSafeInteger(appearances))
      throw Error("Career contribution exceeds safe integer precision");
  }
  return impactFields(ticks / SCALE, appearances);
}

/** PS and PT must be composed separately: traded-player PT is not a sum of PS. */
export function composePublishedCareerImpacts(
  rows: readonly Row[],
  split: boolean,
): Map<string, ImpactFields> {
  const groups = new Map<string, Row[]>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (
      typeof row.seasonId !== "string" ||
      !row.seasonId ||
      typeof row.playerId !== "string" ||
      !row.playerId ||
      (split && (typeof row.gshlTeamId !== "string" || !row.gshlTeamId))
    )
      throw Error(
        "Canonical season, player and split team required for career contribution",
      );
    const key = careerImpactKey(
      {
        playerId: row.playerId,
        ...(split ? { gshlTeamId: String(row.gshlTeamId) } : {}),
        seasonType: String(row.seasonType ?? ""),
      },
      split,
    );
    const period = JSON.stringify([row.seasonId, key]);
    if (seen.has(period))
      throw Error("Duplicate published season contribution");
    seen.add(period);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return new Map(
    [...groups].map(([key, group]) => [key, sumPublishedCareerImpact(group)]),
  );
}
