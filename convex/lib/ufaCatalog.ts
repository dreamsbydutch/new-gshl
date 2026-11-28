import type { Doc } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import { resolveUfaSigningSeason } from "../../src/lib/utils/features/ufa-deadline";
import { selectSeasonScope } from "../../src/lib/utils/domain/season-scope";

const seasonYear = (season: Doc<"seasons">): number => {
  const year = Number(season.year);
  return Number.isFinite(year) ? year : Number.NEGATIVE_INFINITY;
};

export async function loadLatestNhlStats(
  db: DatabaseReader,
  orderedSeasons: readonly Doc<"seasons">[],
  signingSeason: Doc<"seasons"> | undefined,
  playerIds?: readonly string[],
): Promise<Doc<"playerNhlStatLines">[]> {
  if (playerIds?.length === 0) return [];
  const signingIndex = signingSeason
    ? orderedSeasons.findIndex((season) => season._id === signingSeason._id)
    : -1;

  for (let index = signingIndex; index >= 0; index -= 1) {
    const season = orderedSeasons[index];
    if (!season) continue;
    const range = db
      .query("playerNhlStatLines")
      .withIndex("by_seasonId", (query) => query.eq("seasonId", season._id));
    if (playerIds) {
      if (!(await range.first())) continue;
      const groups = await Promise.all(
        playerIds.map((playerId) =>
          db
            .query("playerNhlStatLines")
            .withIndex("by_seasonId_playerId", (q) =>
              q.eq("seasonId", season._id).eq("playerId", playerId),
            )
            .collect(),
        ),
      );
      return groups.flat().sort((a, b) => a._creationTime - b._creationTime);
    }
    const stats = await range.collect();
    if (stats.length) return stats;
  }

  return [];
}

/**
 * Loads the UFA catalog through a fixed set of indexed ranges. In particular,
 * NHL statistics are loaded once for the latest populated season instead of
 * once per active player across their complete history.
 */
export async function loadUfaCatalog(db: DatabaseReader, deferStats = false) {
  const seasons = await db.query("seasons").collect();
  const allOrderedSeasons = [...seasons].sort(
    (left, right) => seasonYear(left) - seasonYear(right),
  );
  const orderedSeasons = selectSeasonScope(allOrderedSeasons);
  const signingSeason = resolveUfaSigningSeason(orderedSeasons);

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
      deferStats
        ? []
        : loadLatestNhlStats(db, allOrderedSeasons, signingSeason),
    ]);

  return {
    seasons: orderedSeasons,
    allOrderedSeasons,
    signingSeason,
    players,
    nhlStats,
    nhlTeams,
    franchises,
    teams,
    contracts,
  };
}
