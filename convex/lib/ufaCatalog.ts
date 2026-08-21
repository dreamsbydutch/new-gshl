import type { Doc } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";

const seasonYear = (season: Doc<"seasons">): number => {
  const year = Number(season.year);
  return Number.isFinite(year) ? year : Number.NEGATIVE_INFINITY;
};

export async function loadLatestNhlStats(
  db: DatabaseReader,
  orderedSeasons: readonly Doc<"seasons">[],
  signingSeason: Doc<"seasons"> | undefined,
): Promise<Doc<"playerNhlStatLines">[]> {
  const signingIndex = signingSeason
    ? orderedSeasons.findIndex((season) => season._id === signingSeason._id)
    : -1;

  for (let index = signingIndex; index >= 0; index -= 1) {
    const season = orderedSeasons[index];
    if (!season) continue;
    const stats = await db
      .query("playerNhlStatLines")
      .withIndex("by_seasonId", (query) => query.eq("seasonId", season._id))
      .collect();
    if (stats.length) return stats;
  }

  return [];
}

/**
 * Loads the UFA catalog through a fixed set of indexed ranges. In particular,
 * NHL statistics are loaded once for the latest populated season instead of
 * once per active player across their complete history.
 */
export async function loadUfaCatalog(db: DatabaseReader) {
  const seasons = await db.query("seasons").collect();
  const orderedSeasons = [...seasons].sort(
    (left, right) => seasonYear(left) - seasonYear(right),
  );
  const signingSeason = orderedSeasons.find((season) => season.isActive);

  const [players, nhlTeams, franchises, teams, contracts, nhlStats] =
    await Promise.all([
      db
        .query("players")
        .withIndex("by_isActive_overallRating", (query) =>
          query.eq("isActive", true),
        )
        .collect(),
      db.query("nhlTeams").collect(),
      db.query("franchises").collect(),
      signingSeason
        ? db
            .query("teams")
            .withIndex("by_seasonId", (query) =>
              query.eq("seasonId", signingSeason._id),
            )
            .collect()
        : Promise.resolve([]),
      db.query("contracts").collect(),
      loadLatestNhlStats(db, orderedSeasons, signingSeason),
    ]);

  return {
    seasons: orderedSeasons,
    players,
    nhlStats,
    nhlTeams,
    franchises,
    teams,
    contracts,
  };
}
