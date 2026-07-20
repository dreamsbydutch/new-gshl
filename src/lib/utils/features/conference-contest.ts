import type {
  ConferenceContestAwardSummary,
  ConferenceContestConferenceInfo,
  ConferenceContestOverallViewModel,
  ConferenceContestRating,
  ConferenceContestRatingComponents,
  ConferenceContestRecord,
  ConferenceContestSeasonViewModel,
  ConferenceContestWinner,
  GSHLTeam,
  Matchup,
  Season,
  TeamAward,
} from "@gshl-types";
import { AwardsList, MatchupType } from "@gshl-types";
import { getTeamAwardTeam } from "@gshl-lib/config/awards";
import { isPlayoffMatchupType } from "@gshl-utils/domain/matchup";

export type {
  ConferenceContestConferenceInfo,
  ConferenceContestOverallViewModel,
  ConferenceContestRecord,
  ConferenceContestSeasonViewModel,
} from "@gshl-types";

type TeamLike = GSHLTeam | Partial<GSHLTeam> | null | undefined;
type IdLike = string | number | null | undefined;
type ScoreLike = string | number | null | undefined;
type BooleanLike = string | number | boolean | null | undefined;

export const CONFERENCE_RATING_WEIGHTS = {
  headToHead: 0.35,
  playoffs: 0.3,
  cups: 0.2,
  awards: 0.15,
} as const;

export const CONFERENCE_PLAYOFF_WEIGHTS = {
  wins: 0.5,
  finals: 0.3,
  qualifiers: 0.2,
} as const;

export const CONFERENCE_RECENCY_RETENTION = 0.85;

const EMPTY_RECORD: ConferenceContestRecord = { wins: 0, losses: 0, ties: 0 };
const EXCLUDED_AWARDS = new Set<AwardsList>([
  AwardsList.GSHL_CUP,
  AwardsList.SUNVIEW,
  AwardsList.HICKORY,
  AwardsList.FIRST_AS,
  AwardsList.SECOND_AS,
  AwardsList.PLAYOFF_AS,
]);

export const isGshlTeam = (team: TeamLike): team is GSHLTeam => {
  if (!team || typeof team !== "object") return false;
  return "id" in team && "seasonId" in team && "confId" in team;
};

const normalizeId = (value: IdLike): string | null => {
  if (value == null) return null;
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  return normalized.length ? normalized : null;
};

const normalizeScore = (score: ScoreLike): number | null => {
  if (score == null) return null;
  const parsed = typeof score === "number" ? score : Number(score);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeBoolean = (value: BooleanLike): boolean | null => {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number")
    return value === 1 ? true : value === 0 ? false : null;
  const normalized = value.trim().toLowerCase();
  if (["true", "t", "yes", "y", "1"].includes(normalized)) return true;
  if (["false", "f", "no", "n", "0"].includes(normalized)) return false;
  return null;
};

const isComplete = (matchup: Pick<Matchup, "homeScore" | "awayScore">) =>
  normalizeScore(matchup.homeScore) != null &&
  normalizeScore(matchup.awayScore) != null;

const getMatchupWinner = (
  matchup: Pick<
    Matchup,
    "gameType" | "homeWin" | "awayWin" | "tie" | "homeScore" | "awayScore"
  >,
): ConferenceContestWinner => {
  const playoff = isPlayoffMatchupType(matchup.gameType);
  const homeScore = normalizeScore(matchup.homeScore);
  const awayScore = normalizeScore(matchup.awayScore);
  if (playoff && homeScore != null && awayScore != null) {
    return homeScore >= awayScore ? "home" : "away";
  }
  if (playoff && normalizeBoolean(matchup.tie) === true) return "home";
  if (normalizeBoolean(matchup.homeWin) === true) return "home";
  if (normalizeBoolean(matchup.awayWin) === true) return "away";
  if (normalizeBoolean(matchup.tie) === true) return "tie";
  if (homeScore == null || awayScore == null) return "unknown";
  if (homeScore > awayScore) return "home";
  if (awayScore > homeScore) return "away";
  return "tie";
};

const emptyRecordMap = (conferenceIds: string[]) =>
  Object.fromEntries(
    conferenceIds.map((id) => [id, { ...EMPTY_RECORD }]),
  ) as Record<string, ConferenceContestRecord>;

const applyResultToRecord = (
  matchup: Pick<
    Matchup,
    "gameType" | "homeWin" | "awayWin" | "tie" | "homeScore" | "awayScore"
  >,
  homeConfId: string,
  awayConfId: string,
  records: Record<string, ConferenceContestRecord>,
) => {
  records[homeConfId] ??= { ...EMPTY_RECORD };
  records[awayConfId] ??= { ...EMPTY_RECORD };
  const home = records[homeConfId];
  const away = records[awayConfId];
  if (!home || !away) return;
  const winner = getMatchupWinner(matchup);
  if (winner === "home") {
    home.wins += 1;
    away.losses += 1;
  } else if (winner === "away") {
    away.wins += 1;
    home.losses += 1;
  } else if (winner === "tie") {
    home.ties += 1;
    away.ties += 1;
  }
};

export const getSeasonConferences = (
  seasonId: string,
  gshlTeams: GSHLTeam[],
): ConferenceContestConferenceInfo[] => {
  const conferences = new Map<string, ConferenceContestConferenceInfo>();
  for (const team of gshlTeams) {
    if (normalizeId(team.seasonId) !== normalizeId(seasonId)) continue;
    const id = normalizeId(team.confId);
    if (!id || conferences.has(id)) continue;
    conferences.set(id, {
      id,
      name: team.confName ?? id,
      abbr: team.confAbbr,
      logoUrl: team.confLogoUrl,
    });
  }
  return [...conferences.values()].sort((a, b) => a.name.localeCompare(b.name));
};

export const getAllConferences = (
  gshlTeams: GSHLTeam[],
): ConferenceContestConferenceInfo[] => {
  const conferences = new Map<string, ConferenceContestConferenceInfo>();
  for (const team of gshlTeams) {
    const id = normalizeId(team.confId);
    if (!id || conferences.has(id)) continue;
    conferences.set(id, {
      id,
      name: team.confName ?? id,
      abbr: team.confAbbr,
      logoUrl: team.confLogoUrl,
    });
  }
  return [...conferences.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const evidenceShare = (left: number, right: number) => {
  const total = left + right;
  return total > 0 ? (left / total) * 100 : 50;
};

const recordEvidence = (record?: ConferenceContestRecord) =>
  (record?.wins ?? 0) + (record?.ties ?? 0) * 0.5;

const awardWeight = (award: AwardsList) =>
  award === AwardsList.JACK_ADAMS || award === AwardsList.GM_OF_THE_YEAR
    ? 3
    : 1;

const teamForAward = (
  award: TeamAward,
  teamsById: ReadonlyMap<string, GSHLTeam>,
) => getTeamAwardTeam(award, [...teamsById.values()]);

const buildAwardSummary = (
  conferenceIds: string[],
  seasonAwards: TeamAward[],
  teamsById: Map<string, GSHLTeam>,
): ConferenceContestAwardSummary => {
  const awardsByConferenceId = Object.fromEntries(
    conferenceIds.map((id) => [id, []]),
  ) as Record<string, TeamAward[]>;
  const coachAwardsByConferenceId = Object.fromEntries(
    conferenceIds.map((id) => [id, []]),
  ) as Record<string, TeamAward[]>;
  const gmAwardsByConferenceId = Object.fromEntries(
    conferenceIds.map((id) => [id, []]),
  ) as Record<string, TeamAward[]>;
  const awardPointsByConferenceId = Object.fromEntries(
    conferenceIds.map((id) => [id, 0]),
  ) as Record<string, number>;

  for (const award of seasonAwards) {
    if (EXCLUDED_AWARDS.has(award.award)) continue;
    const conferenceId = normalizeId(teamForAward(award, teamsById)?.confId);
    if (!conferenceId || !awardsByConferenceId[conferenceId]) continue;
    awardsByConferenceId[conferenceId].push(award);
    awardPointsByConferenceId[conferenceId] =
      (awardPointsByConferenceId[conferenceId] ?? 0) + awardWeight(award.award);
    if (award.award === AwardsList.JACK_ADAMS) {
      coachAwardsByConferenceId[conferenceId]?.push(award);
    }
    if (award.award === AwardsList.GM_OF_THE_YEAR) {
      gmAwardsByConferenceId[conferenceId]?.push(award);
    }
  }

  return {
    awardsByConferenceId,
    awardPointsByConferenceId,
    coachAwardsByConferenceId,
    gmAwardsByConferenceId,
  };
};

const buildSeasonRating = (
  leftId: string,
  rightId: string,
  headToHead: Record<string, ConferenceContestRecord>,
  playoffs: Record<string, ConferenceContestRecord>,
  finalists: Record<string, GSHLTeam[]>,
  qualifiers: Record<string, GSHLTeam[]>,
  champions: Record<string, GSHLTeam[]>,
  awardPoints: Record<string, number>,
): ConferenceContestRating => {
  const headToHeadLeft = evidenceShare(
    recordEvidence(headToHead[leftId]),
    recordEvidence(headToHead[rightId]),
  );
  const playoffWinsLeft = evidenceShare(
    recordEvidence(playoffs[leftId]),
    recordEvidence(playoffs[rightId]),
  );
  const finalistsLeft = evidenceShare(
    finalists[leftId]?.length ?? 0,
    finalists[rightId]?.length ?? 0,
  );
  const qualifiersLeft = evidenceShare(
    qualifiers[leftId]?.length ?? 0,
    qualifiers[rightId]?.length ?? 0,
  );
  const playoffLeft =
    playoffWinsLeft * CONFERENCE_PLAYOFF_WEIGHTS.wins +
    finalistsLeft * CONFERENCE_PLAYOFF_WEIGHTS.finals +
    qualifiersLeft * CONFERENCE_PLAYOFF_WEIGHTS.qualifiers;
  const cupsLeft = evidenceShare(
    champions[leftId]?.length ?? 0,
    champions[rightId]?.length ?? 0,
  );
  const awardsLeft = evidenceShare(
    awardPoints[leftId] ?? 0,
    awardPoints[rightId] ?? 0,
  );
  const leftComponents: ConferenceContestRatingComponents = {
    headToHead: headToHeadLeft,
    playoffs: playoffLeft,
    cups: cupsLeft,
    awards: awardsLeft,
  };
  const rightComponents: ConferenceContestRatingComponents = {
    headToHead: 100 - headToHeadLeft,
    playoffs: 100 - playoffLeft,
    cups: 100 - cupsLeft,
    awards: 100 - awardsLeft,
  };
  const total = (components: ConferenceContestRatingComponents) =>
    components.headToHead * CONFERENCE_RATING_WEIGHTS.headToHead +
    components.playoffs * CONFERENCE_RATING_WEIGHTS.playoffs +
    components.cups * CONFERENCE_RATING_WEIGHTS.cups +
    components.awards * CONFERENCE_RATING_WEIGHTS.awards;
  const leftRating = total(leftComponents);
  return {
    ratingByConferenceId: { [leftId]: leftRating, [rightId]: 100 - leftRating },
    componentsByConferenceId: {
      [leftId]: leftComponents,
      [rightId]: rightComponents,
    },
  };
};

export const buildConferenceContestSeasonViewModel = (params: {
  season: Season;
  matchups: Matchup[];
  gshlTeams: GSHLTeam[];
  teamAwards?: TeamAward[];
}): ConferenceContestSeasonViewModel | null => {
  const { season, matchups, gshlTeams, teamAwards = [] } = params;
  const seasonId = normalizeId(season.id);
  if (!seasonId) return null;
  const conferences = getSeasonConferences(seasonId, gshlTeams);
  const leftConference = conferences[0];
  const rightConference = conferences[1];
  if (!leftConference || !rightConference) return null;
  const conferenceIds = [leftConference.id, rightConference.id];
  const seasonTeams = gshlTeams.filter(
    (team) => normalizeId(team.seasonId) === seasonId,
  );
  const teamsById = new Map(seasonTeams.map((team) => [String(team.id), team]));
  const completeMatchups = matchups.filter(
    (matchup) =>
      normalizeId(matchup.seasonId) === seasonId && isComplete(matchup),
  );
  const getTeam = (id: IdLike) => {
    const normalized = normalizeId(id);
    return normalized ? teamsById.get(normalized) : undefined;
  };
  const getConferencePair = (matchup: Matchup) =>
    [
      normalizeId(getTeam(matchup.homeTeamId)?.confId),
      normalizeId(getTeam(matchup.awayTeamId)?.confId),
    ] as const;

  const seasonRecordByConferenceId = emptyRecordMap(conferenceIds);
  const playoffRecordByConferenceId = emptyRecordMap(conferenceIds);
  const headToHeadRecordByConferenceId = emptyRecordMap(conferenceIds);
  const playoffTeamIds = Object.fromEntries(
    conferenceIds.map((id) => [id, new Set<string>()]),
  ) as Record<string, Set<string>>;
  let finalMatchup: Matchup | undefined;

  for (const matchup of completeMatchups) {
    const [homeConferenceId, awayConferenceId] = getConferencePair(matchup);
    if (!homeConferenceId || !awayConferenceId) continue;
    if (
      matchup.gameType === MatchupType.CONFERENCE ||
      matchup.gameType === MatchupType.NON_CONFERENCE
    ) {
      applyResultToRecord(
        matchup,
        homeConferenceId,
        awayConferenceId,
        seasonRecordByConferenceId,
      );
    }
    if (isPlayoffMatchupType(matchup.gameType)) {
      applyResultToRecord(
        matchup,
        homeConferenceId,
        awayConferenceId,
        playoffRecordByConferenceId,
      );
    }
    if (
      matchup.gameType === MatchupType.NON_CONFERENCE &&
      homeConferenceId !== awayConferenceId
    ) {
      applyResultToRecord(
        matchup,
        homeConferenceId,
        awayConferenceId,
        headToHeadRecordByConferenceId,
      );
    }
    if (matchup.gameType === MatchupType.QUARTER_FINAL) {
      playoffTeamIds[homeConferenceId]?.add(String(matchup.homeTeamId));
      playoffTeamIds[awayConferenceId]?.add(String(matchup.awayTeamId));
    }
    if (matchup.gameType === MatchupType.FINAL) finalMatchup = matchup;
  }

  const playoffTeamsByConferenceId = Object.fromEntries(
    conferenceIds.map((conferenceId) => [
      conferenceId,
      [...(playoffTeamIds[conferenceId] ?? [])]
        .map((id) => teamsById.get(id))
        .filter((team): team is GSHLTeam => Boolean(team)),
    ]),
  ) as Record<string, GSHLTeam[]>;
  const finalsTeamsByConferenceId = Object.fromEntries(
    conferenceIds.map((id) => [id, []]),
  ) as Record<string, GSHLTeam[]>;
  const championTeamsByConferenceId = Object.fromEntries(
    conferenceIds.map((id) => [id, []]),
  ) as Record<string, GSHLTeam[]>;

  if (finalMatchup) {
    const homeTeam = getTeam(finalMatchup.homeTeamId);
    const awayTeam = getTeam(finalMatchup.awayTeamId);
    if (homeTeam?.confId)
      finalsTeamsByConferenceId[String(homeTeam.confId)]?.push(homeTeam);
    if (awayTeam?.confId)
      finalsTeamsByConferenceId[String(awayTeam.confId)]?.push(awayTeam);
    const winner = getMatchupWinner(finalMatchup);
    const champion =
      winner === "home" ? homeTeam : winner === "away" ? awayTeam : undefined;
    if (champion?.confId)
      championTeamsByConferenceId[String(champion.confId)]?.push(champion);
  }

  const seasonAwards = teamAwards.filter(
    (award) => normalizeId(award.seasonId) === seasonId,
  );
  const cupAwards = seasonAwards.filter(
    (award) => award.award === AwardsList.GSHL_CUP,
  );
  if (cupAwards.length > 0) {
    for (const id of conferenceIds) championTeamsByConferenceId[id] = [];
    for (const award of cupAwards) {
      const team = teamForAward(award, teamsById);
      if (team?.confId)
        championTeamsByConferenceId[String(team.confId)]?.push(team);
    }
  }

  const awardSummary = buildAwardSummary(
    conferenceIds,
    seasonAwards,
    teamsById,
  );
  const rating = buildSeasonRating(
    leftConference.id,
    rightConference.id,
    headToHeadRecordByConferenceId,
    playoffRecordByConferenceId,
    finalsTeamsByConferenceId,
    playoffTeamsByConferenceId,
    championTeamsByConferenceId,
    awardSummary.awardPointsByConferenceId,
  );

  return {
    seasonId,
    seasonName: season.name,
    seasonYear: season.year,
    isActive: season.isActive,
    leftConference,
    rightConference,
    championTeamsByConferenceId,
    finalsTeamsByConferenceId,
    playoffTeamsByConferenceId,
    seasonRecordByConferenceId,
    playoffRecordByConferenceId,
    headToHeadRecordByConferenceId,
    ...awardSummary,
    ...rating,
  };
};

export const buildConferenceContestSeasonViewModels = (params: {
  seasons: Season[];
  matchups: Matchup[];
  gshlTeams: GSHLTeam[];
  teamAwards?: TeamAward[];
}): ConferenceContestSeasonViewModel[] =>
  [...params.seasons]
    .sort((a, b) => b.year - a.year)
    .map((season) =>
      buildConferenceContestSeasonViewModel({ ...params, season }),
    )
    .filter((season): season is ConferenceContestSeasonViewModel =>
      Boolean(season),
    );

const combineRecords = (
  conferenceIds: string[],
  seasons: ConferenceContestSeasonViewModel[],
  field:
    | "seasonRecordByConferenceId"
    | "playoffRecordByConferenceId"
    | "headToHeadRecordByConferenceId",
) => {
  const result = emptyRecordMap(conferenceIds);
  for (const season of seasons) {
    for (const id of conferenceIds) {
      const source = season[field][id];
      const target = result[id];
      if (!source || !target) continue;
      target.wins += source.wins;
      target.losses += source.losses;
      target.ties += source.ties;
    }
  }
  return result;
};

export const aggregateConferenceRatings = (
  seasons: ConferenceContestSeasonViewModel[],
  retention = CONFERENCE_RECENCY_RETENTION,
): {
  currentRating: ConferenceContestRating;
  allTimeRating: ConferenceContestRating;
} | null => {
  const newest = seasons[0];
  if (!newest) return null;
  const leftId = newest.leftConference.id;
  const rightId = newest.rightConference.id;
  const componentKeys: Array<keyof ConferenceContestRatingComponents> = [
    "headToHead",
    "playoffs",
    "cups",
    "awards",
  ];
  const aggregate = (weighted: boolean): ConferenceContestRating => {
    const weights = seasons.map((_, index) =>
      weighted ? retention ** index : 1,
    );
    const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
    const leftComponents = Object.fromEntries(
      componentKeys.map((key) => [
        key,
        seasons.reduce(
          (sum, season, index) =>
            sum +
            (season.componentsByConferenceId[leftId]?.[key] ?? 50) *
              (weights[index] ?? 0),
          0,
        ) / weightTotal,
      ]),
    ) as unknown as ConferenceContestRatingComponents;
    const rightComponents = Object.fromEntries(
      componentKeys.map((key) => [key, 100 - leftComponents[key]]),
    ) as unknown as ConferenceContestRatingComponents;
    const leftRating =
      seasons.reduce(
        (sum, season, index) =>
          sum +
          (season.ratingByConferenceId[leftId] ?? 50) * (weights[index] ?? 0),
        0,
      ) / weightTotal;
    return {
      ratingByConferenceId: {
        [leftId]: leftRating,
        [rightId]: 100 - leftRating,
      },
      componentsByConferenceId: {
        [leftId]: leftComponents,
        [rightId]: rightComponents,
      },
    };
  };
  return { currentRating: aggregate(true), allTimeRating: aggregate(false) };
};

export const buildConferenceContestOverallViewModel = (params: {
  seasons: Season[];
  matchups: Matchup[];
  gshlTeams: GSHLTeam[];
  teamAwards?: TeamAward[];
}): ConferenceContestOverallViewModel | null => {
  const seasonModels = buildConferenceContestSeasonViewModels(params);
  const newest = seasonModels[0];
  const ratings = aggregateConferenceRatings(seasonModels);
  if (!newest || !ratings) return null;
  const conferenceIds = [newest.leftConference.id, newest.rightConference.id];
  const mergeArrays = <T>(field: keyof ConferenceContestSeasonViewModel) =>
    Object.fromEntries(
      conferenceIds.map((id) => [
        id,
        seasonModels.flatMap((season) => {
          const value = season[field] as Record<string, T[]>;
          return value[id] ?? [];
        }),
      ]),
    ) as Record<string, T[]>;
  const awardPointsByConferenceId = Object.fromEntries(
    conferenceIds.map((id) => [
      id,
      seasonModels.reduce(
        (sum, season) => sum + (season.awardPointsByConferenceId[id] ?? 0),
        0,
      ),
    ]),
  ) as Record<string, number>;
  return {
    leftConference: newest.leftConference,
    rightConference: newest.rightConference,
    ...ratings,
    trend: [...seasonModels].reverse().map((season) => ({
      seasonId: season.seasonId,
      seasonName: season.seasonName,
      seasonYear: season.seasonYear,
      ratingByConferenceId: season.ratingByConferenceId,
    })),
    championTeamsByConferenceId: mergeArrays<GSHLTeam>(
      "championTeamsByConferenceId",
    ),
    finalsTeamsByConferenceId: mergeArrays<GSHLTeam>(
      "finalsTeamsByConferenceId",
    ),
    playoffTeamsByConferenceId: mergeArrays<GSHLTeam>(
      "playoffTeamsByConferenceId",
    ),
    awardsByConferenceId: mergeArrays<TeamAward>("awardsByConferenceId"),
    coachAwardsByConferenceId: mergeArrays<TeamAward>(
      "coachAwardsByConferenceId",
    ),
    gmAwardsByConferenceId: mergeArrays<TeamAward>("gmAwardsByConferenceId"),
    awardPointsByConferenceId,
    seasonRecordByConferenceId: combineRecords(
      conferenceIds,
      seasonModels,
      "seasonRecordByConferenceId",
    ),
    playoffRecordByConferenceId: combineRecords(
      conferenceIds,
      seasonModels,
      "playoffRecordByConferenceId",
    ),
    headToHeadRecordByConferenceId: combineRecords(
      conferenceIds,
      seasonModels,
      "headToHeadRecordByConferenceId",
    ),
  };
};
