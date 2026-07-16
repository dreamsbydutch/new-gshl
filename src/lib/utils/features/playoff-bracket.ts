import type {
  BracketMatchup,
  ConferenceBracket,
  SeededTeam,
  TeamSeasonStatLine,
} from "@gshl-types";

/**
 * Safe rank.
 *
 * @param value - The source value to process.
 * @returns The resulting safe rank.
 */
function safeRank(value: string | number | null | undefined): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Sorts by conference rank.
 *
 * @param teams - The teams to use.
 * @returns The sorted by conference rank.
 */
function sortByConferenceRank(teams: SeededTeam[]): SeededTeam[] {
  return [...teams].sort(
    (a, b) =>
      (safeRank(a.seasonStats?.conferenceRk) ?? 999) -
      (safeRank(b.seasonStats?.conferenceRk) ?? 999),
  );
}

/**
 * Sorts by overall rank.
 *
 * @param teams - The teams to use.
 * @returns The sorted by overall rank.
 */
function sortByOverallRank(teams: SeededTeam[]): SeededTeam[] {
  return [...teams].sort(
    (a, b) =>
      (safeRank(a.seasonStats?.overallRk) ?? 999) -
      (safeRank(b.seasonStats?.overallRk) ?? 999),
  );
}

/**
 * Sorts by wildcard rank.
 *
 * @param teams - The teams to use.
 * @returns The sorted by wildcard rank.
 */
function sortByWildcardRank(teams: SeededTeam[]): SeededTeam[] {
  return [...teams].sort(
    (a, b) =>
      (safeRank(a.seasonStats?.wildcardRk) ?? 999) -
      (safeRank(b.seasonStats?.wildcardRk) ?? 999),
  );
}

/**
 * Builds playoff bracket.
 *
 * @param teams - The teams to use.
 * @param stats - The stats to use.
 * @returns The assembled playoff bracket.
 */
export function buildPlayoffBracket(
  teams: SeededTeam[],
  stats: TeamSeasonStatLine[],
): ConferenceBracket[] {
  const playoffTeams = teams.map((team) => {
    const stat = stats.find((row) => row.gshlTeamId === team.id);
    return {
      ...team,
      seasonStats: stat ? { ...stat } : undefined,
    };
  });

  const leagueSorted = sortByOverallRank(playoffTeams);
  const leagueOneSeed = leagueSorted[0] ?? null;

  const wildcardPool = playoffTeams.filter(
    (team) =>
      team.seasonStats?.wildcardRk !== null &&
      team.seasonStats?.wildcardRk !== undefined,
  );
  const wildcardsSorted = sortByWildcardRank(wildcardPool);
  const topWildcard = wildcardsSorted[0] ?? null;
  const secondWildcard = wildcardsSorted[1] ?? null;

  const svTeams = playoffTeams.filter((team) => team.confAbbr === "SV");
  const hhTeams = playoffTeams.filter((team) => team.confAbbr === "HH");

  const svOneSeed = sortByConferenceRank(svTeams)[0] ?? null;
  const hhOneSeed = sortByConferenceRank(hhTeams)[0] ?? null;
  const confOnes = [svOneSeed, hhOneSeed].filter(
    (team): team is SeededTeam => team !== null,
  );
  const confOnesByOverall = sortByOverallRank(confOnes);
  const worstConfOne = confOnesByOverall[1] ?? null;

  const wildcardVsWorstOne: BracketMatchup = {
    title: "1 vs WC",
    homeLabel: "#1",
    awayLabel: "#4",
    homeTeam: worstConfOne,
    awayTeam: topWildcard,
  };

  const wildcardVsLeagueOne: BracketMatchup = {
    title: "1Ovr vs WC",
    homeLabel: "#1",
    awayLabel: "#4",
    homeTeam: leagueOneSeed,
    awayTeam: secondWildcard,
  };

        /**
   * Builds two vs three.
   *
   * @param confTeams - The conf teams to use.
   * @returns The assembled two vs three.
   */
  const buildTwoVsThree = (confTeams: SeededTeam[]): BracketMatchup => {
    const sorted = sortByConferenceRank(confTeams);
    return {
      title: "2 vs 3",
      homeLabel: "#2",
      awayLabel: "#3",
      homeTeam: sorted[1] ?? null,
      awayTeam: sorted[2] ?? null,
    };
  };

      /**
   * Match conf key.
   *
   * @param oneSeed - The one seed to use.
   */
  const matchConfKey = (oneSeed: SeededTeam | null) => oneSeed?.confAbbr ?? "";
  const oneWcConf = matchConfKey(wildcardVsWorstOne.homeTeam);

  const svMatchups: BracketMatchup[] = [buildTwoVsThree(svTeams)];
  const hhMatchups: BracketMatchup[] = [buildTwoVsThree(hhTeams)];

  if (oneWcConf === "SV") svMatchups.unshift(wildcardVsWorstOne);
  if (oneWcConf === "HH") hhMatchups.unshift(wildcardVsWorstOne);

  const leagueOneConf = matchConfKey(leagueOneSeed);
  if (leagueOneConf === "SV") svMatchups.unshift(wildcardVsLeagueOne);
  if (leagueOneConf === "HH") hhMatchups.unshift(wildcardVsLeagueOne);

  return [
    { conferenceTitle: "Sunview", matchups: svMatchups },
    { conferenceTitle: "Hickory Hotel", matchups: hhMatchups },
  ];
}
