import type { Doc, Id } from "./_generated/dataModel";
import type { DatabaseReader } from "./_generated/server";

const num = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

async function collectTeamsBySeason(
  db: DatabaseReader,
  seasons: Doc<"seasons">[],
): Promise<Doc<"teams">[]> {
  const pages = await Promise.all(
    seasons.map((season) =>
      db
        .query("teams")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
        .collect(),
    ),
  );
  return pages.flat();
}

async function collectMatchupsBySeason(
  db: DatabaseReader,
  seasons: Doc<"seasons">[],
): Promise<Doc<"matchups">[]> {
  const pages = await Promise.all(
    seasons.map((season) =>
      db
        .query("matchups")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
        .collect(),
    ),
  );
  return pages.flat();
}

async function collectTeamAwardsBySeason(
  db: DatabaseReader,
  seasons: Doc<"seasons">[],
): Promise<Doc<"teamAwards">[]> {
  const pages = await Promise.all(
    seasons.map((season) =>
      db
        .query("teamAwards")
        .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
        .collect(),
    ),
  );
  return pages.flat();
}

export interface UfaOddsData {
  contracts: Doc<"contracts">[];
  franchises: Doc<"franchises">[];
  matchups: Doc<"matchups">[];
  orderedSeasons: Doc<"seasons">[];
  playerById: Map<string, Doc<"players">>;
  players: Doc<"players">[];
  teamAwards: Doc<"teamAwards">[];
  teams: Doc<"teams">[];
  loadSigningWindow: (signingSeasonId: Id<"seasons">) => Promise<{
    nhlStats: Doc<"playerNhlStatLines">[];
    picks: Doc<"draftPicks">[];
  }>;
}

/**
 * Loads the shared inputs for every open UFA group in one function execution.
 * Formula-wide populations are read once instead of once per group. Inputs
 * that can be narrowed without changing the odds use indexed ranges, and
 * signing-window reads are memoized across groups from the same season.
 */
export async function loadUfaOddsData(
  db: DatabaseReader,
  groups: readonly Doc<"ufaOfferGroups">[],
  offers: readonly Doc<"ufaOffers">[],
): Promise<UfaOddsData> {
  const seasons = await db.query("seasons").collect();
  const orderedSeasons = [...seasons].sort(
    (left, right) => num(left.year) - num(right.year),
  );
  const seasonIndexById = new Map(
    orderedSeasons.map((season, index) => [String(season._id), index]),
  );
  const groupIds = new Set(groups.map((group) => String(group._id)));
  const pendingOwners = new Map<string, Id<"owners">>();
  for (const offer of offers) {
    if (offer.status === "pending" && groupIds.has(String(offer.groupId))) {
      pendingOwners.set(String(offer.ownerId), offer.ownerId);
    }
  }

  const [players, contractPages, teams, franchises, matchups, teamAwards] =
    await Promise.all([
      db.query("players").collect(),
      Promise.all(
        [...pendingOwners.values()].map((ownerId) =>
          db
            .query("contracts")
            .withIndex("by_ownerId", (q) => q.eq("ownerId", ownerId))
            .collect(),
        ),
      ),
      collectTeamsBySeason(db, orderedSeasons),
      db.query("franchises").collect(),
      collectMatchupsBySeason(db, orderedSeasons),
      collectTeamAwardsBySeason(db, orderedSeasons),
    ]);
  const contracts = contractPages.flat();
  const playerById = new Map<string, Doc<"players">>(
    players.map((player) => [String(player._id), player]),
  );

  const draftPicksBySeasonId = new Map<string, Promise<Doc<"draftPicks">[]>>();
  const nhlStatsBySeasonId = new Map<
    string,
    Promise<Doc<"playerNhlStatLines">[]>
  >();
  const signingWindows = new Map<
    string,
    Promise<{
      nhlStats: Doc<"playerNhlStatLines">[];
      picks: Doc<"draftPicks">[];
    }>
  >();
  const draftPicksForSeason = (
    season: Doc<"seasons">,
  ): Promise<Doc<"draftPicks">[]> => {
    const seasonId = String(season._id);
    const pending = draftPicksBySeasonId.get(seasonId);
    if (pending) return pending;
    const created = db
      .query("draftPicks")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect();
    draftPicksBySeasonId.set(seasonId, created);
    return created;
  };
  const nhlStatsForSeason = (
    season: Doc<"seasons">,
  ): Promise<Doc<"playerNhlStatLines">[]> => {
    const seasonId = String(season._id);
    const pending = nhlStatsBySeasonId.get(seasonId);
    if (pending) return pending;
    const created = db
      .query("playerNhlStatLines")
      .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
      .collect();
    nhlStatsBySeasonId.set(seasonId, created);
    return created;
  };
  const loadSigningWindow = (signingSeasonId: Id<"seasons">) => {
    const cacheKey = String(signingSeasonId);
    let pending = signingWindows.get(cacheKey);
    if (pending) return pending;

    pending = (async () => {
      const signingIndex = seasonIndexById.get(cacheKey) ?? -1;
      if (signingIndex < 0) return { nhlStats: [], picks: [] };
      const futureSeasons = orderedSeasons.slice(
        signingIndex + 1,
        signingIndex + 4,
      );
      const picksPromise = Promise.all(
        futureSeasons.map(draftPicksForSeason),
      ).then((pages) => pages.flat());
      let nhlStats: Doc<"playerNhlStatLines">[] = [];
      for (let index = signingIndex; index >= 0; index -= 1) {
        const season = orderedSeasons[index];
        if (!season) continue;
        nhlStats = await nhlStatsForSeason(season);
        if (nhlStats.length) break;
      }
      return { nhlStats, picks: await picksPromise };
    })();
    signingWindows.set(cacheKey, pending);
    return pending;
  };

  return {
    contracts,
    franchises,
    loadSigningWindow,
    matchups,
    orderedSeasons,
    playerById,
    players,
    teamAwards,
    teams,
  };
}
