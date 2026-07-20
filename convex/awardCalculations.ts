type Row = Record<string, unknown>;

export type TeamAwardOutput = {
  seasonId: string;
  ownerId: string;
  nomineeIds: string[];
  award: string;
};

export type PlayerAwardOutput = {
  seasonId: string;
  playerId: string;
  nomineeIds: string[];
  award:
    | "crosby"
    | "orr"
    | "brodeur"
    | "gretzky"
    | "ovechkin"
    | "firstAS"
    | "secondAS"
    | "playoffAS";
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
const playoffSeason = (row: Row) => token(row.seasonType) === "po";

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

type AllStarPlayer = {
  playerId: string;
  positions: Set<string>;
  rating: number;
};

type PlayerTrophyKey = "crosby" | "orr" | "brodeur" | "gretzky" | "ovechkin";

type PlayerTrophyCandidate = {
  playerId: string;
  value: number;
  rating: number | null;
};

function positionList(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(positionList);
  const raw = text(value);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return positionList(parsed);
  } catch {
    // CSV and single-position values are handled below.
  }
  return raw
    .split(",")
    .map((value) => value.trim().toUpperCase())
    .filter(Boolean);
}

function playerTrophyPodium(
  rows: Row[],
  value: (row: Row) => number | null,
  eligible: (row: Row) => boolean = () => true,
): { playerId: string; nomineeIds: string[] } | null {
  const candidates = rows
    .filter(regularSeason)
    .filter(eligible)
    .flatMap((row): PlayerTrophyCandidate[] => {
      const playerId = text(row.playerId);
      const result = value(row);
      return playerId && result !== null
        ? [{ playerId, value: result, rating: number(row.Rating) }]
        : [];
    })
    .sort(
      (left, right) =>
        right.value - left.value ||
        (right.rating ?? Number.NEGATIVE_INFINITY) -
          (left.rating ?? Number.NEGATIVE_INFINITY) ||
        left.playerId.localeCompare(right.playerId),
    );
  const winner = candidates[0];
  return winner
    ? {
        playerId: winner.playerId,
        nomineeIds: candidates.slice(1, 3).map((row) => row.playerId),
      }
    : null;
}

export function calculatePlayerTrophyAwards(input: {
  seasonId: string;
  seasonLegacyId?: string;
  playerTotalRows: Row[];
}): PlayerAwardOutput[] {
  const isDefenseman = (row: Row) => positionList(row.nhlPos).includes("D");
  const isGoaltender = (row: Row) =>
    token(row.posGroup) === "g" || positionList(row.nhlPos).includes("G");
  const points = (row: Row) => {
    const explicit = number(row.P);
    const goals = number(row.G);
    const assists = number(row.A);
    const legacyId = Number.parseInt(input.seasonLegacyId ?? "", 10);
    const derive = Number.isFinite(legacyId) && legacyId >= 1 && legacyId <= 2;
    if (derive) {
      return goals === null && assists === null
        ? explicit
        : (goals ?? 0) + (assists ?? 0);
    }
    return (
      explicit ??
      (goals === null && assists === null
        ? null
        : (goals ?? 0) + (assists ?? 0))
    );
  };
  const definitions: Array<
    [PlayerTrophyKey, { playerId: string; nomineeIds: string[] } | null]
  > = [
    [
      "crosby",
      playerTrophyPodium(input.playerTotalRows, (row) => number(row.Rating)),
    ],
    [
      "orr",
      playerTrophyPodium(
        input.playerTotalRows,
        (row) => number(row.Rating),
        isDefenseman,
      ),
    ],
    [
      "brodeur",
      playerTrophyPodium(
        input.playerTotalRows,
        (row) => number(row.Rating),
        isGoaltender,
      ),
    ],
    ["gretzky", playerTrophyPodium(input.playerTotalRows, points)],
    [
      "ovechkin",
      playerTrophyPodium(input.playerTotalRows, (row) => number(row.G)),
    ],
  ];
  return definitions.flatMap(([award, result]) =>
    result ? [{ seasonId: input.seasonId, award, ...result }] : [],
  );
}

function allStarPool(rows: Row[]): AllStarPlayer[] {
  return rows
    .flatMap((row): AllStarPlayer[] => {
      const playerId = text(row.playerId);
      const rating = number(row.Rating);
      const positions = new Set(positionList(row.nhlPos));
      const posGroup = token(row.posGroup);
      return playerId &&
        rating !== null &&
        rating > 0 &&
        posGroup &&
        positions.size > 0
        ? [{ playerId, rating, positions }]
        : [];
    })
    .sort((a, b) => a.playerId.localeCompare(b.playerId));
}

const ALL_STAR_SLOTS = ["C", "LW", "RW", "D", "D", "G"] as const;

function betterLineup(
  candidate: { score: number; picks: string[] },
  existing: { score: number; picks: string[] } | undefined,
) {
  if (!existing || candidate.score > existing.score + 1e-9) return true;
  if (candidate.score < existing.score - 1e-9) return false;
  return candidate.picks.join("|").localeCompare(existing.picks.join("|")) < 0;
}

function selectAllStarLineup(players: AllStarPlayer[]): string[] {
  const states: Array<{ score: number; picks: string[] } | undefined> = [];
  states[0] = {
    score: 0,
    picks: Array.from({ length: ALL_STAR_SLOTS.length }, () => ""),
  };
  for (const player of players) {
    const previous = states.slice();
    for (let mask = 0; mask < previous.length; mask += 1) {
      const state = previous[mask];
      if (!state) continue;
      for (let slot = 0; slot < ALL_STAR_SLOTS.length; slot += 1) {
        if ((mask & (1 << slot)) !== 0) continue;
        if (!player.positions.has(ALL_STAR_SLOTS[slot]!)) continue;
        const nextMask = mask | (1 << slot);
        const picks = [...state.picks];
        picks[slot] = player.playerId;
        const candidate = { score: state.score + player.rating, picks };
        if (betterLineup(candidate, states[nextMask]))
          states[nextMask] = candidate;
      }
    }
  }
  return states[(1 << ALL_STAR_SLOTS.length) - 1]?.picks ?? [];
}

export function calculatePlayerAllStarAwards(input: {
  seasonId: string;
  playerTotalRows: Row[];
}): PlayerAwardOutput[] {
  const regularPool = allStarPool(input.playerTotalRows.filter(regularSeason));
  const first = selectAllStarLineup(regularPool);
  const firstSet = new Set(first);
  const second = selectAllStarLineup(
    regularPool.filter((player) => !firstSet.has(player.playerId)),
  );
  const playoffs = selectAllStarLineup(
    allStarPool(input.playerTotalRows.filter(playoffSeason)),
  );
  return [
    ...first.map((playerId) => ({
      seasonId: input.seasonId,
      playerId,
      nomineeIds: [],
      award: "firstAS" as const,
    })),
    ...second.map((playerId) => ({
      seasonId: input.seasonId,
      playerId,
      nomineeIds: [],
      award: "secondAS" as const,
    })),
    ...playoffs.map((playerId) => ({
      seasonId: input.seasonId,
      playerId,
      nomineeIds: [],
      award: "playoffAS" as const,
    })),
  ];
}

export function calculatePlayerAwards(input: {
  seasonId: string;
  seasonLegacyId?: string;
  playerTotalRows: Row[];
}): PlayerAwardOutput[] {
  return [
    ...calculatePlayerTrophyAwards(input),
    ...calculatePlayerAllStarAwards(input),
  ];
}
