import type { DatabaseRecord } from "../../integrations/data/records";
import {
  rankRowsWithRankingEngine,
  type RankingEngineDataContext,
} from "./ranking-engine";

export type CalderPatch = {
  id: string;
  seasonId: string;
  teamId: string;
  before: { calderRating: unknown; calderRk: unknown };
  data: { calderRating: number; calderRk: number | null };
};

/** Recompute in the full season cohort; persist only the requested Calder fields. */
export async function planCalderBackfill(
  rows: DatabaseRecord[],
  context: RankingEngineDataContext,
): Promise<CalderPatch[]> {
  const regular = rows.filter((row) => row.seasonType === "RS");
  const ranked = await rankRowsWithRankingEngine(regular, {
    dataModelName: "TeamSeasonStatLine",
    mutate: false,
    dataContext: context,
  });
  const originals = new Map(regular.map((row) => [row.id, row]));
  return ranked.flatMap((row) => {
    const before = originals.get(row.id);
    if (!before) throw new Error("Calder calculation returned an unknown row");
    const rating = Number(row.calderRating);
    const rank =
      row.calderRk === null || row.calderRk === "" || row.calderRk === undefined
        ? null
        : Number(row.calderRk);
    if (!Number.isFinite(rating) || (rank !== null && !Number.isFinite(rank)))
      throw new Error("Calder calculation returned invalid ratings");
    if (before.calderRating === rating && before.calderRk === rank) return [];
    return [
      {
        id: String(row.id),
        seasonId: String(row.seasonId),
        teamId: String(row.gshlTeamId),
        before: {
          calderRating: before.calderRating ?? null,
          calderRk: before.calderRk ?? null,
        },
        data: { calderRating: rating, calderRk: rank },
      },
    ];
  });
}
