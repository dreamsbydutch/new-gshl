import type { DatabaseRecord } from "../../integrations/data/records";

export const CAREER_ADDITIVE_FIELDS = [
  "days",
  "GP",
  "MG",
  "IR",
  "IRplus",
  "GS",
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
  "W",
  "GA",
  "SV",
  "SA",
  "SO",
  "TOI",
  "ADD",
  "MS",
  "BS",
] as const;
const SKATER_FIELDS = new Set<string>([
  "G",
  "A",
  "P",
  "PM",
  "PIM",
  "PPP",
  "SOG",
  "HIT",
  "BLK",
]);
const GOALIE_FIELDS = new Set<string>(["W", "GA", "SV", "SA", "SO", "TOI"]);

function canonicalId(value: unknown): string {
  if (typeof value !== "string" || !value || value.trim() !== value)
    throw Error("Career stats require canonical season/player/team IDs");
  return value;
}
function seasonType(value: unknown): string {
  if (value === "LT") return "PO";
  if (value === "RS" || value === "PO") return value;
  if (value === undefined || value === null || value === "") return "RS";
  throw Error("Unsupported career season type");
}
function tokens(value: unknown): string[] {
  if (value === undefined || value === null || value === "") return [];
  if (Array.isArray(value)) return value.flatMap(tokens);
  if (typeof value !== "string")
    throw Error("Invalid career identity metadata");
  if (value.trim().startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(value);
      if (Array.isArray(parsed)) return tokens(parsed);
    } catch {
      /* Preserve the established CSV fallback. */
    }
  }
  return value
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}
const union = (values: readonly unknown[]) => [
  ...new Set(values.flatMap(tokens)),
];
function numeric(value: unknown, field: string): number | null {
  if (
    value === undefined ||
    value === null ||
    (typeof value === "string" && !value.trim())
  )
    return null;
  if (
    (typeof value !== "number" && typeof value !== "string") ||
    !Number.isFinite(Number(value))
  )
    throw Error(`Invalid published career source ${field}`);
  const number = Number(value);
  if (
    (field !== "PM" && number < 0) ||
    (field !== "TOI" && !Number.isSafeInteger(number))
  )
    throw Error(`Invalid published career source ${field}`);
  return number;
}

/** Exact canonical key; team IDs remain season-specific, never guessed franchise IDs. */
export function careerStatKey(row: DatabaseRecord, split: boolean): string {
  return JSON.stringify(
    split
      ? [
          canonicalId(row.playerId),
          canonicalId(row.gshlTeamId),
          seasonType(row.seasonType),
        ]
      : [canonicalId(row.playerId), seasonType(row.seasonType)],
  );
}

export type CareerStatInputs = {
  seasonSplits: readonly DatabaseRecord[];
  seasonTotals: readonly DatabaseRecord[];
  /** Full replacement population, not a patch: stale current-season keys disappear. */
  currentSeason?: {
    seasonId: string;
    splits: readonly DatabaseRecord[];
    totals: readonly DatabaseRecord[];
  };
};

function mergeSeasonRows(
  stored: readonly DatabaseRecord[],
  fresh: readonly DatabaseRecord[] | undefined,
  currentSeasonId: string | undefined,
): readonly DatabaseRecord[] {
  if (currentSeasonId === undefined) return stored;
  canonicalId(currentSeasonId);
  for (const row of fresh ?? [])
    if (row.seasonId !== currentSeasonId)
      throw Error("Fresh career source belongs to another season");
  return [
    ...stored.filter((row) => row.seasonId !== currentSeasonId),
    ...(fresh ?? []),
  ];
}

function aggregate(
  rows: readonly DatabaseRecord[],
  split: boolean,
): DatabaseRecord {
  const base = rows[0]!;
  const roles = new Set(rows.map((r) => r.posGroup));
  if (
    [...roles].some((r) => r !== "F" && r !== "D" && r !== "G") ||
    (roles.has("G") && roles.size > 1)
  )
    throw Error("Career source requires a consistent goalie/skater role");
  const goalie = roles.has("G");
  const result: DatabaseRecord = {
    playerId: canonicalId(base.playerId),
    seasonType: seasonType(base.seasonType),
    posGroup: base.posGroup,
    nhlPos: union(rows.map((r) => r.nhlPos)),
    nhlTeam: union(rows.map((r) => r.nhlTeam)),
    ...(split
      ? { gshlTeamId: canonicalId(base.gshlTeamId) }
      : {
          gshlTeamIds: union(
            rows.flatMap((r) => [r.gshlTeamIds, r.gshlTeamId]),
          ).map(canonicalId),
        }),
  };
  for (const field of CAREER_ADDITIVE_FIELDS) {
    if (
      (goalie && SKATER_FIELDS.has(field)) ||
      (!goalie && GOALIE_FIELDS.has(field))
    ) {
      result[field] = "";
      continue;
    }
    const values = rows
      .map((row) => numeric(row[field], field))
      .filter((x): x is number => x !== null);
    if (!values.length) {
      result[field] = "";
      continue;
    }
    const total = values.reduce((sum, x) => sum + x, 0);
    if (
      !Number.isFinite(total) ||
      (field !== "TOI" && !Number.isSafeInteger(total))
    )
      throw Error("Career statistic sum exceeds safe precision");
    result[field] = field === "TOI" ? total.toFixed(2) : String(total || 0);
  }
  // Ratios use published parent workload, not averages of season ratios or today's category mask.
  const ga = numeric(result.GA, "GA"),
    toi = numeric(result.TOI, "TOI");
  const sv = numeric(result.SV, "SV"),
    sa = numeric(result.SA, "SA");
  result.GAA =
    goalie && ga !== null && toi !== null && toi > 0
      ? ((ga / toi) * 60).toFixed(5)
      : "";
  result.SVP =
    goalie && sv !== null && sa !== null && sa > 0 ? (sv / sa).toFixed(5) : "";
  return result;
}

function build(
  rows: readonly DatabaseRecord[],
  split: boolean,
): DatabaseRecord[] {
  const groups = new Map<string, DatabaseRecord[]>(),
    seen = new Set<string>();
  for (const row of rows) {
    const key = careerStatKey(row, split),
      period = JSON.stringify([canonicalId(row.seasonId), key]);
    if (seen.has(period))
      throw Error("Duplicate canonical published season career source");
    seen.add(period);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return [...groups]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, members]) => aggregate(members, split));
}

/** Native careers from verified published PS/PT. Does not emit ratings or storage metadata. */
export function buildCareerStatLines(input: CareerStatInputs): {
  careerSplits: DatabaseRecord[];
  careerTotals: DatabaseRecord[];
} {
  return {
    careerSplits: build(
      mergeSeasonRows(
        input.seasonSplits,
        input.currentSeason?.splits,
        input.currentSeason?.seasonId,
      ),
      true,
    ),
    careerTotals: build(
      mergeSeasonRows(
        input.seasonTotals,
        input.currentSeason?.totals,
        input.currentSeason?.seasonId,
      ),
      false,
    ),
  };
}
