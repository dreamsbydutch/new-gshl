import { rankRowsWithRankingEngine } from "../ranking/ranking-engine";
import type {
  DualRatingRow,
  DualRatingSeason,
} from "../../integrations/nhl/dual-ratings";
import type { DatabaseRecord } from "../../integrations/data/records";

/** An explicit NHL backfill must never broaden into unrelated season ratings. */
export function selectNhlRatingSeasons<T extends DualRatingSeason>(
  seasons: readonly T[],
  requestedIds?: readonly string[],
): T[] {
  const available = new Set(seasons.map((entry) => entry.season._id));
  if (available.size !== seasons.length)
    throw Error("Duplicate NHL rating season inventory");
  if (requestedIds === undefined) return [...seasons];
  if (
    !requestedIds.length ||
    new Set(requestedIds).size !== requestedIds.length ||
    requestedIds.some((id) => !id || id.trim() !== id || !available.has(id))
  )
    throw Error(
      "Explicit NHL rating seasons are missing, invalid or duplicated",
    );
  const wanted = new Set(requestedIds);
  return seasons.filter((entry) => wanted.has(entry.season._id));
}

export function canonicalRatingJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, nested]) => [key, normalize(nested)]),
      );
    return item;
  };
  return JSON.stringify(normalize(value));
}
export async function prepareDualRatingEntries(seasons: DualRatingSeason[]) {
  const entries: Array<{
    statLineId: string;
    expectedRow: DualRatingRow;
    expectedSeasonRating?: number | null;
    fantasySeasonRating: number;
  }> = [];
  const seen = new Set<string>();
  for (const { season, stats } of seasons) {
    const playerIds = new Set<string>();
    for (const row of stats) {
      if (
        row.seasonId !== season._id ||
        seen.has(row._id) ||
        playerIds.has(row.playerId)
      )
        throw Error("Duplicate or out-of-scope NHL season stat line");
      seen.add(row._id);
      playerIds.add(row.playerId);
    }
    if (!stats.length) continue;
    const rows = stats.map((row) => ({
      ...row,
      id: row._id,
    })) as DatabaseRecord[];
    const scored = await rankRowsWithRankingEngine(rows, {
      dataModelName: "PlayerNHL",
      mutate: false,
      dataContext: {
        playerNhlRows: rows,
        seasonRows: [{ ...season, id: season._id } as DatabaseRecord],
      },
    });
    const byId = new Map(scored.map((row) => [row.id, row]));
    if (byId.size !== stats.length)
      throw Error("Fantasy rating population changed");
    for (const row of stats) {
      const rating = byId.get(row._id)?.seasonRating;
      if (typeof rating !== "number" || !Number.isFinite(rating))
        throw Error("Fantasy season rating is not finite");
      const previous = row.seasonRating;
      if (
        previous !== undefined &&
        previous !== null &&
        typeof previous !== "number"
      )
        throw Error("Unexpected stored fantasy rating type");
      entries.push({
        statLineId: row._id,
        expectedRow: row,
        ...(previous !== undefined ? { expectedSeasonRating: previous } : {}),
        fantasySeasonRating: rating,
      });
    }
  }
  return entries;
}

/** Exact preservation check for every field outside the two authorized ratings. */
export function assertDualRatingPreservation(
  before: DualRatingRow[],
  after: DualRatingRow[],
) {
  if (before.length !== after.length)
    throw Error("NHL stat population changed");
  const actual = new Map(after.map((row) => [row._id, row]));
  if (actual.size !== before.length) throw Error("Duplicate NHL stat identity");
  const preserved = (row: DualRatingRow) =>
    Object.fromEntries(
      Object.entries(row).filter(
        ([key]) => key !== "hockeyRating" && key !== "seasonRating",
      ),
    );
  for (const row of before) {
    const next = actual.get(row._id);
    if (
      !next ||
      canonicalRatingJson(preserved(row)) !==
        canonicalRatingJson(preserved(next))
    )
      throw Error("NHL source statistics or unrelated derived fields changed");
  }
}
