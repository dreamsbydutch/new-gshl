type Row = Record<string, unknown>;

export type TeamAwardOutput = {
  seasonId: string;
  ownerId: string;
  nomineeIds: string[];
  award: string;
};

type Candidate = {
  teamId: string;
  value: number;
  overallRk: number | null;
  conferenceRk: number | null;
  rank?: number | null;
};

type Podium = { winnerId: string; nomineeIds: string[] };

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
const number = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
};
const token = (value: unknown) =>
  text(value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const truthy = (value: unknown) =>
  value === true ||
  value === 1 ||
  value === "1" ||
  value === "true" ||
  value === "TRUE";
const regularSeason = (row: Row) =>
  ["", "rs", "regularseason"].includes(token(row.seasonType));

function compareRank(
  left: number | null | undefined,
  right: number | null | undefined,
) {
  return (
    (left ?? Number.POSITIVE_INFINITY) - (right ?? Number.POSITIVE_INFINITY)
  );
}

function compareDesc(left: Candidate, right: Candidate) {
  return (
    right.value - left.value ||
    compareRank(left.overallRk, right.overallRk) ||
    compareRank(left.conferenceRk, right.conferenceRk) ||
    left.teamId.localeCompare(right.teamId)
  );
}

function compareAsc(left: Candidate, right: Candidate) {
  return (
    left.value - right.value ||
    compareRank(left.overallRk, right.overallRk) ||
    compareRank(left.conferenceRk, right.conferenceRk) ||
    left.teamId.localeCompare(right.teamId)
  );
}

function candidate(row: Row, value: number | null): Candidate | null {
  const teamId = text(row.gshlTeamId);
  return teamId && value !== null
    ? {
        teamId,
        value,
        overallRk: number(row.overallRk),
        conferenceRk: number(row.conferenceRk),
      }
    : null;
}

function podium(
  rows: Row[],
  value: (row: Row) => number | null,
  direction: "asc" | "desc" = "desc",
  nominees = true,
): Podium | null {
  const candidates = rows
    .map((row) => candidate(row, value(row)))
    .filter((row): row is Candidate => row !== null)
    .sort(direction === "desc" ? compareDesc : compareAsc);
  const winner = candidates[0];
  return winner
    ? {
        winnerId: winner.teamId,
        nomineeIds: nominees
          ? candidates.slice(1, 3).map((row) => row.teamId)
          : [],
      }
    : null;
}

function rankPodium(rows: Row[], field: string): Podium | null {
  const candidates: Candidate[] = rows
    .flatMap((row): Candidate[] => {
      const result = candidate(row, number(row[field]));
      return result ? [{ ...result, rank: result.value }] : [];
    })
    .sort((a, b) => compareRank(a.rank, b.rank) || compareDesc(a, b));
  const winner = candidates[0];
  return winner
    ? {
        winnerId: winner.teamId,
        nomineeIds: candidates.slice(1, 3).map((row) => row.teamId),
      }
    : null;
}

function cupPodium(matchups: Row[], weeks: Row[]): Podium | null {
  const weekOrder = new Map(
    weeks.map((week) => [
      text(week._id ?? week.id),
      number(week.weekNum) ?? (Date.parse(text(week.startDate)) || 0),
    ]),
  );
  const final = matchups
    .filter((matchup) => token(matchup.gameType) === "f")
    .filter(
      (matchup) =>
        truthy(matchup.homeWin) ||
        truthy(matchup.awayWin) ||
        (number(matchup.homeScore) !== null &&
          number(matchup.awayScore) !== null),
    )
    .sort(
      (a, b) =>
        (weekOrder.get(text(b.weekId)) ?? 0) -
        (weekOrder.get(text(a.weekId)) ?? 0),
    )[0];
  if (!final) return null;
  const homeId = text(final.homeTeamId);
  const awayId = text(final.awayTeamId);
  const homeScore = number(final.homeScore);
  const awayScore = number(final.awayScore);
  const winnerId = truthy(final.homeWin)
    ? homeId
    : truthy(final.awayWin)
      ? awayId
      : homeScore !== null && awayScore !== null && homeScore >= awayScore
        ? homeId
        : awayId;
  return winnerId ? { winnerId, nomineeIds: [] } : null;
}

function conferenceRows(
  rows: Row[],
  teams: Row[],
  conferences: Row[],
  aliases: string[],
) {
  const aliasSet = new Set(aliases.map(token));
  const conferenceIds = new Set(
    conferences
      .filter((conference) =>
        [conference._id, conference.legacyId, conference.name, conference.abbr]
          .map(token)
          .some((value) => aliasSet.has(value)),
      )
      .map((conference) => text(conference._id)),
  );
  const teamIds = new Set(
    teams
      .filter((team) => conferenceIds.has(text(team.confId)))
      .map((team) => text(team._id)),
  );
  return rows.filter((row) => teamIds.has(text(row.gshlTeamId)));
}

export function calculateTeamAwards(input: {
  seasonId: string;
  seasonLegacyId?: string;
  teamSeasonRows: Row[];
  teams: Row[];
  franchises: Row[];
  conferences: Row[];
  matchups: Row[];
  weeks: Row[];
}): TeamAwardOutput[] {
  const rows = input.teamSeasonRows.filter(regularSeason);
  const franchiseOwner = new Map(
    input.franchises.map((row) => [text(row._id), text(row.ownerId)]),
  );
  const teamOwner = new Map(
    input.teams.map((row) => [
      text(row._id),
      franchiseOwner.get(text(row.franchiseId)) ?? "",
    ]),
  );
  const earlySeason = (() => {
    const id = Number.parseInt(input.seasonLegacyId ?? "", 10);
    return Number.isFinite(id) && id >= 1 && id <= 2;
  })();
  const points = (row: Row) => {
    const explicit = number(row.P);
    const goals = number(row.G);
    const assists = number(row.A);
    if (earlySeason)
      return goals === null && assists === null
        ? explicit
        : (goals ?? 0) + (assists ?? 0);
    return (
      explicit ??
      (goals === null && assists === null
        ? null
        : (goals ?? 0) + (assists ?? 0))
    );
  };
  const definitions: Array<[string, Podium | null]> = [
    ["rocket", podium(rows, (row) => number(row.G))],
    ["artRoss", podium(rows, points)],
    [
      "selke",
      podium(rows, (row) => {
        const hits = number(row.HIT);
        const blocks = number(row.BLK);
        return hits === null && blocks === null
          ? null
          : (hits ?? 0) + (blocks ?? 0);
      }),
    ],
    ["hart", rankPodium(rows, "hartRk")],
    ["vezina", rankPodium(rows, "vezinaRk")],
    ["norris", rankPodium(rows, "norrisRk")],
    ["calder", rankPodium(rows, "calderRk")],
    ["gmoy", rankPodium(rows, "GMOYRk")],
    ["jackAdams", rankPodium(rows, "jackAdamsRk")],
    ["ladyByng", podium(rows, (row) => number(row.playersUsed))],
    ["gshlCup", cupPodium(input.matchups, input.weeks)],
    ["brophy", podium(rows, (row) => number(row.overallRk), "desc", false)],
    ["president", podium(rows, (row) => number(row.overallRk), "asc", false)],
    [
      "sunview",
      podium(
        conferenceRows(rows, input.teams, input.conferences, ["sunview", "sv"]),
        (row) => number(row.conferenceRk),
        "asc",
        false,
      ),
    ],
    [
      "hickory",
      podium(
        conferenceRows(rows, input.teams, input.conferences, [
          "hickory",
          "hickoryhotel",
          "hh",
        ]),
        (row) => number(row.conferenceRk),
        "asc",
        false,
      ),
    ],
  ];
  return definitions.flatMap(([award, result]) => {
    if (!result) return [];
    const ownerId = teamOwner.get(result.winnerId);
    if (!ownerId) return [];
    return [
      {
        seasonId: input.seasonId,
        ownerId,
        nomineeIds: Array.from(
          new Set(
            result.nomineeIds
              .map((id) => teamOwner.get(id))
              .filter((id): id is string => Boolean(id)),
          ),
        ),
        award,
      },
    ];
  });
}
