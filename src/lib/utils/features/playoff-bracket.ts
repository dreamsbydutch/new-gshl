import type {
  BracketMatchup,
  Matchup,
  PlayoffBracketColumn,
  PlayoffBracketFormat,
  PlayoffBracketRound,
  PlayoffBracketViewModel,
  SeededTeam,
  Season,
  TeamSeasonStatLine,
} from "@gshl-types";
import { MatchupType } from "../domain/constants";
import { isPlayoffMatchupType } from "../domain/matchup";

function safeRank(value: string | number | null | undefined): number | null {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function sortByRank(
  teams: SeededTeam[],
  rankKey: "overallRk" | "conferenceRk",
): SeededTeam[] {
  return [...teams].sort(
    (left, right) =>
      (safeRank(left.seasonStats?.[rankKey]) ?? 999) -
      (safeRank(right.seasonStats?.[rankKey]) ?? 999),
  );
}

function getConferenceIdsInLeaderOrder(teams: SeededTeam[]): string[] {
  const conferenceIds = [
    ...new Set(
      teams.map((team) => String(team.confAbbr ?? "").trim()).filter(Boolean),
    ),
  ];

  return conferenceIds
    .map((id) => {
      const conferenceTeams = teams.filter(
        (team) => String(team.confAbbr ?? "").trim() === id,
      );
      return {
        id,
        leader: sortByRank(conferenceTeams, "conferenceRk")[0] ?? null,
      };
    })
    .sort((left, right) => {
      const leftOverallRank =
        safeRank(left.leader?.seasonStats?.overallRk) ?? 999;
      const rightOverallRank =
        safeRank(right.leader?.seasonStats?.overallRk) ?? 999;
      return (
        leftOverallRank - rightOverallRank || left.id.localeCompare(right.id)
      );
    })
    .slice(0, 2)
    .map(({ id }) => id);
}

function getTeamConference(
  teamId: string | null | undefined,
  teamsById: Map<string, SeededTeam>,
): string | null {
  const conference = teamsById.get(String(teamId ?? ""))?.confAbbr;
  const normalized = String(conference ?? "").trim();
  return normalized || null;
}

function hasSeedPair(
  matchup: Matchup,
  firstSeed: number,
  secondSeed: number,
): boolean {
  const seeds = [safeRank(matchup.homeRank), safeRank(matchup.awayRank)].sort(
    (left, right) => (left ?? 999) - (right ?? 999),
  );
  return seeds[0] === firstSeed && seeds[1] === secondSeed;
}

function getConferenceIdsFromActualQuarterfinals(
  actualMatchups: Matchup[],
  teamsById: Map<string, SeededTeam>,
): string[] {
  const quarterfinals = actualMatchups.filter(
    (matchup) => matchup.gameType === MatchupType.QUARTER_FINAL,
  );

  return quarterfinals
    .map((matchup) => getTeamConference(matchup.homeTeamId, teamsById))
    .filter((conference): conference is string => Boolean(conference))
    .filter(
      (conference, index, conferences) =>
        conferences.indexOf(conference) === index,
    )
    .slice(0, 2);
}

function getConferenceIdsInBracketOrder(
  teams: SeededTeam[],
  actualMatchups: Matchup[],
  teamsById: Map<string, SeededTeam>,
): string[] {
  const actualOrder = getConferenceIdsFromActualQuarterfinals(
    actualMatchups,
    teamsById,
  );
  const leaderOrder = getConferenceIdsInLeaderOrder(teams);

  return [...actualOrder, ...leaderOrder]
    .filter(
      (conference, index, conferences) =>
        conferences.indexOf(conference) === index,
    )
    .slice(0, 2);
}

function getPlayoffMatchups(matchups: Matchup[], season: Season | null) {
  return matchups.filter(
    (matchup) =>
      (!season || String(matchup.seasonId) === String(season.id)) &&
      isPlayoffMatchupType(matchup.gameType),
  );
}

function isMatchupComplete(matchup: Matchup): boolean {
  const homeScore = Number(matchup.homeScore);
  const awayScore = Number(matchup.awayScore);
  return (
    matchup.isComplete ||
    matchup.homeWin === true ||
    matchup.awayWin === true ||
    (Number.isFinite(homeScore) && Number.isFinite(awayScore))
  );
}

function pairKey(homeTeamId: string, awayTeamId: string): string {
  return [String(homeTeamId), String(awayTeamId)].sort().join("|");
}

function getMatchupWinner(
  matchup: Matchup,
  homeTeam: SeededTeam | null,
  awayTeam: SeededTeam | null,
): SeededTeam | null {
  if (matchup.homeWin === true) return homeTeam;
  if (matchup.awayWin === true) return awayTeam;
  if (matchup.tie === true) return homeTeam;

  const homeScore = Number(matchup.homeScore);
  const awayScore = Number(matchup.awayScore);
  if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) return null;
  return homeScore >= awayScore ? homeTeam : awayTeam;
}

function createProjectedMatchup({
  awayLabel,
  awayTeam,
  homeLabel,
  homeTeam,
  id,
  logoUrl = null,
  round,
  title,
}: {
  awayLabel: string;
  awayTeam: SeededTeam | null;
  homeLabel: string;
  homeTeam: SeededTeam | null;
  id: string;
  logoUrl?: string | null;
  round: PlayoffBracketRound;
  title: string;
}): BracketMatchup {
  return {
    id,
    round,
    title,
    logoUrl,
    homeLabel,
    awayLabel,
    homeTeam,
    awayTeam,
    homeScore: null,
    awayScore: null,
    isComplete: false,
    source: "projected",
    winnerTeam: null,
  };
}

function teamSeedLabel(team: SeededTeam | null): string {
  const seed = safeRank(team?.seasonStats?.overallRk);
  return seed ? `#${seed}` : "TBD";
}

function labelSeed(label: string): number | null {
  return safeRank(label.replace(/^#/, ""));
}

function matchesProjectedConference(
  matchup: Matchup,
  projected: BracketMatchup,
  teamsById: Map<string, SeededTeam>,
): boolean {
  if (projected.round !== "QF") return false;

  const projectedConference = getTeamConference(
    projected.homeTeam?.id,
    teamsById,
  );
  if (!projectedConference) return false;

  const homeConference = getTeamConference(matchup.homeTeamId, teamsById);
  return homeConference === projectedConference;
}

function actualMatchupToBracket(
  matchup: Matchup,
  projected: BracketMatchup,
  teamsById: Map<string, SeededTeam>,
): BracketMatchup {
  const homeTeam = teamsById.get(String(matchup.homeTeamId)) ?? null;
  const awayTeam = teamsById.get(String(matchup.awayTeamId)) ?? null;
  const homeScore = Number(matchup.homeScore);
  const awayScore = Number(matchup.awayScore);
  const complete = isMatchupComplete(matchup);

  return {
    ...projected,
    id: String(matchup.id),
    homeLabel: teamSeedLabel(homeTeam),
    awayLabel: teamSeedLabel(awayTeam),
    homeTeam,
    awayTeam,
    homeScore: Number.isFinite(homeScore) ? homeScore : null,
    awayScore: Number.isFinite(awayScore) ? awayScore : null,
    isComplete: complete,
    source: complete ? "played" : "scheduled",
    winnerTeam: complete ? getMatchupWinner(matchup, homeTeam, awayTeam) : null,
  };
}

function mergeActualRound(
  projected: BracketMatchup[],
  actual: Matchup[],
  teamsById: Map<string, SeededTeam>,
): BracketMatchup[] {
  const unused = new Set(actual.map((matchup) => String(matchup.id)));

  return projected.map((slot, index) => {
    const projectedPair =
      slot.homeTeam && slot.awayTeam
        ? pairKey(slot.homeTeam.id, slot.awayTeam.id)
        : null;
    const exactMatch = actual.find(
      (matchup) =>
        unused.has(String(matchup.id)) &&
        projectedPair === pairKey(matchup.homeTeamId, matchup.awayTeamId) &&
        (slot.round !== "QF" ||
          matchesProjectedConference(matchup, slot, teamsById)),
    );
    const homeSeed = labelSeed(slot.homeLabel);
    const awaySeed = labelSeed(slot.awayLabel);
    const rankMatch =
      homeSeed && awaySeed
        ? actual.find(
            (matchup) =>
              unused.has(String(matchup.id)) &&
              hasSeedPair(matchup, homeSeed, awaySeed) &&
              matchesProjectedConference(matchup, slot, teamsById),
          )
        : undefined;
    const overlappingMatch = actual.find((matchup) => {
      const overlapsHome = slot.homeTeam
        ? [matchup.homeTeamId, matchup.awayTeamId].includes(slot.homeTeam.id)
        : false;
      const overlapsAway = slot.awayTeam
        ? [matchup.homeTeamId, matchup.awayTeamId].includes(slot.awayTeam.id)
        : false;
      const matchesConference =
        slot.round !== "QF" ||
        matchesProjectedConference(matchup, slot, teamsById);
      return (
        unused.has(String(matchup.id)) &&
        matchesConference &&
        (overlapsHome || overlapsAway)
      );
    });
    const conferenceMatch =
      slot.round === "QF"
        ? actual.find(
            (matchup) =>
              unused.has(String(matchup.id)) &&
              matchesProjectedConference(matchup, slot, teamsById),
          )
        : undefined;
    const selected =
      exactMatch ??
      rankMatch ??
      overlappingMatch ??
      conferenceMatch ??
      (slot.round === "QF" ? undefined : actual[index]);
    if (!selected || !unused.has(String(selected.id))) return slot;

    unused.delete(String(selected.id));
    return actualMatchupToBracket(selected, slot, teamsById);
  });
}

function attachStats(
  teams: SeededTeam[],
  stats: TeamSeasonStatLine[],
): SeededTeam[] {
  const statsByTeamId = new Map(
    stats.map((stat) => [String(stat.gshlTeamId), stat]),
  );

  return teams.map((team) => ({
    ...team,
    seasonStats: statsByTeamId.get(String(team.id)) ?? team.seasonStats,
  }));
}

function getSeasonFormat(season: Season | null): PlayoffBracketFormat {
  const legacySeasonNumber = Number(season?.legacyId);
  const seasonNumber =
    Number.isInteger(legacySeasonNumber) && legacySeasonNumber > 0
      ? legacySeasonNumber > 1000
        ? Number(season?.year) - 2014
        : legacySeasonNumber
      : Number(season?.year) - 2014;
  return Number.isInteger(seasonNumber) &&
    seasonNumber >= 1 &&
    seasonNumber <= 6
    ? "league"
    : "conference";
}

function createColumn(
  id: string,
  title: string,
  subtitle: string,
  matchups: BracketMatchup[],
  logoUrl: string | null = null,
): PlayoffBracketColumn {
  return { id, title, subtitle, logoUrl, matchups };
}

function buildLeagueBracket(
  teams: SeededTeam[],
  actualMatchups: Matchup[],
  teamsById: Map<string, SeededTeam>,
): PlayoffBracketColumn[] {
  const seeded = sortByRank(teams, "overallRk").slice(0, 8);
  const projectedQuarterfinals = [
    createProjectedMatchup({
      id: "league-qf-1",
      round: "QF",
      title: "Quarterfinal 1",
      homeLabel: "#1",
      awayLabel: "#8",
      homeTeam: seeded[0] ?? null,
      awayTeam: seeded[7] ?? null,
    }),
    createProjectedMatchup({
      id: "league-qf-2",
      round: "QF",
      title: "Quarterfinal 2",
      homeLabel: "#2",
      awayLabel: "#7",
      homeTeam: seeded[1] ?? null,
      awayTeam: seeded[6] ?? null,
    }),
    createProjectedMatchup({
      id: "league-qf-3",
      round: "QF",
      title: "Quarterfinal 3",
      homeLabel: "#3",
      awayLabel: "#6",
      homeTeam: seeded[2] ?? null,
      awayTeam: seeded[5] ?? null,
    }),
    createProjectedMatchup({
      id: "league-qf-4",
      round: "QF",
      title: "Quarterfinal 4",
      homeLabel: "#4",
      awayLabel: "#5",
      homeTeam: seeded[3] ?? null,
      awayTeam: seeded[4] ?? null,
    }),
  ];
  const quarterfinals = mergeActualRound(
    projectedQuarterfinals,
    actualMatchups.filter(
      (matchup) => matchup.gameType === MatchupType.QUARTER_FINAL,
    ),
    teamsById,
  );
  const projectedSemifinals = [
    createProjectedMatchup({
      id: "league-sf-1",
      round: "SF",
      title: "Semifinal 1",
      homeLabel: "Winner QF1",
      awayLabel: "Winner QF4",
      homeTeam: quarterfinals[0]?.winnerTeam ?? null,
      awayTeam: quarterfinals[3]?.winnerTeam ?? null,
    }),
    createProjectedMatchup({
      id: "league-sf-2",
      round: "SF",
      title: "Semifinal 2",
      homeLabel: "Winner QF2",
      awayLabel: "Winner QF3",
      homeTeam: quarterfinals[1]?.winnerTeam ?? null,
      awayTeam: quarterfinals[2]?.winnerTeam ?? null,
    }),
  ];
  const semifinals = mergeActualRound(
    projectedSemifinals,
    actualMatchups.filter(
      (matchup) => matchup.gameType === MatchupType.SEMI_FINAL,
    ),
    teamsById,
  );
  const final = mergeActualRound(
    [
      createProjectedMatchup({
        id: "league-final",
        round: "F",
        title: "GSHL Cup Final",
        homeLabel: "Winner SF1",
        awayLabel: "Winner SF2",
        homeTeam: semifinals[0]?.winnerTeam ?? null,
        awayTeam: semifinals[1]?.winnerTeam ?? null,
      }),
    ],
    actualMatchups.filter((matchup) => matchup.gameType === MatchupType.FINAL),
    teamsById,
  );

  return [
    createColumn(
      "league-quarterfinals",
      "League quarterfinals",
      "The original 1–8 playoff format",
      quarterfinals,
    ),
    createColumn(
      "league-semifinals",
      "League semifinals",
      "Quarterfinal winners advance",
      semifinals,
    ),
    createColumn(
      "league-final",
      "GSHL Cup Final",
      "The league championship",
      final,
    ),
  ];
}

function buildConferenceBracket(
  teams: SeededTeam[],
  actualMatchups: Matchup[],
  teamsById: Map<string, SeededTeam>,
): PlayoffBracketColumn[] {
  const leagueSorted = sortByRank(teams, "overallRk");
  const conferences = getConferenceIdsInBracketOrder(
    leagueSorted,
    actualMatchups,
    teamsById,
  );
  const firstConferenceId = conferences[0] ?? "first";
  const secondConferenceId = conferences[1] ?? "second";
  const topThreeByConference = new Map<string, SeededTeam[]>();

  for (const conference of conferences) {
    topThreeByConference.set(
      conference,
      sortByRank(
        leagueSorted.filter(
          (team) => String(team.confAbbr ?? "").trim() === conference,
        ),
        "conferenceRk",
      ).slice(0, 3),
    );
  }

  const topThreeIds = new Set(
    [...topThreeByConference.values()].flat().map((team) => team.id),
  );
  const wildcards = leagueSorted
    .filter((team) => !topThreeIds.has(team.id))
    .slice(0, 2);
  const assignedByConference = new Map<string, SeededTeam[]>(
    conferences.map((conference) => [
      conference,
      [...(topThreeByConference.get(conference) ?? [])],
    ]),
  );

  for (const wildcard of wildcards) {
    assignedByConference
      .get(String(wildcard.confAbbr ?? "").trim())
      ?.push(wildcard);
  }

  if (conferences.length === 2) {
    const first = assignedByConference.get(firstConferenceId) ?? [];
    const second = assignedByConference.get(secondConferenceId) ?? [];
    if (first.length === 5 && second.length === 3) {
      second.push(first.pop()!);
    } else if (second.length === 5 && first.length === 3) {
      first.push(second.pop()!);
    }
  }

  const conferenceInfo = conferences.map((conference) => {
    const conferenceTeams = leagueSorted.filter(
      (team) => String(team.confAbbr ?? "").trim() === conference,
    );
    const sample = conferenceTeams[0];
    const assigned = assignedByConference.get(conference) ?? [];
    return {
      abbr: conference,
      title: sample?.confName ?? conference,
      logoUrl: sample?.confLogoUrl ?? null,
      seeded: [
        ...sortByRank(
          assigned.filter((team) => topThreeIds.has(team.id)),
          "conferenceRk",
        ),
        ...assigned.filter((team) => !topThreeIds.has(team.id)),
      ].slice(0, 4),
    };
  });

  const projectedQuarterfinals = conferenceInfo.flatMap((conference) => {
    const seeded = conference.seeded;
    return [
      createProjectedMatchup({
        id: `${conference.abbr}-qf-1`,
        round: "QF",
        title: `${conference.title} SF1`,
        logoUrl: conference.logoUrl,
        homeLabel: "#1",
        awayLabel: "#4",
        homeTeam: seeded[0] ?? null,
        awayTeam: seeded[3] ?? null,
      }),
      createProjectedMatchup({
        id: `${conference.abbr}-qf-2`,
        round: "QF",
        title: `${conference.title} SF2`,
        logoUrl: conference.logoUrl,
        homeLabel: "#2",
        awayLabel: "#3",
        homeTeam: seeded[1] ?? null,
        awayTeam: seeded[2] ?? null,
      }),
    ];
  });
  const quarterfinals = mergeActualRound(
    projectedQuarterfinals,
    actualMatchups.filter(
      (matchup) => matchup.gameType === MatchupType.QUARTER_FINAL,
    ),
    teamsById,
  );
  const projectedSemifinals = conferenceInfo.flatMap((conference, index) => {
    const offset = index * 2;
    return [
      createProjectedMatchup({
        id: `${conference.abbr}-sf`,
        round: "SF",
        title: `${conference.title} Championship`,
        logoUrl: conference.logoUrl,
        homeLabel: `Winner ${conference.title} SF1`,
        awayLabel: `Winner ${conference.title} SF2`,
        homeTeam: quarterfinals[offset]?.winnerTeam ?? null,
        awayTeam: quarterfinals[offset + 1]?.winnerTeam ?? null,
      }),
    ];
  });
  const semifinals = mergeActualRound(
    projectedSemifinals,
    actualMatchups.filter(
      (matchup) => matchup.gameType === MatchupType.SEMI_FINAL,
    ),
    teamsById,
  );
  const final = mergeActualRound(
    [
      createProjectedMatchup({
        id: "conference-final",
        round: "F",
        title: "GSHL Cup Final",
        homeLabel: `Winner ${conferenceInfo[0]?.title ?? "First conference"} Championship`,
        awayLabel: `Winner ${conferenceInfo[1]?.title ?? "Second conference"} Championship`,
        homeTeam: semifinals[0]?.winnerTeam ?? null,
        awayTeam: semifinals[1]?.winnerTeam ?? null,
      }),
    ],
    actualMatchups.filter((matchup) => matchup.gameType === MatchupType.FINAL),
    teamsById,
  );

  return [
    createColumn(
      "conference-semifinals",
      "Conference semifinals",
      `${conferenceInfo[0]?.title ?? "First conference"} above · ${conferenceInfo[1]?.title ?? "Second conference"} below`,
      quarterfinals,
    ),
    createColumn(
      "conference-championships",
      "Conference finals",
      "Each conference winner advances",
      semifinals,
    ),
    createColumn(
      "conference-final",
      "GSHL Cup Final",
      "Conference winners meet here",
      final,
    ),
  ];
}

/**
 * Builds a live playoff projection and overlays any scheduled or completed
 * playoff matchups already stored for the selected season.
 */
export function buildPlayoffBracket(
  teams: SeededTeam[],
  stats: TeamSeasonStatLine[],
  matchups: Matchup[] = [],
  season: Season | null = null,
): PlayoffBracketViewModel {
  const seededTeams = attachStats(teams, stats);
  const teamsById = new Map(seededTeams.map((team) => [String(team.id), team]));
  const actualMatchups = getPlayoffMatchups(matchups, season);
  const format = getSeasonFormat(season);
  const columns =
    format === "league"
      ? buildLeagueBracket(seededTeams, actualMatchups, teamsById)
      : buildConferenceBracket(seededTeams, actualMatchups, teamsById);

  return {
    format,
    formatLabel:
      format === "league"
        ? "Seasons 1–6 · league-wide 1–8 bracket"
        : "Season 7+ · conference bracket with wildcard crossover",
    hasPlayedMatchups: actualMatchups.some(isMatchupComplete),
    columns,
  };
}
