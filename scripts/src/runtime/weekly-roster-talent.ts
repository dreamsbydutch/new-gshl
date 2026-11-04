/** Prospective category forecast. No owner, matchup result, or performance-rating inputs. */
import {
  projectPreseasonPlayers,
  seasonCategories,
  standardized,
  type PreseasonInput,
  type ProjectedPlayer,
} from "./preseason-projection";

type Row = Record<string, unknown>;
export const TALENT_MODEL = "weekly-roster-category-v1";
export const TALENT_CONFIG = {
  gamesPerWeek: 3.2,
  currentHalfLifeDays: 28,
  ratePriorGames: 20,
  availabilityPriorGames: 10,
  samples: 512,
} as const;
const GOALIE = new Set(["W", "GAA", "SVP", "SV", "SO"]);
const COUNTS = [
  "G",
  "A",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "SV",
  "SA",
  "GA",
  "TOI",
  "SO",
];
const ACTIVE = new Set(["C", "LW", "RW", "D", "F", "UTIL", "G"]);
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
const n = (value: unknown) =>
  value == null || value === "" || !Number.isFinite(Number(value))
    ? null
    : Number(value);
const day = (value: unknown) =>
  typeof value === "number"
    ? new Date(value).toISOString().slice(0, 10)
    : String(value ?? "").slice(0, 10);
const id = (row: Row) => String(row.playerId ?? row.id ?? row._id ?? "");
function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string") return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* CSV operator records. */
  }
  return value.split(",").map((s) => s.trim());
}
const clamp = (value: number) => Math.max(0, Math.min(1, value));
function random(playerId: string, sample: number): number {
  let hash = 2166136261;
  for (const char of playerId)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x7feb352d);
  hash ^= hash >>> 15;
  const offset = hash >>> 0;
  const stride = ((hash >>> 9) | 1) >>> 0;
  return (
    ((((Math.imul(sample, stride) + offset) >>> 0) % TALENT_CONFIG.samples) +
      0.5) /
    TALENT_CONFIG.samples
  );
}

export type WeeklyTalentInput = Omit<PreseasonInput, "rosters"> & {
  weeks: Row[];
  playerDays: Row[];
  draftPicks: Row[];
  teamWeeks: Row[];
};
export type TalentSnapshot = {
  teamId: string;
  weekId: string;
  model: string;
  score: number;
  rating: number | null;
  expectedCategoryPoints: number;
  categoryPoints: Record<string, number>;
  projectedWeeklyStats: Record<string, number>;
  rosterSize: number;
  unprovenPlayers: number;
  unavailablePlayers: number;
  snapshotDate: string;
  referenceWeeks: number;
  reference: "historical" | "projected-league";
  projectedAppearances: number;
  projectedGoalieAppearances: number;
  goalieQualification: number;
};

/** Complete roster snapshots only: never union departed players into today's roster. */
function rosterAt(
  input: WeeklyTalentInput,
  teamId: string,
  cutoff: string,
): { rows: Row[]; date: string } {
  const days = input.playerDays.filter(
    (row) =>
      String(row.seasonId) === String(input.season.id) &&
      String(row.gshlTeamId) === teamId &&
      day(row.date) <= cutoff,
  );
  const latest = days
    .map((row) => day(row.date))
    .sort()
    .at(-1);
  const rows = latest
    ? days.filter((row) => day(row.date) === latest)
    : input.draftPicks.filter(
        (row) =>
          String(row.gshlTeamId) === teamId &&
          row.playerId &&
          (!row.onClockEndedAt ||
            new Date(Number(row.onClockEndedAt) || String(row.onClockEndedAt))
              .toISOString()
              .slice(0, 10) <= cutoff),
      );
  return {
    rows: [...new Map(rows.map((row) => [id(row), row])).values()],
    date: latest ?? "",
  };
}

function updatePlayer(
  base: ProjectedPlayer,
  row: Row,
  evidence: Row[],
  cutoff: string,
): ProjectedPlayer {
  const rates = { ...base.rates };
  const totals: Record<string, number> = {};
  const support: Record<string, number> = {};
  let opportunities = 0,
    appearances = 0;
  for (const entry of evidence) {
    const age = (Date.parse(cutoff) - Date.parse(day(entry.date))) / 86400000;
    const weight = 2 ** (-age / TALENT_CONFIG.currentHalfLifeDays);
    const gp = n(entry.GP) ?? 0;
    // MG is generated only after a verified final NHL game. Off days add no absence.
    if (gp > 0 || Number(entry.MG) === 1) {
      opportunities += weight;
      if (gp > 0) appearances += weight;
    }
    if (gp <= 0) continue;
    for (const field of COUNTS) {
      const value = n(entry[field]);
      if (value === null) continue;
      totals[field] = (totals[field] ?? 0) + value * weight;
      support[field] = (support[field] ?? 0) + gp * weight;
    }
  }
  for (const field of COUNTS) {
    if (!support[field]) continue;
    rates[field] =
      ((rates[field] ?? 0) * TALENT_CONFIG.ratePriorGames +
        (totals[field] ?? 0)) /
      (TALENT_CONFIG.ratePriorGames + support[field]!);
  }
  rates.P = (rates.G ?? 0) + (rates.A ?? 0);
  rates.GAA = (rates.TOI ?? 0) > 0 ? (60 * (rates.GA ?? 0)) / rates.TOI! : 5;
  rates.SVP = (rates.SA ?? 0) > 0 ? (rates.SV ?? 0) / rates.SA! : 0.8;
  const availability = opportunities
    ? (base.availability * TALENT_CONFIG.availabilityPriorGames + appearances) /
      (TALENT_CONFIG.availabilityPriorGames + opportunities)
    : base.availability;
  const unavailable = ["IR", "IR+"].includes(
    String(row.dailyPos ?? "").toUpperCase(),
  );
  return {
    ...base,
    rates,
    availability: unavailable ? 0 : clamp(availability),
  };
}

function eligible(player: ProjectedPlayer, slot: string): boolean {
  return slot === "UTIL"
    ? !player.goalie
    : slot === "F"
      ? !player.goalie && !player.positions.includes("D")
      : player.positions.includes(slot);
}

function projectTeam(
  players: ProjectedPlayer[],
  slots: string[],
  value: Map<string, number>,
  minimum: number,
) {
  const ordered = players
    .slice()
    .sort(
      (a, b) =>
        (value.get(b.playerId) ?? 0) - (value.get(a.playerId) ?? 0) ||
        a.playerId.localeCompare(b.playerId),
    );
  const stats: Record<string, number> = {};
  const goalieDaily = Array.from(
    { length: slots.filter((slot) => slot === "G").length + 1 },
    () => 0,
  );
  let appearances = 0,
    goalieAppearances = 0;
  for (let sample = 0; sample < TALENT_CONFIG.samples; sample++) {
    const assigned = new Map<number, ProjectedPlayer>();
    function place(player: ProjectedPlayer, seen: Set<number>): boolean {
      for (let i = 0; i < slots.length; i++) {
        if (seen.has(i) || !eligible(player, slots[i]!)) continue;
        seen.add(i);
        const occupant = assigned.get(i);
        if (!occupant || place(occupant, seen)) {
          assigned.set(i, player);
          return true;
        }
      }
      return false;
    }
    for (const player of ordered) {
      if (
        random(player.playerId, sample) <
        (player.availability * TALENT_CONFIG.gamesPerWeek) / 7
      )
        place(player, new Set());
    }
    const selected = [...assigned.values()];
    goalieDaily[selected.filter((p) => p.goalie).length]! +=
      1 / TALENT_CONFIG.samples;
    for (const player of selected) {
      const weight = 7 / TALENT_CONFIG.samples;
      appearances += weight;
      if (player.goalie) goalieAppearances += weight;
      for (const field of player.goalie
        ? ["W", "SV", "SA", "GA", "TOI", "SO"]
        : ["G", "A", "PM", "PIM", "PPP", "SOG", "HIT", "BLK"])
        stats[field] =
          (stats[field] ?? 0) + weight * (player.rates[field] ?? 0);
    }
  }
  stats.P = (stats.G ?? 0) + (stats.A ?? 0);
  stats.GAA = (stats.TOI ?? 0) > 0 ? (60 * (stats.GA ?? 0)) / stats.TOI! : 5;
  stats.SVP = (stats.SA ?? 0) > 0 ? (stats.SV ?? 0) / stats.SA! : 0.8;
  let distribution = [1];
  for (let d = 0; d < 7; d++) {
    const next = Array.from(
      { length: distribution.length + goalieDaily.length - 1 },
      () => 0,
    );
    distribution.forEach((p, i) =>
      goalieDaily.forEach((q, j) => {
        next[i + j]! += p * q;
      }),
    );
    distribution = next;
  }
  return {
    stats,
    appearances,
    goalieAppearances,
    qualification:
      1 - distribution.slice(0, minimum).reduce((a, b) => a + b, 0),
  };
}

/** The cutoff is strict for performance, inclusive for roster membership. */
export function buildWeeklyTalentSnapshots(
  input: WeeklyTalentInput,
): TalentSnapshot[] {
  const categories = seasonCategories(input.season);
  const configured = list(input.season.rosterSpots).map((s) => s.toUpperCase());
  const slots = configured.length
    ? configured.filter((s) => ACTIVE.has(s))
    : DEFAULT_SLOTS;
  const minimum =
    String(input.season.legacyId ?? input.season.id) === "1" ? 1 : 2;
  const targetYear = n(input.season.year ?? input.season.seasonYear) ?? 0;
  const previousSeasons = new Set(
    input.seasons
      .filter((s) => {
        const distance = targetYear - (n(s.year ?? s.seasonYear) ?? 0);
        return distance >= 1 && distance <= 3;
      })
      .map((s) => String(s.id)),
  );
  const weeksById = new Map(input.weeks.map((w) => [String(w.id), w]));
  const backgrounds = input.teamWeeks.filter(
    (row) =>
      previousSeasons.has(String(row.seasonId)) &&
      (n(row.GP) ?? 0) > 0 &&
      weeksById.has(String(row.weekId)),
  );
  const reference = new Map(
    categories.map((field) => [
      field,
      backgrounds.flatMap((row) => {
        const value = n(row[field]);
        const week = weeksById.get(String(row.weekId))!;
        const length =
          (Date.parse(day(week.endDate)) - Date.parse(day(week.startDate))) /
            86400000 +
          1;
        return value === null || !(length > 0)
          ? []
          : [
              GOALIE.has(field) && ["GAA", "SVP"].includes(field)
                ? value
                : (value * 7) / length,
            ];
      }),
    ]),
  );
  // Fixed positional reference prevents an added bench player changing everyone else's utility.
  const priorRoster = input.playerNhlRows
    .filter((row) => previousSeasons.has(String(row.seasonId)))
    .map((row) => ({ ...row, playerId: id(row) }));
  const priorPlayers = [
    ...projectPreseasonPlayers({ ...input, rosters: priorRoster }).values(),
  ];
  const utilityReference = new Map(
    categories.map((field) => {
      const pool = priorPlayers
        .filter((p) => p.goalie === GOALIE.has(field))
        .map((p) => p.rates[field] ?? 0);
      const mean = pool.length
        ? pool.reduce((a, b) => a + b, 0) / pool.length
        : 0;
      const sd =
        Math.sqrt(
          pool.reduce((a, b) => a + (b - mean) ** 2, 0) /
            Math.max(1, pool.length),
        ) || 1;
      return [field, { mean, sd }];
    }),
  );
  const snapshots: TalentSnapshot[] = [];
  for (const week of input.weeks.filter(
    (w) => String(w.seasonId) === String(input.season.id),
  )) {
    const cutoff = day(week.startDate);
    const rosters = input.teams.map((team) => ({
      teamId: String(team.id),
      ...rosterAt(input, String(team.id), cutoff),
    }));
    const allRosterRows = rosters.flatMap((r) => r.rows);
    const bases = projectPreseasonPlayers({ ...input, rosters: allRosterRows });
    // Deduplicate traded players and exclude future, live and unfinalized stat lines.
    const evidence = new Map<string, Row>();
    for (const row of input.playerDays) {
      if (
        String(row.seasonId) !== String(input.season.id) ||
        day(row.date) >= cutoff ||
        row.lineupAccountingFinalized === false
      )
        continue;
      const key = `${id(row)}:${day(row.date)}`;
      const old = evidence.get(key);
      if (!old || (n(row.GP) ?? 0) > (n(old.GP) ?? 0)) evidence.set(key, row);
    }
    const playerEvidence = new Map<string, Row[]>();
    for (const row of evidence.values())
      playerEvidence.set(id(row), [
        ...(playerEvidence.get(id(row)) ?? []),
        row,
      ]);
    const players = new Map(
      allRosterRows.map((row) => {
        const base = bases.get(id(row))!;
        return [
          id(row),
          updatePlayer(base, row, playerEvidence.get(id(row)) ?? [], cutoff),
        ];
      }),
    );
    const value = new Map<string, number>();
    for (const player of players.values()) {
      let utility = 0;
      for (const field of categories.filter(
        (field) => GOALIE.has(field) === player.goalie,
      )) {
        const { mean, sd } = utilityReference.get(field)!;
        utility +=
          ((field === "GAA" ? -1 : 1) * ((player.rates[field] ?? 0) - mean)) /
          sd;
      }
      value.set(player.playerId, utility);
    }
    const projections = rosters.map((roster) => ({
      roster,
      projection: projectTeam(
        roster.rows.map((row) => players.get(id(row))!),
        slots,
        value,
        minimum,
      ),
    }));
    const rows = projections.map(({ roster, projection }) => {
      const categoryPoints: Record<string, number> = {};
      for (const field of categories) {
        const historical = reference.get(field) ?? [];
        const opponents = historical.length
          ? historical
          : projections.map((p) => p.projection.stats[field] ?? 0);
        const target = projection.stats[field] ?? 0;
        const direction = field === "GAA" ? -1 : 1;
        const average =
          opponents.reduce((a, b) => a + b, 0) / Math.max(1, opponents.length);
        const sd = Math.sqrt(
          opponents.reduce((a, b) => a + (b - average) ** 2, 0) /
            Math.max(1, opponents.length),
        );
        // Smooth empirical outcomes: a mean forecast is uncertain, not a guaranteed win.
        const floor = field === "GAA" ? 0.1 : field === "SVP" ? 0.005 : 1;
        const uncertainty = Math.max(floor, 0.35 * sd);
        const points =
          opponents.reduce(
            (sum, other) =>
              sum +
              1 / (1 + Math.exp((-direction * (target - other)) / uncertainty)),
            0,
          ) / Math.max(1, opponents.length);
        categoryPoints[field] = GOALIE.has(field)
          ? projection.qualification * points
          : points;
      }
      return {
        teamId: roster.teamId,
        weekId: String(week.id),
        model: TALENT_MODEL,
        score: 0,
        rating: 50,
        expectedCategoryPoints: Object.values(categoryPoints).reduce(
          (a, b) => a + b,
          0,
        ),
        categoryPoints,
        projectedWeeklyStats: projection.stats,
        rosterSize: roster.rows.length,
        unprovenPlayers: roster.rows.filter(
          (row) =>
            !bases.get(id(row))!.historySeasons &&
            !(playerEvidence.get(id(row)) ?? []).some(
              (row) => (n(row.GP) ?? 0) > 0,
            ),
        ).length,
        unavailablePlayers: roster.rows.filter((row) =>
          ["IR", "IR+"].includes(String(row.dailyPos).toUpperCase()),
        ).length,
        snapshotDate: roster.date,
        referenceWeeks: backgrounds.length,
        reference: categories.every(
          (field) => (reference.get(field)?.length ?? 0) > 0,
        )
          ? ("historical" as const)
          : ("projected-league" as const),
        projectedAppearances: projection.appearances,
        projectedGoalieAppearances: projection.goalieAppearances,
        goalieQualification: projection.qualification,
      };
    });
    const supported = rows.filter((row) => row.rosterSize > 0);
    const scores = standardized(
      supported.map((row) => row.expectedCategoryPoints),
    );
    const scoresByTeam = new Map(
      supported.map((row, index) => [row.teamId, scores[index]!]),
    );
    snapshots.push(
      ...rows.map((row) => {
        const score = scoresByTeam.get(row.teamId) ?? 0;
        return {
          ...row,
          score,
          rating: row.rosterSize ? 50 + 25 * score : null,
        };
      }),
    );
  }
  return snapshots;
}
