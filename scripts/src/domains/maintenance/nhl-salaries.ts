import type { DirectoryPlayer } from "./player-directory";

export const NORMALIZED_SALARY_CAP = 100_000_000;

// NHL Upper Limits by season. Future values can also be supplied by a source
// row or the CLI, allowing normalization to be refreshed without code changes.
export const NHL_SALARY_CAP_BY_START_YEAR: Readonly<Record<number, number>> = {
  2005: 39_000_000,
  2006: 44_000_000,
  2007: 50_300_000,
  2008: 56_700_000,
  2009: 56_800_000,
  2010: 59_400_000,
  2011: 64_300_000,
  // The lockout-shortened season had a $60M formal Upper Limit, with a
  // one-season transition rule permitting clubs to spend up to $70.2M.
  2012: 60_000_000,
  2013: 64_300_000,
  2014: 69_000_000,
  2015: 71_400_000,
  2016: 73_000_000,
  2017: 75_000_000,
  2018: 79_500_000,
  2019: 81_500_000,
  2020: 81_500_000,
  2021: 81_500_000,
  2022: 82_500_000,
  2023: 83_500_000,
  2024: 88_000_000,
  2025: 95_500_000,
  2026: 104_000_000,
  2027: 113_500_000,
};

export type SalarySource = "historical-json" | "puckpedia";

export type StoredSalaryPlayer = {
  id: string;
  legacyId?: string | null;
  nhlApiId?: string | null;
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  birthday?: unknown;
  nhlPos?: unknown;
};

export type PlayerSalaryCandidate = {
  playerId?: string;
  nhlApiId?: string;
  fullName?: string;
  birthDate?: string;
  position?: string;
  seasonStartYear: number;
  salary: number;
  capHit?: number | null;
  salaryCap?: number | null;
  source: SalarySource;
  sourceRef?: string | null;
};

export type PlayerNhlSalaryWrite = {
  seasonStartYear: number;
  playerId: string;
  nhlApiId: string | null;
  season: string;
  salary: number;
  capHit: number | null;
  salaryCap: number | null;
  normalizedSalary: number | null;
  source: SalarySource;
  sourceRef: string | null;
};

export type SalaryReconciliation = {
  rows: PlayerNhlSalaryWrite[];
  unmatched: PlayerSalaryCandidate[];
  ambiguous: PlayerSalaryCandidate[];
  duplicateRows: number;
};

const PLAYER_ID_FIELDS = [
  "playerId",
  "player_id",
  "legacyId",
  "legacy_id",
] as const;
const NHL_ID_FIELDS = ["nhlApiId", "nhl_id", "nhlId", "nhlID"] as const;
const NAME_FIELDS = [
  "fullName",
  "full_name",
  "playerName",
  "player_name",
  "name",
  "Name",
] as const;
const SEASON_FIELDS = [
  "seasonStartYear",
  "season_start_year",
  "seasonYear",
  "season_year",
  "season",
  "year",
  "Season",
] as const;
const SALARY_FIELDS = [
  "salary",
  "nhlSalary",
  "nhl_salary",
  "sal_t",
  "baseSalary",
  "base_salary",
] as const;
const CAP_HIT_FIELDS = ["capHit", "cap_hit", "Cap Hit", "aav"] as const;
const SALARY_CAP_FIELDS = [
  "salaryCap",
  "salary_cap",
  "leagueCap",
  "league_cap",
] as const;
const CONTAINER_KEYS = new Set([
  "data",
  "items",
  "players",
  "records",
  "rows",
  "salaries",
  "salaryHistory",
  "playerNhlSalaries",
]);

function toText(value: unknown): string {
  if (
    value === null ||
    value === undefined ||
    typeof value === "object" ||
    typeof value === "symbol"
  ) {
    return "";
  }
  return String(value).trim();
}

function firstPresent(
  row: Record<string, unknown>,
  fields: readonly string[],
): unknown {
  for (const field of fields) {
    const value = row[field];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return undefined;
}

export function moneyValue(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : null;
  }
  const text = toText(value);
  if (!text) return null;
  const multiplier = /m(?:illion)?$/i.test(text)
    ? 1_000_000
    : /k$/i.test(text)
      ? 1_000
      : 1;
  const parsed = Number(text.replace(/[$,\s]/g, "").replace(/[a-z]+$/i, ""));
  return Number.isFinite(parsed) && parsed >= 0
    ? Math.round(parsed * multiplier)
    : null;
}

export function seasonStartYear(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value >= 1900 && value <= 2200 ? value : null;
  }
  const text = toText(value);
  const match = /(?:^|\D)((?:19|20|21)\d{2})(?:\D|$)/.exec(text);
  return match?.[1] ? Number(match[1]) : null;
}

export function seasonLabel(startYear: number): string {
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

export function normalizeSalary(
  salary: number,
  salaryCap: number | null | undefined,
): number | null {
  if (!Number.isFinite(salary) || salary < 0 || !salaryCap || salaryCap <= 0) {
    return null;
  }
  return Math.round((salary * NORMALIZED_SALARY_CAP) / salaryCap);
}

function canonicalName(value: unknown): string {
  return toText(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function playerFullName(player: StoredSalaryPlayer): string {
  return (
    toText(player.fullName) ||
    `${toText(player.firstName)} ${toText(player.lastName)}`.trim()
  );
}

export function salaryCapForSeason(
  startYear: number,
  overrides: Readonly<Record<number, number>> = {},
): number | null {
  return (
    overrides[startYear] ?? NHL_SALARY_CAP_BY_START_YEAR[startYear] ?? null
  );
}

export function candidatesFromPuckPedia(
  players: readonly DirectoryPlayer[],
  season: number | string,
  sourceRef: string,
  capOverrides: Readonly<Record<number, number>> = {},
): PlayerSalaryCandidate[] {
  const startYear = seasonStartYear(season);
  if (startYear === null) {
    throw new Error(`Invalid PuckPedia salary season: ${String(season)}`);
  }
  const salaryCap = salaryCapForSeason(startYear, capOverrides);
  return players.flatMap((player) => {
    const yearlySalary = player.capHit ?? player.salary;
    if (yearlySalary === null || yearlySalary <= 0) return [];
    return [
      {
        nhlApiId: player.nhlApiId,
        fullName: player.fullName,
        seasonStartYear: startYear,
        // Historical yearly salary is the contract cap hit, so future updates
        // use the same measure instead of season-specific cash compensation.
        salary: yearlySalary,
        capHit: player.capHit,
        salaryCap,
        source: "puckpedia" as const,
        sourceRef,
      },
    ];
  });
}

function rowCandidate(
  row: Record<string, unknown>,
  inherited: Partial<PlayerSalaryCandidate>,
  sourceRef: string,
): PlayerSalaryCandidate | null {
  const rawStartYear =
    seasonStartYear(firstPresent(row, SEASON_FIELDS)) ??
    inherited.seasonStartYear ??
    null;
  const isRankedSalaryHistoryRow =
    "NormalizedYearlySalary" in row && "Cap Hit" in row && "Season" in row;
  const startYear =
    rawStartYear === null
      ? null
      : isRankedSalaryHistoryRow
        ? rawStartYear - 1
        : rawStartYear;
  const exportedCapHit = moneyValue(row["Cap Hit"]);
  const salary = moneyValue(firstPresent(row, SALARY_FIELDS)) ?? exportedCapHit;
  if (startYear === null || salary === null) return null;
  const suppliedCap = moneyValue(firstPresent(row, SALARY_CAP_FIELDS));
  const suppliedNormalizedSalary = moneyValue(row.NormalizedYearlySalary);
  const inferredCap =
    suppliedNormalizedSalary && suppliedNormalizedSalary > 0
      ? Math.round(
          (salary * NORMALIZED_SALARY_CAP) / suppliedNormalizedSalary / 100_000,
        ) * 100_000
      : null;
  const contractId = toText(row.ContractId);
  return {
    playerId: toText(firstPresent(row, PLAYER_ID_FIELDS)) || inherited.playerId,
    nhlApiId: toText(firstPresent(row, NHL_ID_FIELDS)) || inherited.nhlApiId,
    fullName: toText(firstPresent(row, NAME_FIELDS)) || inherited.fullName,
    birthDate: toText(row.Birthdate) || inherited.birthDate,
    position: toText(row.Pos) || inherited.position,
    seasonStartYear: startYear,
    salary,
    capHit: moneyValue(firstPresent(row, CAP_HIT_FIELDS)) ?? exportedCapHit,
    salaryCap: suppliedCap ?? inferredCap ?? salaryCapForSeason(startYear),
    source: "historical-json",
    sourceRef: contractId ? `${sourceRef}:${contractId}` : sourceRef,
  };
}

function inheritedIdentity(
  row: Record<string, unknown>,
  inherited: Partial<PlayerSalaryCandidate>,
): Partial<PlayerSalaryCandidate> {
  return {
    ...inherited,
    playerId: toText(firstPresent(row, PLAYER_ID_FIELDS)) || inherited.playerId,
    nhlApiId: toText(firstPresent(row, NHL_ID_FIELDS)) || inherited.nhlApiId,
    fullName: toText(firstPresent(row, NAME_FIELDS)) || inherited.fullName,
    birthDate: toText(row.Birthdate) || inherited.birthDate,
    position: toText(row.Pos) || inherited.position,
    seasonStartYear:
      seasonStartYear(firstPresent(row, SEASON_FIELDS)) ??
      inherited.seasonStartYear,
  };
}

export function parseSalaryHistory(
  input: unknown,
  sourceRef = "salaryHistory.json",
): PlayerSalaryCandidate[] {
  const candidates: PlayerSalaryCandidate[] = [];

  const visit = (
    value: unknown,
    inherited: Partial<PlayerSalaryCandidate>,
    keyHint?: string,
  ): void => {
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, inherited, keyHint);
      return;
    }
    if (!value || typeof value !== "object") return;

    const row = value as Record<string, unknown>;
    const hintedYear = seasonStartYear(keyHint);
    const hintedName =
      keyHint && hintedYear === null && !CONTAINER_KEYS.has(keyHint)
        ? keyHint
        : undefined;
    const context = inheritedIdentity(row, {
      ...inherited,
      fullName: inherited.fullName ?? hintedName,
      seasonStartYear: hintedYear ?? inherited.seasonStartYear,
    });
    const candidate = rowCandidate(row, context, sourceRef);
    if (candidate) candidates.push(candidate);

    for (const [key, child] of Object.entries(row)) {
      if (SALARY_FIELDS.includes(key as (typeof SALARY_FIELDS)[number]))
        continue;
      if (child && typeof child === "object") {
        visit(child, context, key);
        continue;
      }
      const keyedYear = seasonStartYear(key);
      const keyedSalary = keyedYear === null ? null : moneyValue(child);
      if (keyedYear !== null && keyedSalary !== null) {
        candidates.push({
          ...context,
          seasonStartYear: keyedYear,
          salary: keyedSalary,
          salaryCap: salaryCapForSeason(keyedYear),
          source: "historical-json",
          sourceRef,
        });
      }
    }
  };

  visit(input, {});
  return candidates;
}

function addToMultiMap<T>(map: Map<string, T[]>, key: string, value: T): void {
  if (!key) return;
  const entries = map.get(key) ?? [];
  entries.push(value);
  map.set(key, entries);
}

function dateOnly(value: unknown): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const match = /\d{4}-\d{2}-\d{2}/.exec(toText(value));
  return match?.[0] ?? "";
}

function storedPositions(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [value];
  return values.map(toText).filter(Boolean);
}

function normalizedPosition(value: string): string {
  const position = value.toUpperCase();
  if (position === "L") return "LW";
  if (position === "R") return "RW";
  return position;
}

function canonicalLastName(value: unknown): string {
  const parts = toText(value).split(/\s+/).filter(Boolean);
  return canonicalName(parts.at(-1));
}

export function reconcileSalaryCandidates(
  candidates: readonly PlayerSalaryCandidate[],
  players: readonly StoredSalaryPlayer[],
  capOverrides: Readonly<Record<number, number>> = {},
): SalaryReconciliation {
  const byId = new Map<string, StoredSalaryPlayer>();
  const byLegacyId = new Map<string, StoredSalaryPlayer[]>();
  const byNhlApiId = new Map<string, StoredSalaryPlayer[]>();
  const byName = new Map<string, StoredSalaryPlayer[]>();
  const byBirthDate = new Map<string, StoredSalaryPlayer[]>();
  const byLastName = new Map<string, StoredSalaryPlayer[]>();
  for (const player of players) {
    byId.set(player.id, player);
    addToMultiMap(byLegacyId, toText(player.legacyId), player);
    addToMultiMap(byNhlApiId, toText(player.nhlApiId), player);
    addToMultiMap(byName, canonicalName(playerFullName(player)), player);
    addToMultiMap(byBirthDate, dateOnly(player.birthday), player);
    addToMultiMap(
      byLastName,
      canonicalLastName(playerFullName(player)),
      player,
    );
  }

  const rowsByKey = new Map<string, PlayerNhlSalaryWrite>();
  const unmatched: PlayerSalaryCandidate[] = [];
  const ambiguous: PlayerSalaryCandidate[] = [];
  let duplicateRows = 0;

  for (const candidate of candidates) {
    const direct = candidate.playerId
      ? byId.get(candidate.playerId)
      : undefined;
    let matches = direct
      ? [direct]
      : candidate.nhlApiId
        ? (byNhlApiId.get(candidate.nhlApiId) ?? [])
        : candidate.playerId
          ? (byLegacyId.get(candidate.playerId) ?? [])
          : candidate.fullName
            ? (byName.get(canonicalName(candidate.fullName)) ?? [])
            : [];
    if (matches.length === 0 && candidate.birthDate) {
      matches = byBirthDate.get(candidate.birthDate) ?? [];
    }
    if (matches.length === 0 && candidate.fullName) {
      matches = byLastName.get(canonicalLastName(candidate.fullName)) ?? [];
    }
    if (matches.length > 1 && candidate.birthDate) {
      const birthDateMatches = matches.filter(
        (player) => dateOnly(player.birthday) === candidate.birthDate,
      );
      if (birthDateMatches.length > 0) matches = birthDateMatches;
    }
    if (matches.length > 1 && candidate.position) {
      const candidatePosition = normalizedPosition(candidate.position);
      const positionMatches = matches.filter((player) =>
        storedPositions(player.nhlPos)
          .map(normalizedPosition)
          .some(
            (position) =>
              position === candidatePosition ||
              (position === "F" &&
                ["C", "LW", "RW"].includes(candidatePosition)),
          ),
      );
      if (positionMatches.length > 0) matches = positionMatches;
    }
    if (matches.length === 0) {
      unmatched.push(candidate);
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push(candidate);
      continue;
    }

    const player = matches[0]!;
    const salaryCap =
      capOverrides[candidate.seasonStartYear] ??
      candidate.salaryCap ??
      salaryCapForSeason(candidate.seasonStartYear);
    const row: PlayerNhlSalaryWrite = {
      // seasonStartYear intentionally leads the object so generic Convex
      // upserts scope their indexed read to the whole incoming season.
      seasonStartYear: candidate.seasonStartYear,
      playerId: player.id,
      nhlApiId: toText(player.nhlApiId) || candidate.nhlApiId || null,
      season: seasonLabel(candidate.seasonStartYear),
      salary: Math.round(candidate.salary),
      capHit:
        candidate.capHit === null || candidate.capHit === undefined
          ? null
          : Math.round(candidate.capHit),
      salaryCap,
      normalizedSalary: normalizeSalary(candidate.salary, salaryCap),
      source: candidate.source,
      sourceRef: candidate.sourceRef ?? null,
    };
    const key = `${row.playerId}|${row.seasonStartYear}`;
    if (rowsByKey.has(key)) duplicateRows += 1;
    rowsByKey.set(key, row);
  }

  return {
    rows: [...rowsByKey.values()],
    unmatched,
    ambiguous,
    duplicateRows,
  };
}

export function parseSalaryCapOverrides(
  values: readonly string[],
): Record<number, number> {
  const output: Record<number, number> = {};
  for (const value of values) {
    const [rawSeason, rawCap] = value.split("=", 2);
    const year = seasonStartYear(rawSeason);
    const cap = moneyValue(rawCap);
    if (year === null || cap === null || cap <= 0) {
      throw new Error(
        `Invalid salary cap override "${value}"; use --salary-cap 2028=120000000.`,
      );
    }
    output[year] = cap;
  }
  return output;
}
