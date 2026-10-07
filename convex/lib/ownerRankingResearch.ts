import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { AwardsList, MatchupType, SeasonType } from "../../src/lib/types";
import { buildOwnerRankings } from "../../src/lib/utils/features/owner-rankings";
import { toUtcTimestamp, utcTimestampToDateKey } from "./timestamps";

const asNumber = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const dateKey = (value: unknown) => utcTimestampToDateKey(value) ?? "";
const isoTimestamp = (value: unknown) => {
  const timestamp = toUtcTimestamp(value);
  return timestamp === null ? undefined : new Date(timestamp).toISOString();
};

/** The public Owner Ladder model, limited to results available at the cutoff. */
export async function buildOwnerRankingFacts(
  ctx: QueryCtx,
  seasons: Doc<"seasons">[],
  franchises: Doc<"franchises">[],
  conferences: Doc<"conferences">[],
  asOf?: string,
) {
  if (seasons.length > 40)
    throw new Error("Owner ranking season history exceeds bound");
  const [
    owners,
    allTeams,
    allWeeks,
    allMatchups,
    allTeamAwards,
    allPowerRankingStats,
  ] = await Promise.all([
    ctx.db.query("owners").collect(),
    Promise.all(
      seasons.map((season) =>
        ctx.db
          .query("teams")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect(),
      ),
    ).then((rows) => rows.flat()),
    Promise.all(
      seasons.map((season) =>
        ctx.db
          .query("weeks")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect(),
      ),
    ).then((rows) => rows.flat()),
    Promise.all(
      seasons.map((season) =>
        ctx.db
          .query("matchups")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect(),
      ),
    ).then((rows) => rows.flat()),
    Promise.all(
      seasons.map((season) =>
        ctx.db
          .query("teamAwards")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect(),
      ),
    ).then((rows) => rows.flat()),
    Promise.all(
      seasons.map((season) =>
        ctx.db
          .query("teamWeekStatLines")
          .withIndex("by_seasonId", (q) => q.eq("seasonId", season._id))
          .collect(),
      ),
    ).then((rows) => rows.flat()),
  ]);
  const franchiseById = new Map(
    franchises.map((franchise) => [String(franchise._id), franchise]),
  );
  const conferenceById = new Map(
    conferences.map((conference) => [String(conference._id), conference]),
  );
  const ownerById = new Map(owners.map((owner) => [String(owner._id), owner]));
  const allowedSeasonIds = new Set(
    seasons.map((candidate) => String(candidate._id)),
  );
  const completedWeekIds = new Set(
    allWeeks
      .filter(
        (week) =>
          !asOf || (dateKey(week.endDate) && dateKey(week.endDate) <= asOf),
      )
      .map((week) => String(week._id)),
  );
  const completedSeasonIds = new Set(
    seasons
      .filter(
        (season) =>
          !asOf || (dateKey(season.endDate) && dateKey(season.endDate) <= asOf),
      )
      .map((season) => String(season._id)),
  );
  const rankings = buildOwnerRankings({
    owners: owners.map((owner) => ({
      ...owner,
      id: String(owner._id),
      nickName: String(owner.nickName ?? ""),
      email: owner.email ?? undefined,
      owing: asNumber(owner.owing),
      createdAt: new Date(toUtcTimestamp(owner.createdAt) ?? 0),
      updatedAt: new Date(toUtcTimestamp(owner.updatedAt) ?? 0),
    })),
    seasons: seasons.map((season) => ({
      ...season,
      id: String(season._id),
      year: asNumber(season.year),
      categories: season.categories ?? [],
      rosterSpots: season.rosterSpots ?? [],
      startDate: dateKey(season.startDate),
      endDate: dateKey(season.endDate),
      signingEndDate: dateKey(season.signingEndDate),
      draftStartAt: isoTimestamp(season.draftStartAt),
      createdAt: new Date(toUtcTimestamp(season.createdAt) ?? 0),
      updatedAt: new Date(toUtcTimestamp(season.updatedAt) ?? 0),
    })),
    teams: allTeams
      .filter((team) => allowedSeasonIds.has(String(team.seasonId)))
      .map((team) => {
        const franchise = franchiseById.get(String(team.franchiseId));
        const conference = conferenceById.get(String(team.confId));
        const owner = franchise
          ? ownerById.get(String(franchise.ownerId))
          : undefined;
        return {
          id: String(team._id),
          seasonId: String(team.seasonId),
          franchiseId: String(team.franchiseId),
          name: franchise?.name ?? null,
          abbr: franchise?.abbr ?? null,
          logoUrl: franchise?.logoUrl ?? null,
          isActive: franchise?.isActive ?? false,
          yahooId: team.yahooId ?? null,
          confId: String(team.confId),
          confName: conference?.name ?? null,
          confAbbr: conference?.abbr ?? null,
          confLogoUrl: conference?.logoUrl ?? null,
          ownerId: owner ? String(owner._id) : null,
          ownerFirstName: owner?.firstName ?? null,
          ownerLastName: owner?.lastName ?? null,
          ownerNickname: owner?.nickName ?? null,
          ownerEmail: owner?.email ?? null,
          ownerOwing: owner ? asNumber(owner.owing) : null,
          ownerIsActive: owner?.isActive ?? false,
        };
      }),
    weeks: allWeeks
      .filter((week) => allowedSeasonIds.has(String(week.seasonId)))
      .map((week) => ({
        id: String(week._id),
        seasonId: String(week.seasonId),
        weekNum: asNumber(week.weekNum),
        weekType: week.weekType as SeasonType,
        gameDays: asNumber(week.gameDays),
        startDate: dateKey(week.startDate),
        endDate: dateKey(week.endDate),
        isActive: week.isActive,
        isPlayoffs: week.isPlayoffs,
        createdAt: new Date(toUtcTimestamp(week.createdAt) ?? 0),
        updatedAt: new Date(toUtcTimestamp(week.updatedAt) ?? 0),
      })),
    matchups: allMatchups
      .filter(
        (matchup) =>
          allowedSeasonIds.has(String(matchup.seasonId)) &&
          completedWeekIds.has(String(matchup.weekId)) &&
          (matchup.isComplete === true ||
            matchup.homeWin === true ||
            matchup.awayWin === true ||
            matchup.tie === true) &&
          matchup.homeScore != null &&
          matchup.awayScore != null,
      )
      .map((matchup) => ({
        id: String(matchup._id),
        seasonId: String(matchup.seasonId),
        weekId: String(matchup.weekId),
        homeTeamId: String(matchup.homeTeamId),
        awayTeamId: String(matchup.awayTeamId),
        gameType: matchup.gameType as MatchupType,
        homeRank: asNumber(matchup.homeRank),
        awayRank: asNumber(matchup.awayRank),
        homeScore: asNumber(matchup.homeScore),
        awayScore: asNumber(matchup.awayScore),
        homeWin: Boolean(matchup.homeWin),
        awayWin: Boolean(matchup.awayWin),
        tie: Boolean(matchup.tie),
        isComplete: Boolean(matchup.isComplete),
        rating: asNumber(matchup.rating),
        ratingPre: asNumber(matchup.ratingPre),
        ratingRealized: asNumber(matchup.ratingRealized),
        ratingCompetitive: asNumber(matchup.ratingCompetitive),
        ratingImportance: asNumber(matchup.ratingImportance),
        ratingRosterStrength: asNumber(matchup.ratingRosterStrength),
        createdAt: new Date(toUtcTimestamp(matchup.createdAt) ?? 0),
        updatedAt: new Date(toUtcTimestamp(matchup.updatedAt) ?? 0),
      })),
    teamAwards: allTeamAwards.flatMap((award) =>
      award.ownerId && completedSeasonIds.has(String(award.seasonId))
        ? [
            {
              ...award,
              id: String(award._id),
              seasonId: String(award.seasonId),
              ownerId: String(award.ownerId),
              teamId: award.teamId ? String(award.teamId) : undefined,
              nomineeIds: (award.nomineeIds ?? []).map(String),
              award: award.award as AwardsList,
              createdAt: new Date(toUtcTimestamp(award.createdAt) ?? 0),
              updatedAt: new Date(toUtcTimestamp(award.updatedAt) ?? 0),
            },
          ]
        : [],
    ),
    powerRankingStats: allPowerRankingStats
      .filter(
        (row) =>
          allowedSeasonIds.has(String(row.seasonId)) &&
          completedWeekIds.has(String(row.weekId)),
      )
      .map((row) => ({
        seasonId: String(row.seasonId),
        weekId: String(row.weekId),
        gshlTeamId: String(row.gshlTeamId),
        powerRk: asNumber(row.powerRk),
      })),
  });
  return rankings.rankings
    .filter((entry) => asOf !== undefined || entry.isActive)
    .map((entry) => ({
      ownerId: entry.owner.id,
      rank: entry.rank,
      gmName: entry.displayName,
      teamName: entry.primaryTeam?.name ?? undefined,
      rating: entry.rating,
      rankChange: entry.rankChange,
      gamesPlayed: entry.overallRecord.games + entry.playoffRecord.games,
      overallWins: entry.overallRecord.wins,
      overallLosses: entry.overallRecord.losses,
      playoffAppearances: entry.playoffAppearances,
      cups: entry.cups,
    }));
}

export async function loadOwnerRankingResearch(
  ctx: QueryCtx,
  seasonId: Id<"seasons">,
  asOf: string,
) {
  const [season, seasons, franchises, conferences] = await Promise.all([
    ctx.db.get(seasonId),
    ctx.db.query("seasons").take(41),
    ctx.db.query("franchises").collect(),
    ctx.db.query("conferences").collect(),
  ]);
  if (seasons.length > 40)
    throw new Error("Owner ranking season history exceeds bound");
  if (!season) return [];
  return buildOwnerRankingFacts(
    ctx,
    seasons.filter((row) => asNumber(row.year) <= asNumber(season.year)),
    franchises,
    conferences,
    asOf,
  );
}
