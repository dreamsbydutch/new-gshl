/** Pure, season-scoped projections shared by the browser facade and power replay. */
type Row = Record<string, unknown>;

const SKATER = ["G", "A", "P", "PM", "PIM", "PPP", "SOG", "HIT", "BLK"];
const GOALIE = ["W", "GAA", "SVP", "SV", "SO"];
const DEFAULT_CATEGORIES = [
  "G",
  "A",
  "P",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GAA",
  "SVP",
];
const DEFAULT_SLOTS = [
  "C",
  "C",
  "LW",
  "LW",
  "RW",
  "RW",
  "D",
  "D",
  "D",
  "UTIL",
  "G",
];

export const PRESEASON_CONFIG = {
  recency: [1, 0.6, 0.3],
  skaterPriorGames: 30,
  goaliePriorGames: 50,
  lineupSamples: 512,
  gamesPerWeek: 3.2,
} as const;

function number(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}
function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* Operator records may use CSV. */
  }
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}
export function seasonCategories(season: Row): string[] {
  const aliases: Record<string, string> = {
    "+/-": "PM",
    "SV%": "SVP",
    SHO: "SO",
    SHOTS: "SOG",
  };
  const configured = list(season.categories).map(
    (field) => aliases[field.toUpperCase()] ?? field.toUpperCase(),
  );
  const fields = configured.length ? configured : DEFAULT_CATEGORIES;
  const unsupported = fields.filter(
    (field) => ![...SKATER, ...GOALIE].includes(field),
  );
  if (unsupported.length)
    throw new Error(`Unsupported power categories: ${unsupported.join(", ")}`);
  return [...new Set(fields)];
}
function positions(row: Row): string[] {
  const explicit = list(row.nhlPos).map((pos) => pos.toUpperCase());
  if (explicit.length) return explicit;
  return row.posGroup === "G"
    ? ["G"]
    : row.posGroup === "D"
      ? ["D"]
      : ["C", "LW", "RW"];
}
function group(row: Row): string {
  const pos = positions(row);
  return pos.includes("G") ? "G" : pos.includes("D") ? "D" : "F";
}
function mean(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}
export function standardized(values: number[]): number[] {
  const average = mean(values);
  const deviation = Math.sqrt(
    mean(values.map((value) => (value - average) ** 2)),
  );
  return values.map((value) =>
    deviation > 1e-9 ? (value - average) / deviation : 0,
  );
}

export type ProjectedPlayer = {
  playerId: string;
  positions: string[];
  goalie: boolean;
  availability: number;
  rates: Record<string, number>;
  historySeasons: number;
};
export type PreseasonTeamProjection = {
  teamId: string;
  rank: number;
  rating: number;
  score: number;
  categoryStrength: Record<string, number>;
  projectedWeeklyStats: Record<string, number>;
  rosterSize: number;
  unprovenPlayers: number;
  projectedStarts: number;
  goalieQualification: number;
};
export type PreseasonInput = {
  season: Row;
  seasons: Row[];
  teams: Row[];
  rosters: Row[];
  playerNhlRows: Row[];
};

export function projectPreseasonPlayers(
  input: PreseasonInput,
): Map<string, ProjectedPlayer> {
  const yearBySeason = new Map(
    input.seasons.map((season) => [
      String(season.id ?? season._id),
      number(season.year ?? season.seasonYear),
    ]),
  );
  const targetYear = number(input.season.year ?? input.season.seasonYear);
  const history = input.playerNhlRows.filter((row) => {
    const distance = targetYear - (yearBySeason.get(String(row.seasonId)) ?? 0);
    return (
      distance >= 1 &&
      distance <= PRESEASON_CONFIG.recency.length &&
      number(row.GP) > 0
    );
  });
  const byPlayer = new Map<string, Row[]>();
  const maxGpBySeason = new Map<string, number>();
  for (const row of history) {
    const id = String(row.playerId);
    byPlayer.set(id, [...(byPlayer.get(id) ?? []), row]);
    const season = String(row.seasonId);
    maxGpBySeason.set(
      season,
      Math.max(maxGpBySeason.get(season) ?? 0, number(row.GP)),
    );
  }
  // Pooled rates preserve proper denominators, particularly goalie ratios.
  const priors = new Map<string, Record<string, number>>();
  for (const position of ["F", "D", "G"]) {
    const rows = history.filter((row) => group(row) === position);
    const totalGp = rows.reduce((sum, row) => sum + number(row.GP), 0);
    const rates: Record<string, number> = {};
    for (const field of [...SKATER, "W", "SV", "SA", "GA", "TOI", "SO"]) {
      rates[field] = totalGp
        ? rows.reduce((sum, row) => sum + number(row[field]), 0) / totalGp
        : 0;
    }
    priors.set(position, rates);
  }
  const result = new Map<string, ProjectedPlayer>();
  for (const roster of input.rosters) {
    const playerId = String(roster.playerId ?? roster.id ?? roster._id);
    const rows = (byPlayer.get(playerId) ?? []).sort(
      (a, b) =>
        (yearBySeason.get(String(b.seasonId)) ?? 0) -
        (yearBySeason.get(String(a.seasonId)) ?? 0),
    );
    const latest = rows[0];
    const identity =
      list(roster.nhlPos).length || roster.posGroup
        ? roster
        : (latest ?? roster);
    const position = group(identity);
    const goalie = position === "G";
    const prior = priors.get(position) ?? {};
    const priorGp = goalie
      ? PRESEASON_CONFIG.goaliePriorGames
      : PRESEASON_CONFIG.skaterPriorGames;
    let effectiveGp = 0;
    const totals: Record<string, number> = {};
    let availability = 0;
    let availabilityWeight = 0;
    for (const row of rows) {
      const distance =
        targetYear - (yearBySeason.get(String(row.seasonId)) ?? 0);
      const weight = PRESEASON_CONFIG.recency[distance - 1] ?? 0;
      const gp = number(row.GP);
      effectiveGp += gp * weight;
      for (const field of Object.keys(prior))
        totals[field] = (totals[field] ?? 0) + number(row[field]) * weight;
      // Normalize shortened NHL seasons rather than treating them as injuries.
      availability +=
        (weight * gp) /
        Math.max(gp, maxGpBySeason.get(String(row.seasonId)) ?? 82);
      availabilityWeight += weight;
    }
    const rates: Record<string, number> = {};
    for (const field of Object.keys(prior))
      rates[field] =
        ((totals[field] ?? 0) + priorGp * (prior[field] ?? 0)) /
        (effectiveGp + priorGp);
    rates.P = (rates.G ?? 0) + (rates.A ?? 0);
    rates.GAA = (rates.TOI ?? 0) > 0 ? (60 * (rates.GA ?? 0)) / rates.TOI! : 3;
    rates.SVP = (rates.SA ?? 0) > 0 ? (rates.SV ?? 0) / rates.SA! : 0.9;
    // Stale histories lose workload. Unknown players retain a conservative role.
    const latestDistance = latest
      ? targetYear - (yearBySeason.get(String(latest.seasonId)) ?? 0)
      : 1;
    const workload = availabilityWeight
      ? (availability / availabilityWeight) * 0.65 ** (latestDistance - 1)
      : goalie
        ? 0.3
        : 0.55;
    result.set(playerId, {
      playerId,
      positions: positions(identity),
      goalie,
      availability: Math.min(1, Math.max(0, workload)),
      rates,
      historySeasons: rows.length,
    });
  }
  return result;
}

function eligible(player: ProjectedPlayer, slot: string): boolean {
  return slot === "UTIL"
    ? !player.goalie
    : slot === "F"
      ? !player.goalie && !player.positions.includes("D")
      : player.positions.includes(slot);
}

/** Highest-value feasible lineup. Augmenting paths preserve multi-position flexibility. */
function lineup(
  players: ProjectedPlayer[],
  slots: string[],
): ProjectedPlayer[] {
  const assigned = new Map<number, ProjectedPlayer>();
  function place(player: ProjectedPlayer, seen: Set<number>): boolean {
    for (let index = 0; index < slots.length; index++) {
      if (seen.has(index) || !eligible(player, slots[index]!)) continue;
      seen.add(index);
      const occupant = assigned.get(index);
      if (!occupant || place(occupant, seen)) {
        assigned.set(index, player);
        return true;
      }
    }
    return false;
  }
  for (const player of players) place(player, new Set());
  return [...assigned.values()];
}

export function buildPreseasonProjections(
  input: PreseasonInput,
): PreseasonTeamProjection[] {
  const categories = seasonCategories(input.season);
  const configuredSlots = list(input.season.rosterSpots).map((slot) =>
    slot.toUpperCase(),
  );
  const slots = configuredSlots.length
    ? configuredSlots.filter((slot) =>
        ["C", "LW", "RW", "D", "F", "UTIL", "G"].includes(slot),
      )
    : DEFAULT_SLOTS;
  const projections = projectPreseasonPlayers(input);
  const players = [...projections.values()];
  const value = new Map(players.map((player) => [player.playerId, 0]));
  for (const field of categories) {
    const pool = players.filter(
      (player) => player.goalie === GOALIE.includes(field),
    );
    const scores = standardized(pool.map((player) => player.rates[field] ?? 0));
    pool.forEach((player, index) =>
      value.set(
        player.playerId,
        (value.get(player.playerId) ?? 0) +
          (field === "GAA" ? -1 : 1) * scores[index]!,
      ),
    );
  }
  const teams = input.teams.map((team) => {
    const teamId = String(team.id ?? team._id);
    const ids = new Set(
      input.rosters
        .filter((row) => String(row.gshlTeamId) === teamId)
        .map((row) => String(row.playerId ?? row.id ?? row._id)),
    );
    const roster = [...ids]
      .flatMap((id) => (projections.get(id) ? [projections.get(id)!] : []))
      .sort(
        (a, b) =>
          (value.get(b.playerId) ?? 0) - (value.get(a.playerId) ?? 0) ||
          a.playerId.localeCompare(b.playerId),
      );
    const stats: Record<string, number> = {};
    let goalieStarts = 0;
    const dailyGoalieCounts = Array.from(
      { length: slots.filter((slot) => slot === "G").length + 1 },
      () => 0,
    );
    // Common deterministic draws reduce simulation noise when comparing teams.
    let seed = 20260924;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let sample = 0; sample < PRESEASON_CONFIG.lineupSamples; sample++) {
      // Adding a bench player does not change every other player's schedule draw.
      seed = (20260924 ^ Math.imul(sample + 1, 2654435761)) >>> 0;
      const available = roster.filter(
        (player) =>
          random() < (player.availability * PRESEASON_CONFIG.gamesPerWeek) / 7,
      );
      const selected = lineup(available, slots);
      dailyGoalieCounts[selected.filter((player) => player.goalie).length]! +=
        1 / PRESEASON_CONFIG.lineupSamples;
      for (const player of selected) {
        const weight = 7 / PRESEASON_CONFIG.lineupSamples;
        if (player.goalie) goalieStarts += weight;
        for (const field of player.goalie
          ? ["W", "SV", "SA", "GA", "TOI", "SO"]
          : SKATER)
          stats[field] =
            (stats[field] ?? 0) + weight * (player.rates[field] ?? 0);
      }
    }
    stats.GAA = (stats.TOI ?? 0) > 0 ? (60 * (stats.GA ?? 0)) / stats.TOI! : 5;
    stats.SVP = (stats.SA ?? 0) > 0 ? (stats.SV ?? 0) / stats.SA! : 0.8;
    let weeklyCounts = [1];
    for (let day = 0; day < 7; day++) {
      const next = Array.from(
        { length: weeklyCounts.length + dailyGoalieCounts.length - 1 },
        () => 0,
      );
      weeklyCounts.forEach((probability, total) =>
        dailyGoalieCounts.forEach((daily, count) => {
          next[total + count]! += probability * daily;
        }),
      );
      weeklyCounts = next;
    }
    const minimum =
      String(input.season.legacyId ?? input.season.id) === "1" ? 1 : 2;
    const goalieQualification =
      1 -
      weeklyCounts
        .slice(0, minimum)
        .reduce((sum, probability) => sum + probability, 0);
    return {
      teamId,
      rank: 0,
      rating: 50,
      score: 0,
      categoryStrength: {},
      projectedWeeklyStats: stats,
      rosterSize: roster.length,
      unprovenPlayers: roster.filter((player) => !player.historySeasons).length,
      projectedStarts: goalieStarts,
      goalieQualification,
    } satisfies PreseasonTeamProjection;
  });
  for (const field of categories) {
    const scores = standardized(
      teams.map((team) => team.projectedWeeklyStats[field] ?? 0),
    );
    teams.forEach((team, index) => {
      let score = Math.max(
        -2.5,
        Math.min(2.5, scores[index]! * (field === "GAA" ? -1 : 1)),
      );
      // Failing the minimum forfeits goalie categories regardless of strong ratios.
      if (GOALIE.includes(field))
        score = team.goalieQualification * (score + 2.5) - 2.5;
      (team.categoryStrength as Record<string, number>)[field] = score;
      team.score += score / categories.length;
    });
  }
  const scores = standardized(teams.map((team) => team.score));
  teams.forEach((team, index) => {
    team.score = scores[index]!;
    team.rating = 50 + 25 * team.score;
  });
  teams.sort((a, b) => b.score - a.score || a.teamId.localeCompare(b.teamId));
  teams.forEach((team, index) => {
    team.rank =
      index && Math.abs(team.score - teams[index - 1]!.score) < 1e-9
        ? teams[index - 1]!.rank
        : index + 1;
  });
  return teams;
}
