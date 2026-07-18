import type {
  GSHLTeam,
  Matchup,
  Owner,
  OwnerLadderBattle,
  OwnerRankingEntry,
  OwnerRankingRecord,
  OwnerRankingsViewModel,
  Season,
  TeamAward,
  Week,
} from "@gshl-types";
import { AwardsList, MatchupType } from "@gshl-types";

/** The ladder's normal reference band. These are guideposts, not hard limits. */
export const OWNER_LADDER_REFERENCE_FLOOR = 0;
export const OWNER_LADDER_REFERENCE_CEILING = 1000;
export const OWNER_LADDER_BASE_RATING = 250;

export const OWNER_LADDER_BONUSES = {
  playoffAppearance: 8,
  finalsAppearance: 18,
  cup: 40,
  leadershipAward: 20,
  otherAward: 5,
  brophy: -10,
} as const;

const PLAYOFF_TYPES = new Set<MatchupType>([
  MatchupType.QUARTER_FINAL,
  MatchupType.SEMI_FINAL,
  MatchupType.FINAL,
]);

interface MutableRecord {
  wins: number;
  losses: number;
  ties: number;
}

interface OwnerLadderState {
  owner: Owner;
  primaryTeam: GSHLTeam | null;
  teamIds: Set<string>;
  seasonIds: Set<string>;
  elo: number;
  seedRating: number;
  lastDelta: number;
  achievementBonus: number;
  overall: MutableRecord;
  conference: MutableRecord;
  playoffs: MutableRecord;
  playoffAppearances: number;
  finalsAppearances: number;
  cups: number;
  totalAwards: number;
  coachAwards: number;
  gmAwards: number;
  otherAwards: number;
}

const emptyRecord = (): MutableRecord => ({ wins: 0, losses: 0, ties: 0 });

const normalizeId = (value: unknown) => {
  if (value == null) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};

const numericScore = (value: unknown): number | null => {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isCompleteMatchup = (matchup: Matchup) =>
  numericScore(matchup.homeScore) != null &&
  numericScore(matchup.awayScore) != null;

const ownerName = (owner: Owner) =>
  owner.nickName?.trim() ||
  [owner.firstName, owner.lastName].filter(Boolean).join(" ").trim() ||
  `Owner ${owner.id}`;

const gamesPlayed = (record: MutableRecord) =>
  record.wins + record.losses + record.ties;

const recordPercentage = (record: MutableRecord) => {
  const games = gamesPlayed(record);
  return games ? (record.wins + record.ties * 0.5) / games : 0.5;
};

const toRecord = (record: MutableRecord): OwnerRankingRecord => ({
  ...record,
  games: gamesPlayed(record),
  winPercentage: recordPercentage(record),
});

const bayesianPercentage = (record: MutableRecord, priorGames: number) => {
  const games = gamesPlayed(record);
  return (
    (record.wins + record.ties * 0.5 + priorGames * 0.5) / (games + priorGames)
  );
};

const performanceAdjustment = (state: OwnerLadderState) =>
  (bayesianPercentage(state.overall, 20) - 0.5) * 160 +
  (bayesianPercentage(state.conference, 10) - 0.5) * 60 +
  (bayesianPercentage(state.playoffs, 6) - 0.5) * 100;

const ladderRating = (state: OwnerLadderState) =>
  state.elo + state.achievementBonus + performanceAdjustment(state);

const expectedScore = (ratingA: number, ratingB: number) =>
  1 / (1 + 10 ** ((ratingB - ratingA) / 400));

const matchupK = (gameType: MatchupType) => {
  if (gameType === MatchupType.FINAL) return 40;
  if (gameType === MatchupType.SEMI_FINAL) return 34;
  if (gameType === MatchupType.QUARTER_FINAL) return 28;
  return 20;
};

const matchupActual = (homeScore: number, awayScore: number) => {
  if (homeScore > awayScore) return 1;
  if (awayScore > homeScore) return 0;
  return 0.5;
};

const applyRecordResult = (
  home: MutableRecord,
  away: MutableRecord,
  actualHome: number,
) => {
  if (actualHome === 1) {
    home.wins += 1;
    away.losses += 1;
  } else if (actualHome === 0) {
    away.wins += 1;
    home.losses += 1;
  } else {
    home.ties += 1;
    away.ties += 1;
  }
};

const makeState = (
  owner: Owner,
  seedRating: number,
  teams: GSHLTeam[],
): OwnerLadderState => {
  const ownerTeams = teams.filter(
    (team) => normalizeId(team.ownerId) === owner.id,
  );
  const primaryTeam =
    ownerTeams.find((team) => team.isActive) ?? ownerTeams.at(-1) ?? null;
  return {
    owner,
    primaryTeam,
    teamIds: new Set(ownerTeams.map((team) => String(team.id))),
    seasonIds: new Set(ownerTeams.map((team) => String(team.seasonId))),
    elo: seedRating,
    seedRating,
    lastDelta: 0,
    achievementBonus: 0,
    overall: emptyRecord(),
    conference: emptyRecord(),
    playoffs: emptyRecord(),
    playoffAppearances: 0,
    finalsAppearances: 0,
    cups: 0,
    totalAwards: 0,
    coachAwards: 0,
    gmAwards: 0,
    otherAwards: 0,
  };
};

const rankStates = (states: Map<string, OwnerLadderState>) =>
  [...states.values()]
    .sort((a, b) => {
      const ratingDifference = ladderRating(b) - ladderRating(a);
      if (Math.abs(ratingDifference) > 0.0001) return ratingDifference;
      return ownerName(a.owner).localeCompare(ownerName(b.owner));
    })
    .map((state, index) => ({ state, rank: index + 1 }));

const fallbackOwnerFromTeam = (team: GSHLTeam): Owner | null => {
  const id = normalizeId(team.ownerId);
  if (!id) return null;
  return {
    id,
    firstName: team.ownerFirstName ?? "",
    lastName: team.ownerLastName ?? "",
    nickName: team.ownerNickname ?? team.name ?? "",
    email: team.ownerEmail,
    owing: team.ownerOwing ?? 0,
    isActive: team.ownerIsActive,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
};

export function buildOwnerRankings(params: {
  owners: Owner[];
  teams: GSHLTeam[];
  matchups: Matchup[];
  seasons: Season[];
  weeks: Week[];
  teamAwards: TeamAward[];
}): OwnerRankingsViewModel {
  const { teams, matchups, seasons, weeks, teamAwards } = params;
  const ownerById = new Map(
    params.owners.map((owner) => [String(owner.id), owner]),
  );
  for (const team of teams) {
    const fallback = fallbackOwnerFromTeam(team);
    if (fallback && !ownerById.has(fallback.id))
      ownerById.set(fallback.id, fallback);
  }

  const seasonsAscending = [...seasons].sort((a, b) => a.year - b.year);
  const latestSeason = seasonsAscending.at(-1) ?? null;
  const seasonById = new Map(
    seasons.map((season) => [String(season.id), season]),
  );
  const weekById = new Map(weeks.map((week) => [String(week.id), week]));
  const teamById = new Map(teams.map((team) => [String(team.id), team]));
  const firstSeasonYearByOwner = new Map<string, number>();
  for (const team of teams) {
    const ownerId = normalizeId(team.ownerId);
    const season = seasonById.get(String(team.seasonId));
    if (!ownerId || !season) continue;
    const current = firstSeasonYearByOwner.get(ownerId);
    if (current == null || season.year < current)
      firstSeasonYearByOwner.set(ownerId, season.year);
  }

  const states = new Map<string, OwnerLadderState>();
  const previousRanks = new Map<string, number>();
  const recentBattles: OwnerLadderBattle[] = [];

  const ensureOwner = (ownerId: string) => {
    const existing = states.get(ownerId);
    if (existing) return existing;
    const owner = ownerById.get(ownerId);
    if (!owner) return null;
    const state = makeState(owner, OWNER_LADDER_BASE_RATING, teams);
    states.set(ownerId, state);
    return state;
  };

  for (const season of seasonsAscending) {
    const entrants = [...ownerById.values()].filter(
      (owner) => firstSeasonYearByOwner.get(owner.id) === season.year,
    );
    for (const owner of entrants) {
      if (!states.has(owner.id)) {
        states.set(owner.id, makeState(owner, OWNER_LADDER_BASE_RATING, teams));
      }
    }

    if (season.id === latestSeason?.id) {
      for (const { state, rank } of rankStates(states))
        previousRanks.set(state.owner.id, rank);
    }

    const seasonMatchups = matchups
      .filter(
        (matchup) =>
          normalizeId(matchup.seasonId) === String(season.id) &&
          isCompleteMatchup(matchup),
      )
      .sort((a, b) => {
        const weekA = weekById.get(String(a.weekId));
        const weekB = weekById.get(String(b.weekId));
        const weekDifference = (weekA?.weekNum ?? 0) - (weekB?.weekNum ?? 0);
        if (weekDifference) return weekDifference;
        return String(a.createdAt).localeCompare(String(b.createdAt));
      });

    for (const matchup of seasonMatchups) {
      const homeOwnerId = normalizeId(
        teamById.get(String(matchup.homeTeamId))?.ownerId,
      );
      const awayOwnerId = normalizeId(
        teamById.get(String(matchup.awayTeamId))?.ownerId,
      );
      if (!homeOwnerId || !awayOwnerId || homeOwnerId === awayOwnerId) continue;
      const homeState = ensureOwner(homeOwnerId);
      const awayState = ensureOwner(awayOwnerId);
      const homeScore = numericScore(matchup.homeScore);
      const awayScore = numericScore(matchup.awayScore);
      if (!homeState || !awayState || homeScore == null || awayScore == null)
        continue;

      const actualHome = matchupActual(homeScore, awayScore);
      const expectedHome = expectedScore(homeState.elo, awayState.elo);
      const marginMultiplier =
        1 + Math.min(Math.abs(homeScore - awayScore), 4) * 0.08;
      const rawDelta =
        matchupK(matchup.gameType) *
        marginMultiplier *
        (actualHome - expectedHome);
      const nextHomeElo = homeState.elo + rawDelta;
      const nextAwayElo = awayState.elo - rawDelta;
      const homeDelta = nextHomeElo - homeState.elo;
      const awayDelta = nextAwayElo - awayState.elo;
      homeState.elo = nextHomeElo;
      awayState.elo = nextAwayElo;
      homeState.lastDelta = homeDelta;
      awayState.lastDelta = awayDelta;

      if (
        matchup.gameType === MatchupType.CONFERENCE ||
        matchup.gameType === MatchupType.NON_CONFERENCE
      ) {
        applyRecordResult(homeState.overall, awayState.overall, actualHome);
      }
      if (matchup.gameType === MatchupType.CONFERENCE) {
        applyRecordResult(
          homeState.conference,
          awayState.conference,
          actualHome,
        );
      }
      if (PLAYOFF_TYPES.has(matchup.gameType)) {
        applyRecordResult(homeState.playoffs, awayState.playoffs, actualHome);
      }

      recentBattles.push({
        matchupId: String(matchup.id),
        seasonId: String(season.id),
        seasonName: season.name,
        gameType: String(matchup.gameType),
        homeOwnerId,
        awayOwnerId,
        homeOwnerName: ownerName(homeState.owner),
        awayOwnerName: ownerName(awayState.owner),
        homeScore,
        awayScore,
        homeDelta,
        awayDelta,
        winnerOwnerId:
          actualHome === 1
            ? homeOwnerId
            : actualHome === 0
              ? awayOwnerId
              : null,
      });
    }

    const playoffOwnerIds = new Set<string>();
    const finalistOwnerIds = new Set<string>();
    const seasonFinal = seasonMatchups.find(
      (matchup) => matchup.gameType === MatchupType.FINAL,
    );
    for (const matchup of seasonMatchups.filter((item) =>
      PLAYOFF_TYPES.has(item.gameType),
    )) {
      const homeOwnerId = normalizeId(
        teamById.get(String(matchup.homeTeamId))?.ownerId,
      );
      const awayOwnerId = normalizeId(
        teamById.get(String(matchup.awayTeamId))?.ownerId,
      );
      if (homeOwnerId) playoffOwnerIds.add(homeOwnerId);
      if (awayOwnerId) playoffOwnerIds.add(awayOwnerId);
      if (matchup.gameType === MatchupType.FINAL) {
        if (homeOwnerId) finalistOwnerIds.add(homeOwnerId);
        if (awayOwnerId) finalistOwnerIds.add(awayOwnerId);
      }
    }
    for (const ownerId of playoffOwnerIds) {
      const state = ensureOwner(ownerId);
      if (!state) continue;
      state.playoffAppearances += 1;
      state.achievementBonus += OWNER_LADDER_BONUSES.playoffAppearance;
    }
    for (const ownerId of finalistOwnerIds) {
      const state = ensureOwner(ownerId);
      if (!state) continue;
      state.finalsAppearances += 1;
      state.achievementBonus += OWNER_LADDER_BONUSES.finalsAppearance;
    }

    const seasonAwards = teamAwards.filter(
      (award) => normalizeId(award.seasonId) === String(season.id),
    );
    const cupAwards = seasonAwards.filter(
      (award) => award.award === AwardsList.GSHL_CUP,
    );
    const cupOwnerIds = new Set<string>();
    for (const award of cupAwards) {
      const ownerId =
        normalizeId(award.ownerId) ??
        normalizeId(teamById.get(String(award.teamId ?? ""))?.ownerId);
      if (ownerId) cupOwnerIds.add(ownerId);
    }
    if (!cupOwnerIds.size && seasonFinal) {
      const homeScore = numericScore(seasonFinal.homeScore);
      const awayScore = numericScore(seasonFinal.awayScore);
      if (homeScore != null && awayScore != null && homeScore !== awayScore) {
        const winningTeamId =
          homeScore > awayScore
            ? seasonFinal.homeTeamId
            : seasonFinal.awayTeamId;
        const ownerId = normalizeId(
          teamById.get(String(winningTeamId))?.ownerId,
        );
        if (ownerId) cupOwnerIds.add(ownerId);
      }
    }
    for (const ownerId of cupOwnerIds) {
      const state = ensureOwner(ownerId);
      if (!state) continue;
      state.cups += 1;
      state.achievementBonus += OWNER_LADDER_BONUSES.cup;
    }

    for (const award of seasonAwards) {
      const ownerId =
        normalizeId(award.ownerId) ??
        normalizeId(teamById.get(String(award.teamId ?? ""))?.ownerId);
      const state = ownerId ? ensureOwner(ownerId) : null;
      if (!state) continue;
      state.totalAwards += 1;
      if (award.award === AwardsList.GSHL_CUP) continue;
      if (award.award === AwardsList.BROPHY) {
        state.achievementBonus += OWNER_LADDER_BONUSES.brophy;
        continue;
      }
      if (award.award === AwardsList.JACK_ADAMS) {
        state.coachAwards += 1;
        state.achievementBonus += OWNER_LADDER_BONUSES.leadershipAward;
      } else if (award.award === AwardsList.GM_OF_THE_YEAR) {
        state.gmAwards += 1;
        state.achievementBonus += OWNER_LADDER_BONUSES.leadershipAward;
      } else {
        state.otherAwards += 1;
        state.achievementBonus += OWNER_LADDER_BONUSES.otherAward;
      }
    }
  }

  const ownerWithoutHistory = [...ownerById.values()]
    .filter((owner) => !states.has(owner.id))
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  for (const owner of ownerWithoutHistory) {
    states.set(owner.id, makeState(owner, OWNER_LADDER_BASE_RATING, teams));
  }

  const finalRanks = rankStates(states);
  const rankings: OwnerRankingEntry[] = finalRanks.map(({ state, rank }) => {
    const previousRank = previousRanks.get(state.owner.id) ?? rank;
    return {
      owner: state.owner,
      rank,
      previousRank,
      rankChange: previousRank - rank,
      displayName: ownerName(state.owner),
      isActive: state.owner.isActive,
      primaryTeam: state.primaryTeam,
      seasonsPlayed: state.seasonIds.size,
      rating: ladderRating(state),
      elo: state.elo,
      seedRating: state.seedRating,
      matchupDelta: state.lastDelta,
      performanceAdjustment: performanceAdjustment(state),
      achievementBonus: state.achievementBonus,
      overallRecord: toRecord(state.overall),
      conferenceRecord: toRecord(state.conference),
      playoffRecord: toRecord(state.playoffs),
      playoffAppearances: state.playoffAppearances,
      finalsAppearances: state.finalsAppearances,
      cups: state.cups,
      totalAwards: state.totalAwards,
      coachAwards: state.coachAwards,
      gmAwards: state.gmAwards,
      otherAwards: state.otherAwards,
    };
  });

  return {
    rankings,
    recentBattles: recentBattles.slice(-12).reverse(),
    latestSeasonId: latestSeason ? String(latestSeason.id) : null,
    latestSeasonName: latestSeason?.name ?? null,
    activeOwnerCount: rankings.filter((entry) => entry.isActive).length,
    inactiveOwnerCount: rankings.filter((entry) => !entry.isActive).length,
  };
}
