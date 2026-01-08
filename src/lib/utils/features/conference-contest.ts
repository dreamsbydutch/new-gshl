import type { GSHLTeam, Matchup, Season } from "@gshl-types";
import { MatchupType } from "@gshl-types";

export interface ConferenceContestConferenceInfo {
  id: string;
  name: string;
  abbr: string | null;
  logoUrl: string | null;
}

export interface ConferenceContestRecord {
  wins: number;
  losses: number;
}

export interface ConferenceContestSeasonViewModel {
  seasonId: string;
  seasonName: string;
  leftConference: ConferenceContestConferenceInfo;
  rightConference: ConferenceContestConferenceInfo;

  championTeamsByConferenceId: Record<string, GSHLTeam[]>;
  finalsTeamsByConferenceId: Record<string, GSHLTeam[]>;
  playoffTeamsByConferenceId: Record<string, GSHLTeam[]>;

  seasonRecordByConferenceId: Record<string, ConferenceContestRecord>;
  playoffRecordByConferenceId: Record<string, ConferenceContestRecord>;
  headToHeadRecordByConferenceId: Record<string, ConferenceContestRecord>;
}

export interface ConferenceContestOverallViewModel {
  leftConference: ConferenceContestConferenceInfo;
  rightConference: ConferenceContestConferenceInfo;

  championTeamsByConferenceId: Record<string, GSHLTeam[]>;
  finalsTeamsByConferenceId: Record<string, GSHLTeam[]>;
  playoffTeamsByConferenceId: Record<string, GSHLTeam[]>;

  seasonRecordByConferenceId: Record<string, ConferenceContestRecord>;
  playoffRecordByConferenceId: Record<string, ConferenceContestRecord>;
  headToHeadRecordByConferenceId: Record<string, ConferenceContestRecord>;
}

export const isGshlTeam = (team: unknown): team is GSHLTeam => {
  if (!team || typeof team !== "object") return false;
  return "id" in team && "seasonId" in team && "confId" in team;
};

const normalizeId = (value: unknown): string | null => {
  if (value == null) return null;
  const str = String(value).trim();
  return str.length ? str : null;
};

const isPlayoffGameType = (gameType: MatchupType) =>
  gameType === MatchupType.QUARTER_FINAL ||
  gameType === MatchupType.SEMI_FINAL ||
  gameType === MatchupType.FINAL;

export const getSeasonConferences = (
  seasonId: string,
  gshlTeams: GSHLTeam[],
): ConferenceContestConferenceInfo[] => {
  const normalizedSeasonId = normalizeId(seasonId);
  const seasonTeams = gshlTeams.filter(
    (t) => normalizeId(t.seasonId) === normalizedSeasonId,
  );
  const confMap = new Map<string, ConferenceContestConferenceInfo>();

  for (const team of seasonTeams) {
    const confId = normalizeId(team.confId);
    if (!confId) continue;
    if (!confMap.has(confId)) {
      confMap.set(confId, {
        id: confId,
        name: team.confName ?? confId,
        abbr: team.confAbbr,
        logoUrl: team.confLogoUrl,
      });
    }
  }

  return Array.from(confMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
};

export const getAllConferences = (
  gshlTeams: GSHLTeam[],
): ConferenceContestConferenceInfo[] => {
  const confMap = new Map<string, ConferenceContestConferenceInfo>();

  for (const team of gshlTeams) {
    const confId = normalizeId(team.confId);
    if (!confId) continue;
    if (!confMap.has(confId)) {
      confMap.set(confId, {
        id: confId,
        name: team.confName ?? confId,
        abbr: team.confAbbr,
        logoUrl: team.confLogoUrl,
      });
    }
  }

  return Array.from(confMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
};

type Winner = "home" | "away" | "tie" | "unknown";

const normalizeScore = (score: unknown): number | null => {
  if (score == null) return null;
  if (typeof score === "number" && Number.isFinite(score)) return score;
  if (typeof score === "string") {
    const parsed = Number(score);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeBoolean = (value: unknown): boolean | null => {
  if (value == null) return null;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "t", "yes", "y", "1"].includes(normalized)) return true;
    if (["false", "f", "no", "n", "0"].includes(normalized)) return false;
    return null;
  }
  return null;
};

const isMatchupCompleteByScore = (
  matchup: Pick<Matchup, "homeScore" | "awayScore">,
) =>
  normalizeScore(matchup.homeScore) != null &&
  normalizeScore(matchup.awayScore) != null;

const getMatchupWinner = (
  matchup: Pick<
    Matchup,
    "homeWin" | "awayWin" | "tie" | "homeScore" | "awayScore"
  >,
): Winner => {
  const tie = normalizeBoolean(matchup.tie);
  const homeWin = normalizeBoolean(matchup.homeWin);
  const awayWin = normalizeBoolean(matchup.awayWin);

  if (homeWin === true) return "home";
  if (awayWin === true) return "away";
  if (tie === true) return "tie";

  const homeScore = normalizeScore(matchup.homeScore);
  const awayScore = normalizeScore(matchup.awayScore);

  if (homeScore != null && awayScore != null) {
    if (homeScore > awayScore) return "home";
    if (awayScore > homeScore) return "away";
    return "tie";
  }

  return "unknown";
};

const applyResultToRecord = (
  matchup: Pick<
    Matchup,
    "homeWin" | "awayWin" | "tie" | "homeScore" | "awayScore"
  >,
  homeConfId: string,
  awayConfId: string,
  recordByConfId: Record<string, ConferenceContestRecord>,
) => {
  const winner = getMatchupWinner(matchup);
  if (winner === "tie" || winner === "unknown") return;

  recordByConfId[homeConfId] ??= { wins: 0, losses: 0 };
  recordByConfId[awayConfId] ??= { wins: 0, losses: 0 };

  if (winner === "home") {
    recordByConfId[homeConfId].wins += 1;
    recordByConfId[awayConfId].losses += 1;
    return;
  }

  recordByConfId[awayConfId].wins += 1;
  recordByConfId[homeConfId].losses += 1;
};

export const buildConferenceContestSeasonViewModel = (params: {
  season: Season;
  matchups: Matchup[];
  gshlTeams: GSHLTeam[];
}): ConferenceContestSeasonViewModel | null => {
  const { season, matchups, gshlTeams } = params;

  const normalizedSeasonId = normalizeId(season.id);
  if (!normalizedSeasonId) return null;

  const conferences = getSeasonConferences(normalizedSeasonId, gshlTeams);
  const leftConf = conferences[0];
  const rightConf = conferences[1];
  if (!leftConf || !rightConf) return null;

  const seasonMatchups = matchups.filter(
    (m) => normalizeId(m.seasonId) === normalizedSeasonId,
  );

  // Treat a matchup as usable for record purposes when it has scores.
  const completeMatchups = seasonMatchups.filter((m) =>
    isMatchupCompleteByScore(m),
  );

  const teamsById = new Map(
    gshlTeams
      .map((t) => {
        const id = normalizeId(t.id);
        return id ? ([id, t] as const) : null;
      })
      .filter((entry): entry is readonly [string, GSHLTeam] => Boolean(entry)),
  );
  const getTeamById = (teamId: unknown) => {
    const id = normalizeId(teamId);
    return id ? teamsById.get(id) : undefined;
  };

  const regularSeasonMatchups = completeMatchups.filter(
    (m) =>
      m.gameType === MatchupType.CONFERENCE ||
      m.gameType === MatchupType.NON_CONFERENCE,
  );

  const playoffMatchups = completeMatchups.filter((m) =>
    isPlayoffGameType(m.gameType),
  );
  const quarterFinalMatchups = completeMatchups.filter(
    (m) => m.gameType === MatchupType.QUARTER_FINAL,
  );
  const finalMatchup = completeMatchups.find(
    (m) => m.gameType === MatchupType.FINAL,
  );

  const headToHeadMatchups = completeMatchups.filter((m) => {
    if (m.gameType !== MatchupType.NON_CONFERENCE) return false;
    const homeTeam = getTeamById(m.homeTeamId);
    const awayTeam = getTeamById(m.awayTeamId);
    const confA = normalizeId(homeTeam?.confId);
    const confB = normalizeId(awayTeam?.confId);
    if (!confA || !confB) return false;
    return (
      (confA === leftConf.id && confB === rightConf.id) ||
      (confA === rightConf.id && confB === leftConf.id)
    );
  });

  const seasonRecordByConferenceId: Record<string, ConferenceContestRecord> =
    {};
  for (const m of regularSeasonMatchups) {
    const homeTeam = getTeamById(m.homeTeamId);
    const awayTeam = getTeamById(m.awayTeamId);
    const homeConfId = normalizeId(homeTeam?.confId);
    const awayConfId = normalizeId(awayTeam?.confId);
    if (!homeConfId || !awayConfId) continue;
    applyResultToRecord(m, homeConfId, awayConfId, seasonRecordByConferenceId);
  }

  const playoffRecordByConferenceId: Record<string, ConferenceContestRecord> =
    {};
  for (const m of playoffMatchups) {
    const homeTeam = getTeamById(m.homeTeamId);
    const awayTeam = getTeamById(m.awayTeamId);
    const homeConfId = normalizeId(homeTeam?.confId);
    const awayConfId = normalizeId(awayTeam?.confId);
    if (!homeConfId || !awayConfId) continue;
    applyResultToRecord(m, homeConfId, awayConfId, playoffRecordByConferenceId);
  }

  const headToHeadRecordByConferenceId: Record<
    string,
    ConferenceContestRecord
  > = {};
  for (const m of headToHeadMatchups) {
    const homeTeam = getTeamById(m.homeTeamId);
    const awayTeam = getTeamById(m.awayTeamId);
    const homeConfId = normalizeId(homeTeam?.confId);
    const awayConfId = normalizeId(awayTeam?.confId);
    if (!homeConfId || !awayConfId) continue;
    applyResultToRecord(
      m,
      homeConfId,
      awayConfId,
      headToHeadRecordByConferenceId,
    );
  }

  const playoffTeamIdsByConferenceId: Record<string, Set<string>> = {
    [leftConf.id]: new Set(),
    [rightConf.id]: new Set(),
  };

  for (const m of quarterFinalMatchups) {
    const homeTeam = getTeamById(m.homeTeamId);
    const awayTeam = getTeamById(m.awayTeamId);
    const homeConfId = normalizeId(homeTeam?.confId);
    const awayConfId = normalizeId(awayTeam?.confId);
    const homeTeamId = normalizeId(homeTeam?.id);
    const awayTeamId = normalizeId(awayTeam?.id);
    if (homeConfId && homeTeamId)
      playoffTeamIdsByConferenceId[homeConfId]?.add(homeTeamId);
    if (awayConfId && awayTeamId)
      playoffTeamIdsByConferenceId[awayConfId]?.add(awayTeamId);
  }

  const playoffTeamsByConferenceId: Record<string, GSHLTeam[]> = {
    [leftConf.id]: Array.from(playoffTeamIdsByConferenceId[leftConf.id] ?? [])
      .map((id) => getTeamById(id))
      .filter((t): t is GSHLTeam => Boolean(t)),
    [rightConf.id]: Array.from(playoffTeamIdsByConferenceId[rightConf.id] ?? [])
      .map((id) => getTeamById(id))
      .filter((t): t is GSHLTeam => Boolean(t)),
  };

  const finalHomeTeam = finalMatchup
    ? getTeamById(finalMatchup.homeTeamId)
    : undefined;
  const finalAwayTeam = finalMatchup
    ? getTeamById(finalMatchup.awayTeamId)
    : undefined;

  const finalsTeamsByConferenceId: Record<string, GSHLTeam[]> = {
    [leftConf.id]: [],
    [rightConf.id]: [],
  };

  const finalHomeConfId = normalizeId(finalHomeTeam?.confId);
  const finalAwayConfId = normalizeId(finalAwayTeam?.confId);
  if (finalHomeConfId)
    finalsTeamsByConferenceId[finalHomeConfId]?.push(finalHomeTeam!);
  if (finalAwayConfId)
    finalsTeamsByConferenceId[finalAwayConfId]?.push(finalAwayTeam!);

  const championTeamsByConferenceId: Record<string, GSHLTeam[]> = {
    [leftConf.id]: [],
    [rightConf.id]: [],
  };
  if (finalMatchup) {
    const winner = getMatchupWinner(finalMatchup);
    const championTeam =
      winner === "home"
        ? finalHomeTeam
        : winner === "away"
          ? finalAwayTeam
          : undefined;
    const championConfId = normalizeId(championTeam?.confId);
    if (championConfId && championTeam) {
      championTeamsByConferenceId[championConfId]?.push(championTeam);
    }
  }

  return {
    seasonId: normalizedSeasonId,
    seasonName: season.name,
    leftConference: leftConf,
    rightConference: rightConf,

    championTeamsByConferenceId,
    finalsTeamsByConferenceId,
    playoffTeamsByConferenceId,

    seasonRecordByConferenceId,
    playoffRecordByConferenceId,
    headToHeadRecordByConferenceId,
  };
};

export const buildConferenceContestOverallViewModel = (params: {
  seasons: Season[];
  matchups: Matchup[];
  gshlTeams: GSHLTeam[];
}): ConferenceContestOverallViewModel | null => {
  const { seasons, matchups, gshlTeams } = params;

  const conferences = getAllConferences(gshlTeams);
  const leftConf = conferences[0];
  const rightConf = conferences[1];
  if (!leftConf || !rightConf) return null;

  const completeMatchups = matchups.filter((m) => isMatchupCompleteByScore(m));

  const teamsById = new Map(
    gshlTeams
      .map((t) => {
        const id = normalizeId(t.id);
        return id ? ([id, t] as const) : null;
      })
      .filter((entry): entry is readonly [string, GSHLTeam] => Boolean(entry)),
  );
  const getTeamById = (teamId: unknown) => {
    const id = normalizeId(teamId);
    return id ? teamsById.get(id) : undefined;
  };

  const regularSeasonMatchups = completeMatchups.filter(
    (m) =>
      m.gameType === MatchupType.CONFERENCE ||
      m.gameType === MatchupType.NON_CONFERENCE,
  );
  const playoffMatchups = completeMatchups.filter((m) =>
    isPlayoffGameType(m.gameType),
  );
  const quarterFinalMatchups = completeMatchups.filter(
    (m) => m.gameType === MatchupType.QUARTER_FINAL,
  );

  const headToHeadMatchups = completeMatchups.filter((m) => {
    if (m.gameType !== MatchupType.NON_CONFERENCE) return false;
    const homeTeam = getTeamById(m.homeTeamId);
    const awayTeam = getTeamById(m.awayTeamId);
    const confA = normalizeId(homeTeam?.confId);
    const confB = normalizeId(awayTeam?.confId);
    if (!confA || !confB) return false;
    return (
      (confA === leftConf.id && confB === rightConf.id) ||
      (confA === rightConf.id && confB === leftConf.id)
    );
  });

  const seasonRecordByConferenceId: Record<string, ConferenceContestRecord> =
    {};
  for (const m of regularSeasonMatchups) {
    const homeTeam = getTeamById(m.homeTeamId);
    const awayTeam = getTeamById(m.awayTeamId);
    const homeConfId = normalizeId(homeTeam?.confId);
    const awayConfId = normalizeId(awayTeam?.confId);
    if (!homeConfId || !awayConfId) continue;
    applyResultToRecord(m, homeConfId, awayConfId, seasonRecordByConferenceId);
  }

  const playoffRecordByConferenceId: Record<string, ConferenceContestRecord> =
    {};
  for (const m of playoffMatchups) {
    const homeTeam = getTeamById(m.homeTeamId);
    const awayTeam = getTeamById(m.awayTeamId);
    const homeConfId = normalizeId(homeTeam?.confId);
    const awayConfId = normalizeId(awayTeam?.confId);
    if (!homeConfId || !awayConfId) continue;
    applyResultToRecord(m, homeConfId, awayConfId, playoffRecordByConferenceId);
  }

  const headToHeadRecordByConferenceId: Record<
    string,
    ConferenceContestRecord
  > = {};
  for (const m of headToHeadMatchups) {
    const homeTeam = getTeamById(m.homeTeamId);
    const awayTeam = getTeamById(m.awayTeamId);
    const homeConfId = normalizeId(homeTeam?.confId);
    const awayConfId = normalizeId(awayTeam?.confId);
    if (!homeConfId || !awayConfId) continue;
    applyResultToRecord(
      m,
      homeConfId,
      awayConfId,
      headToHeadRecordByConferenceId,
    );
  }

  const playoffTeamIdsByConferenceId: Record<string, Set<string>> = {
    [leftConf.id]: new Set(),
    [rightConf.id]: new Set(),
  };

  for (const m of quarterFinalMatchups) {
    const homeTeam = getTeamById(m.homeTeamId);
    const awayTeam = getTeamById(m.awayTeamId);
    const homeConfId = normalizeId(homeTeam?.confId);
    const awayConfId = normalizeId(awayTeam?.confId);
    const homeTeamId = normalizeId(homeTeam?.id);
    const awayTeamId = normalizeId(awayTeam?.id);
    if (homeConfId && homeTeamId)
      playoffTeamIdsByConferenceId[homeConfId]?.add(homeTeamId);
    if (awayConfId && awayTeamId)
      playoffTeamIdsByConferenceId[awayConfId]?.add(awayTeamId);
  }

  const playoffTeamsByConferenceId: Record<string, GSHLTeam[]> = {
    [leftConf.id]: Array.from(playoffTeamIdsByConferenceId[leftConf.id] ?? [])
      .map((id) => getTeamById(id))
      .filter((t): t is GSHLTeam => Boolean(t)),
    [rightConf.id]: Array.from(playoffTeamIdsByConferenceId[rightConf.id] ?? [])
      .map((id) => getTeamById(id))
      .filter((t): t is GSHLTeam => Boolean(t)),
  };

  const finalsTeamsByConferenceId: Record<string, GSHLTeam[]> = {
    [leftConf.id]: [],
    [rightConf.id]: [],
  };
  const championTeamsByConferenceId: Record<string, GSHLTeam[]> = {
    [leftConf.id]: [],
    [rightConf.id]: [],
  };

  const seasonsById = new Map(
    seasons
      .map((s) => {
        const id = normalizeId(s.id);
        return id ? ([id, s] as const) : null;
      })
      .filter((entry): entry is readonly [string, Season] => Boolean(entry)),
  );

  for (const [seasonId] of seasonsById) {
    const seasonFinals = completeMatchups.filter(
      (m) =>
        normalizeId(m.seasonId) === seasonId &&
        m.gameType === MatchupType.FINAL,
    );
    const finalMatchup = seasonFinals[0];
    if (!finalMatchup) continue;

    const finalHomeTeam = getTeamById(finalMatchup.homeTeamId);
    const finalAwayTeam = getTeamById(finalMatchup.awayTeamId);
    const homeConfId = normalizeId(finalHomeTeam?.confId);
    const awayConfId = normalizeId(finalAwayTeam?.confId);

    if (homeConfId && finalHomeTeam)
      finalsTeamsByConferenceId[homeConfId]?.push(finalHomeTeam);
    if (awayConfId && finalAwayTeam)
      finalsTeamsByConferenceId[awayConfId]?.push(finalAwayTeam);

    const winner = getMatchupWinner(finalMatchup);
    const championTeam =
      winner === "home"
        ? finalHomeTeam
        : winner === "away"
          ? finalAwayTeam
          : undefined;
    const championConfId = normalizeId(championTeam?.confId);
    if (championConfId && championTeam)
      championTeamsByConferenceId[championConfId]?.push(championTeam);
  }

  return {
    leftConference: leftConf,
    rightConference: rightConf,
    championTeamsByConferenceId,
    finalsTeamsByConferenceId,
    playoffTeamsByConferenceId,
    seasonRecordByConferenceId,
    playoffRecordByConferenceId,
    headToHeadRecordByConferenceId,
  };
};
