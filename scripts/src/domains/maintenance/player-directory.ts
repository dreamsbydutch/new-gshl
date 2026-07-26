import type { PlayerActivityEvidence } from "./player-activity";

export type PuckPediaRow = Record<string, unknown>;

export type DirectoryPlayer = {
  sourceId: string;
  nhlApiId: string;
  firstName: string;
  lastName: string;
  fullName: string;
  birthDate: string;
  country: string;
  handedness: string;
  jerseyNum: number | null;
  weight: number | null;
  height: string;
  positions: string[];
  posGroup: "F" | "D" | "G";
  teamAbbr: string;
  contractStatus: string;
  contractLength: number | null;
  salary: number | null;
  capHit: number | null;
  clauses: string;
  contractStartYear: string;
  signingDate: string;
  signingAgent: string;
  signingGm: string;
  signingStatus: string;
  expiryYear: string;
  expiryStatus: string;
};

export type StoredPlayer = Record<string, unknown> & {
  id: string;
  legacyId?: string | null;
  nhlApiId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  birthday?: string | null;
  nhlPos?: unknown;
  posGroup?: string | null;
  nhlTeam?: unknown;
  isActive?: boolean | null;
  isSignable?: boolean | null;
  isResignable?: unknown;
  ownerId?: unknown;
  // Transitional legacy relationship cleared by roster reconciliation.
  gshlTeamId?: unknown;
  lineupPos?: unknown;
};

export type PlayerUpdate = {
  id: string;
  data: Record<string, unknown>;
  reason:
    | "nhlApiId"
    | "exactName"
    | "aliasName"
    | "birthDate"
    | "missingFromPuckPedia";
};

export type PlayerInsert = Record<string, unknown> & {
  legacyId: string;
  nhlApiId: string;
  firstName: string;
  lastName: string;
  fullName: string;
};

export type PlayerReviewCandidate = {
  id: string;
  legacyId: string;
  nhlApiId: string;
  fullName: string;
  birthday: string;
  positions: string[];
  teams: string[];
  ownerId: string;
  isActive: boolean;
  nameSimilarity: number;
  signals: string[];
};

export type PlayerInsertReview = {
  sourceId: string;
  nhlApiId: string;
  fullName: string;
  birthDate: string;
  positions: string[];
  team: string;
  closestExistingPlayers: PlayerReviewCandidate[];
};

export type UnmatchedActivePlayerReview = {
  id: string;
  legacyId: string;
  nhlApiId: string;
  fullName: string;
  birthday: string;
  positions: string[];
  teams: string[];
  ownerId: string;
  isSignable: boolean;
  isResignable: string;
};

export type PlayerDeactivationReview = UnmatchedActivePlayerReview &
  PlayerActivityEvidence & {
    decision:
      | "deactivate"
      | "keepCurrentSeasonGames"
      | "keepPreviousSeasonGames"
      | "keepIncompleteEvidence";
  };

export type ReconciliationIssue = {
  sourceId: string;
  nhlApiId: string;
  fullName: string;
  candidateIds: string[];
  reason:
    | "ambiguousNhlApiId"
    | "ambiguousName"
    | "existingNhlApiIdConflict"
    | "sourceIdentityCollision";
};

export type PlayerReconciliation = {
  updates: PlayerUpdate[];
  inserts: PlayerInsert[];
  insertReviews: PlayerInsertReview[];
  unmatchedActivePlayers: UnmatchedActivePlayerReview[];
  deactivationReviews: PlayerDeactivationReview[];
  deactivations: Array<{ id: string; data: { isActive: false } }>;
  issues: ReconciliationIssue[];
  duplicateSourceRows: number;
  unchanged: number;
};

const FIRST_NAME_ALIAS_FAMILIES = [
  ["alex", "alexander", "alexandre", "aleksander", "aleksandr"],
  ["alexei", "alexey", "aleksei"],
  ["andrei", "andrey"],
  ["andy", "andrew"],
  ["artem", "artyom"],
  ["ben", "benjamin"],
  ["bill", "billy", "will", "william"],
  ["bob", "bobby", "robert"],
  ["cam", "cameron"],
  ["chris", "christopher"],
  ["dan", "danny", "daniel"],
  ["danil", "daniil"],
  ["dave", "david"],
  ["egor", "yegor"],
  ["evgeni", "evgenii", "evgeny", "yevgeni", "yevgeny"],
  ["fedor", "fyodor"],
  ["gabe", "gabriel"],
  ["ilia", "ilya"],
  ["jake", "jacob"],
  ["jim", "jimmy", "james"],
  ["joe", "joey", "joseph"],
  ["john", "johnny", "jon", "jonathan"],
  ["josh", "joshua"],
  ["matt", "mathew", "matthew", "matty"],
  ["matvei", "matvey"],
  ["mike", "michael", "mikey"],
  ["nate", "nathan", "nathaniel"],
  ["nick", "nicholas", "nik"],
  ["nikolai", "nikolay"],
  ["pat", "patrick"],
  ["petr", "peter", "pyotr"],
  ["sam", "samuel"],
  ["semen", "semyon"],
  ["sergei", "sergey"],
  ["tony", "anthony"],
  ["will", "william", "liam"],
  ["zach", "zachary", "zack"],
] as const;

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv"]);

const POSITION_MAP: Record<string, string> = {
  l: "LW",
  lw: "LW",
  leftwing: "LW",
  c: "C",
  center: "C",
  r: "RW",
  rw: "RW",
  rightwing: "RW",
  d: "D",
  defense: "D",
  defence: "D",
  g: "G",
  goalie: "G",
  goaltender: "G",
};

const TEAM_ABBR_BY_SLUG: Record<string, string> = {
  "anaheim-ducks": "ANA",
  "boston-bruins": "BOS",
  "buffalo-sabres": "BUF",
  "calgary-flames": "CGY",
  "carolina-hurricanes": "CAR",
  "chicago-blackhawks": "CHI",
  "colorado-avalanche": "COL",
  "columbus-blue-jackets": "CBJ",
  "dallas-stars": "DAL",
  "detroit-red-wings": "DET",
  "edmonton-oilers": "EDM",
  "florida-panthers": "FLA",
  "los-angeles-kings": "LAK",
  "minnesota-wild": "MIN",
  "montreal-canadiens": "MTL",
  "nashville-predators": "NSH",
  "new-jersey-devils": "NJD",
  "new-york-islanders": "NYI",
  "new-york-rangers": "NYR",
  "ottawa-senators": "OTT",
  "philadelphia-flyers": "PHI",
  "pittsburgh-penguins": "PIT",
  "san-jose-sharks": "SJS",
  "seattle-kraken": "SEA",
  "st-louis-blues": "STL",
  "tampa-bay-lightning": "TBL",
  "toronto-maple-leafs": "TOR",
  "utah-hockey-club": "UTA",
  "utah-mammoth": "UTA",
  "vancouver-canucks": "VAN",
  "vegas-golden-knights": "VGK",
  "washington-capitals": "WSH",
  "winnipeg-jets": "WPG",
};

const TEAM_ABBR_BY_NAME: Record<string, string> = {
  avalanche: "COL",
  blackhawks: "CHI",
  bluejackets: "CBJ",
  blues: "STL",
  bruins: "BOS",
  canadiens: "MTL",
  canucks: "VAN",
  capitals: "WSH",
  coyotes: "ARI",
  ducks: "ANA",
  flames: "CGY",
  flyers: "PHI",
  goldenknights: "VGK",
  hurricanes: "CAR",
  islanders: "NYI",
  jets: "WPG",
  kings: "LAK",
  kraken: "SEA",
  lightning: "TBL",
  mammoth: "UTA",
  mapleleafs: "TOR",
  oilers: "EDM",
  panthers: "FLA",
  penguins: "PIT",
  predators: "NSH",
  rangers: "NYR",
  redwings: "DET",
  sabres: "BUF",
  senators: "OTT",
  sharks: "SJS",
  stars: "DAL",
  utahhockeyclub: "UTA",
  wild: "MIN",
  devils: "NJD",
};

const SPECIAL_LETTERS: Record<string, string> = {
  æ: "ae",
  đ: "d",
  ð: "d",
  ł: "l",
  ø: "o",
  œ: "oe",
  ß: "ss",
  þ: "th",
};

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

function cleanDisplayText(value: unknown): string {
  return toText(value).normalize("NFC").replace(/\s+/g, " ");
}

function firstPresent(
  row: Record<string, unknown>,
  fields: readonly string[],
): unknown {
  for (const field of fields) {
    const value = row[field];
    if (value === null || value === undefined) continue;
    if (typeof value === "string" && !value.trim()) continue;
    return value;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  const text = toText(value).replace(/[$,\s]/g, "");
  if (!text) return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function normalizeDateOnly(value: unknown): string {
  const text = toText(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (!match) return "";
  const candidate = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${candidate}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === candidate
    ? candidate
    : "";
}

function yearFromSeason(value: unknown): string {
  const match = /^(\d{4})/.exec(toText(value));
  return match?.[1] ?? "";
}

function normalizePosition(value: unknown): string {
  const key = toText(value)
    .toLowerCase()
    .replace(/[^a-z]/g, "");
  return POSITION_MAP[key] ?? "";
}

function getPositionGroup(positions: readonly string[]): "F" | "D" | "G" {
  if (positions.includes("G")) return "G";
  if (positions.includes("D")) return "D";
  return "F";
}

function formatHeight(value: unknown): string {
  const numeric = toNumber(value);
  if (numeric === null || numeric < 48 || numeric > 96) return "";
  const inches = Math.round(numeric);
  return `${Math.floor(inches / 12)}' ${inches % 12}`;
}

function normalizeHandedness(value: unknown): string {
  const normalized = toText(value).toLowerCase();
  if (normalized === "l" || normalized === "left") return "L";
  if (normalized === "r" || normalized === "right") return "R";
  return "";
}

function teamAbbreviation(row: PuckPediaRow): string {
  const explicit = toText(
    firstPresent(row, ["team_abbr", "teamAbbr", "team_abbreviation"]),
  )
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
  if (explicit) return explicit;

  const slug = toText(row.team_url).toLowerCase();
  if (TEAM_ABBR_BY_SLUG[slug]) return TEAM_ABBR_BY_SLUG[slug];

  const nameKey = canonicalName(row.team_name).replace(/\s/g, "");
  return TEAM_ABBR_BY_NAME[nameKey] ?? "";
}

export function canonicalName(value: unknown): string {
  let text = cleanDisplayText(value).toLowerCase();
  text = Array.from(text)
    .map((character) => SPECIAL_LETTERS[character] ?? character)
    .join("");
  const normalized = text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  return normalized.replace(/\b([a-z])\s+(?=[a-z]\b)/g, "$1");
}

function nameTokens(value: unknown): string[] {
  const tokens = canonicalName(value).split(" ").filter(Boolean);
  while (tokens.length > 1 && SUFFIXES.has(tokens[tokens.length - 1] ?? "")) {
    tokens.pop();
  }
  return tokens;
}

function fullNameOf(player: StoredPlayer): string {
  return (
    cleanDisplayText(player.fullName) ||
    cleanDisplayText(`${toText(player.firstName)} ${toText(player.lastName)}`)
  );
}

function firstAndLast(value: unknown): { first: string; last: string } {
  const tokens = nameTokens(value);
  return {
    first: tokens[0] ?? "",
    last: tokens[tokens.length - 1] ?? "",
  };
}

function buildAliasMap(): ReadonlyMap<string, ReadonlySet<string>> {
  const output = new Map<string, ReadonlySet<string>>();
  for (const family of FIRST_NAME_ALIAS_FAMILIES) {
    const normalized = new Set(family.map(canonicalName).filter(Boolean));
    for (const name of normalized) {
      output.set(name, normalized);
    }
  }
  return output;
}

const FIRST_NAME_ALIASES = buildAliasMap();

function firstNamesCompatible(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const leftAliases = FIRST_NAME_ALIASES.get(left);
  const rightAliases = FIRST_NAME_ALIASES.get(right);
  if (leftAliases?.has(right) || rightAliases?.has(left)) return true;
  return (
    left.charAt(0) === right.charAt(0) &&
    Math.min(left.length, right.length) >= 3 &&
    (left.startsWith(right) || right.startsWith(left))
  );
}

function normalizeStoredPositions(value: unknown): string[] {
  const values = Array.isArray(value) ? value : toText(value).split(/[,/|]/);
  return Array.from(new Set(values.map(normalizePosition).filter(Boolean)));
}

function storedPositionGroup(player: StoredPlayer): "F" | "D" | "G" {
  const group = toText(player.posGroup).toUpperCase();
  if (group === "G" || group === "D" || group === "F") return group;
  return getPositionGroup(normalizeStoredPositions(player.nhlPos));
}

function positionsCompatible(
  player: StoredPlayer,
  source: DirectoryPlayer,
): boolean {
  const positions = normalizeStoredPositions(player.nhlPos);
  if (positions.length > 0) {
    if (positions.some((position) => source.positions.includes(position))) {
      return true;
    }
    return storedPositionGroup(player) === source.posGroup;
  }
  const group = toText(player.posGroup);
  return !group || storedPositionGroup(player) === source.posGroup;
}

function birthdayCompatible(
  player: StoredPlayer,
  source: DirectoryPlayer,
): boolean {
  const existing = normalizeDateOnly(player.birthday);
  return !existing || !source.birthDate || existing === source.birthDate;
}

function storedTeams(value: unknown): string[] {
  const values = Array.isArray(value) ? value : toText(value).split(/[,/|]/);
  return values.map((entry) => toText(entry).toUpperCase()).filter(Boolean);
}

function hasSameTeam(player: StoredPlayer, source: DirectoryPlayer): boolean {
  return Boolean(
    source.teamAbbr && storedTeams(player.nhlTeam).includes(source.teamAbbr),
  );
}

function selectUniqueCandidate(
  candidates: StoredPlayer[],
  source: DirectoryPlayer,
): StoredPlayer | null {
  const unique = Array.from(
    new Map(candidates.map((candidate) => [candidate.id, candidate])).values(),
  );
  if (unique.length === 1) return unique[0] ?? null;

  if (source.birthDate) {
    const sameBirthDate = unique.filter(
      (candidate) => normalizeDateOnly(candidate.birthday) === source.birthDate,
    );
    if (sameBirthDate.length === 1) return sameBirthDate[0] ?? null;
    if (sameBirthDate.length > 1) {
      const sameTeam = sameBirthDate.filter((candidate) =>
        hasSameTeam(candidate, source),
      );
      if (sameTeam.length === 1) return sameTeam[0] ?? null;
      return null;
    }
  }

  const sameTeam = unique.filter((candidate) => hasSameTeam(candidate, source));
  return sameTeam.length === 1 ? (sameTeam[0] ?? null) : null;
}

function levenshtein(left: string, right: string): number {
  if (left === right) return 0;
  if (!left) return right.length;
  if (!right) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex++) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex++) {
      const substitution =
        previous[rightIndex - 1]! +
        (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex]! + 1,
        current[rightIndex - 1]! + 1,
        substitution,
      );
    }
    previous = current;
  }
  return previous[right.length] ?? Math.max(left.length, right.length);
}

function nameSimilarity(left: unknown, right: unknown): number {
  const a = canonicalName(left).replace(/\s/g, "");
  const b = canonicalName(right).replace(/\s/g, "");
  const length = Math.max(a.length, b.length);
  return length === 0 ? 0 : 1 - levenshtein(a, b) / length;
}

function buildInsertReview(
  existingPlayers: readonly StoredPlayer[],
  source: DirectoryPlayer,
): PlayerInsertReview {
  const sourceName = firstAndLast(source.fullName);
  const candidates = existingPlayers
    .map((player) => {
      const fullName = fullNameOf(player);
      const candidateName = firstAndLast(fullName);
      const similarity = nameSimilarity(fullName, source.fullName);
      const signals: string[] = [];
      let score = similarity * 30;

      if (
        toText(player.nhlApiId) &&
        toText(player.nhlApiId) === source.nhlApiId
      ) {
        signals.push("sameNhlApiId");
        score += 200;
      }
      if (
        canonicalName(fullName) &&
        canonicalName(fullName) === canonicalName(source.fullName)
      ) {
        signals.push("sameCanonicalName");
        score += 100;
      }
      if (
        source.birthDate &&
        normalizeDateOnly(player.birthday) === source.birthDate
      ) {
        signals.push("sameBirthDate");
        score += 80;
      }
      if (candidateName.last && candidateName.last === sourceName.last) {
        signals.push("sameLastName");
        score += 35;
      }
      if (firstNamesCompatible(candidateName.first, sourceName.first)) {
        signals.push("compatibleFirstName");
        score += 25;
      }
      if (positionsCompatible(player, source)) {
        signals.push("compatiblePosition");
        score += 10;
      }
      if (hasSameTeam(player, source)) {
        signals.push("sameNhlTeam");
        score += 10;
      }

      return {
        score,
        plausible:
          signals.some((signal) =>
            [
              "sameNhlApiId",
              "sameCanonicalName",
              "sameBirthDate",
              "sameLastName",
            ].includes(signal),
          ) || similarity >= 0.72,
        review: {
          id: player.id,
          legacyId: toText(player.legacyId),
          nhlApiId: toText(player.nhlApiId),
          fullName,
          birthday: normalizeDateOnly(player.birthday),
          positions: normalizeStoredPositions(player.nhlPos),
          teams: storedTeams(player.nhlTeam),
          ownerId: toText(player.ownerId),
          isActive: player.isActive === true,
          nameSimilarity: Math.round(similarity * 1000) / 1000,
          signals,
        } satisfies PlayerReviewCandidate,
      };
    })
    .filter((candidate) => candidate.plausible)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.review.fullName.localeCompare(right.review.fullName),
    )
    .slice(0, 5)
    .map((candidate) => candidate.review);

  return {
    sourceId: source.sourceId,
    nhlApiId: source.nhlApiId,
    fullName: source.fullName,
    birthDate: source.birthDate,
    positions: source.positions,
    team: source.teamAbbr,
    closestExistingPlayers: candidates,
  };
}

function buildUnmatchedActiveReview(
  player: StoredPlayer,
): UnmatchedActivePlayerReview {
  return {
    id: player.id,
    legacyId: toText(player.legacyId),
    nhlApiId: toText(player.nhlApiId),
    fullName: fullNameOf(player),
    birthday: normalizeDateOnly(player.birthday),
    positions: normalizeStoredPositions(player.nhlPos),
    teams: storedTeams(player.nhlTeam),
    ownerId: toText(player.ownerId),
    isSignable: player.isSignable === true,
    isResignable: toText(player.isResignable),
  };
}

function valuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) || Array.isArray(right)) {
    return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
  }
  if (left === null || left === undefined || left === "") {
    return right === null || right === undefined || right === "";
  }
  return String(left) === String(right);
}

function calculateAge(birthDate: string, currentDate: Date): number | null {
  if (!birthDate) return null;
  const birth = new Date(`${birthDate}T00:00:00Z`);
  if (Number.isNaN(birth.getTime())) return null;
  let age = currentDate.getUTCFullYear() - birth.getUTCFullYear();
  const hasHadBirthday =
    currentDate.getUTCMonth() > birth.getUTCMonth() ||
    (currentDate.getUTCMonth() === birth.getUTCMonth() &&
      currentDate.getUTCDate() >= birth.getUTCDate());
  if (!hasHadBirthday) age -= 1;
  return age >= 0 ? age : null;
}

function sourcePatch(
  source: DirectoryPlayer,
  currentDate: Date,
): Record<string, unknown> {
  const age = calculateAge(source.birthDate, currentDate);
  const output: Record<string, unknown> = {
    nhlApiId: source.nhlApiId,
    firstName: source.firstName,
    lastName: source.lastName,
    fullName: source.fullName,
    nhlPos: source.positions,
    posGroup: source.posGroup,
    nhlTeam: source.teamAbbr ? [source.teamAbbr] : [],
    isActive: true,
    jerseyNum: source.jerseyNum,
    birthday: source.birthDate || null,
    age,
    country: source.country || null,
    handedness: source.handedness || null,
    weight: source.weight,
    height: source.height || null,
    nhlContractStatus: source.contractStatus || null,
    nhlContractLength:
      source.contractLength === null ? null : String(source.contractLength),
    nhlSalary: source.salary,
    nhlCapHit: source.capHit,
    nhlClauses: source.clauses || null,
    nhlStartYear: source.contractStartYear || null,
    nhlSigningDate: source.signingDate || null,
    nhlSigningAgent: source.signingAgent || null,
    nhlSigningGm: source.signingGm || null,
    nhlSigningStatus: source.signingStatus || null,
    nhlExpiryYear: source.expiryYear || null,
    nhlExpiryStatus: source.expiryStatus || null,
  };

  return output;
}

function missingFromPuckPediaPatch(): Record<string, unknown> {
  return {
    nhlTeam: [],
    jerseyNum: null,
    nhlContractStatus: null,
    nhlContractLength: null,
    nhlSalary: null,
    nhlCapHit: null,
    nhlClauses: null,
    nhlStartYear: null,
    nhlSigningDate: null,
    nhlSigningAgent: null,
    nhlSigningGm: null,
    nhlSigningStatus: null,
    nhlExpiryYear: null,
    nhlExpiryStatus: null,
  };
}

function changedPatch(
  existing: StoredPlayer,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(patch).filter(
      ([field, value]) => !valuesEqual(existing[field], value),
    ),
  );
}

function nextLegacyId(players: readonly StoredPlayer[]): number {
  return (
    players.reduce((maximum, player) => {
      const numeric = Number(player.legacyId);
      return Number.isInteger(numeric) && numeric > maximum ? numeric : maximum;
    }, 0) + 1
  );
}

export function mapPuckPediaPlayer(row: PuckPediaRow): DirectoryPlayer | null {
  const firstName = cleanDisplayText(firstPresent(row, ["p_fn", "first_name"]));
  const lastName = cleanDisplayText(firstPresent(row, ["p_ln", "last_name"]));
  const nhlApiId = toText(firstPresent(row, ["nhl_id", "nhlApiId"]));
  const sourceId = toText(firstPresent(row, ["p_id", "player_id", "nhl_id"]));
  const position = normalizePosition(firstPresent(row, ["pos", "position"]));
  if (!firstName || !lastName || !nhlApiId || !sourceId || !position) {
    return null;
  }

  const positions = [position];
  return {
    sourceId,
    nhlApiId,
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    birthDate: normalizeDateOnly(
      firstPresent(row, ["birthdate", "birthday", "birth_date", "dob"]),
    ),
    country: toText(row.country).toUpperCase(),
    handedness: normalizeHandedness(
      firstPresent(row, ["shot", "shoots_catches", "shootsCatches"]),
    ),
    jerseyNum: toNumber(firstPresent(row, ["jersey", "jersey_number"])),
    weight: toNumber(firstPresent(row, ["wt", "weight"])),
    height: formatHeight(firstPresent(row, ["ht", "height"])),
    positions,
    posGroup: getPositionGroup(positions),
    teamAbbr: teamAbbreviation(row),
    contractStatus: toText(firstPresent(row, ["ctype", "status"])),
    contractLength: toNumber(firstPresent(row, ["len", "length"])),
    salary: toNumber(firstPresent(row, ["sal_t", "salary", "nhl_salary"])),
    capHit: toNumber(firstPresent(row, ["cap_hit", "capHit"])),
    clauses: toText(row.clauses),
    contractStartYear: yearFromSeason(
      firstPresent(row, ["start", "start_year"]),
    ),
    signingDate: normalizeDateOnly(
      firstPresent(row, ["sign_date", "signing_date"]),
    ),
    signingAgent: cleanDisplayText(
      `${toText(firstPresent(row, ["a_sign_fn", "signing_agent_first_name"]))} ${toText(firstPresent(row, ["a_sign_ln", "signing_agent_last_name"]))}`,
    ),
    signingGm: cleanDisplayText(
      `${toText(firstPresent(row, ["gm_sign_fn", "signing_gm_first_name"]))} ${toText(firstPresent(row, ["gm_sign_ln", "signing_gm_last_name"]))}`,
    ),
    signingStatus: toText(firstPresent(row, ["sts_sign", "signing_status"])),
    expiryYear: yearFromSeason(firstPresent(row, ["exp", "expiry_year"])),
    expiryStatus: toText(firstPresent(row, ["sts_exp", "expiry_status"])),
  };
}

export function reconcilePlayerDirectory(
  existingPlayers: readonly StoredPlayer[],
  rawSourcePlayers: readonly DirectoryPlayer[],
  options: {
    currentDate: Date;
    deactivateMissing: boolean;
    activityEvidenceByPlayerId?: ReadonlyMap<string, PlayerActivityEvidence>;
  },
): PlayerReconciliation {
  const issues: ReconciliationIssue[] = [];
  const sourcePlayers: DirectoryPlayer[] = [];
  const sourceByNhlApiId = new Map<string, DirectoryPlayer>();
  let duplicateSourceRows = 0;

  for (const source of rawSourcePlayers) {
    const existingSource = sourceByNhlApiId.get(source.nhlApiId);
    if (!existingSource) {
      sourceByNhlApiId.set(source.nhlApiId, source);
      sourcePlayers.push(source);
      continue;
    }
    duplicateSourceRows += 1;
    if (
      canonicalName(existingSource.fullName) !== canonicalName(source.fullName)
    ) {
      issues.push({
        sourceId: source.sourceId,
        nhlApiId: source.nhlApiId,
        fullName: source.fullName,
        candidateIds: [],
        reason: "sourceIdentityCollision",
      });
    }
  }

  const byNhlApiId = new Map<string, StoredPlayer[]>();
  const byExactName = new Map<string, StoredPlayer[]>();
  const byLastName = new Map<string, StoredPlayer[]>();
  for (const player of existingPlayers) {
    const nhlApiId = toText(player.nhlApiId);
    if (nhlApiId) {
      byNhlApiId.set(nhlApiId, [...(byNhlApiId.get(nhlApiId) ?? []), player]);
    }

    const fullName = fullNameOf(player);
    const exactName = canonicalName(fullName);
    if (exactName) {
      byExactName.set(exactName, [
        ...(byExactName.get(exactName) ?? []),
        player,
      ]);
    }
    const { last } = firstAndLast(fullName);
    if (last) {
      byLastName.set(last, [...(byLastName.get(last) ?? []), player]);
    }
  }

  const updates: PlayerUpdate[] = [];
  const inserts: PlayerInsert[] = [];
  const insertReviews: PlayerInsertReview[] = [];
  const matchedExistingIds = new Set<string>();
  const protectedExistingIds = new Set<string>();
  let legacyId = nextLegacyId(existingPlayers);
  let unchanged = 0;

  for (const source of sourcePlayers) {
    let reason: PlayerUpdate["reason"] = "nhlApiId";
    let candidates = byNhlApiId.get(source.nhlApiId) ?? [];
    let match: StoredPlayer | null = null;

    if (candidates.length > 1) {
      candidates.forEach((candidate) => protectedExistingIds.add(candidate.id));
      issues.push({
        sourceId: source.sourceId,
        nhlApiId: source.nhlApiId,
        fullName: source.fullName,
        candidateIds: candidates.map((candidate) => candidate.id),
        reason: "ambiguousNhlApiId",
      });
      continue;
    }
    if (candidates.length === 1) {
      match = candidates[0] ?? null;
    }

    if (!match) {
      reason = "exactName";
      candidates = (
        byExactName.get(canonicalName(source.fullName)) ?? []
      ).filter(
        (candidate) =>
          positionsCompatible(candidate, source) &&
          birthdayCompatible(candidate, source),
      );
      match = selectUniqueCandidate(candidates, source);
    }

    if (!match) {
      reason = "aliasName";
      const sourceName = firstAndLast(source.fullName);
      candidates = (byLastName.get(sourceName.last) ?? []).filter(
        (candidate) => {
          const candidateName = firstAndLast(fullNameOf(candidate));
          return (
            firstNamesCompatible(candidateName.first, sourceName.first) &&
            positionsCompatible(candidate, source) &&
            birthdayCompatible(candidate, source)
          );
        },
      );
      match = selectUniqueCandidate(candidates, source);
    }

    if (!match && source.birthDate) {
      reason = "birthDate";
      candidates = existingPlayers.filter((candidate) => {
        if (
          normalizeDateOnly(candidate.birthday) !== source.birthDate ||
          !positionsCompatible(candidate, source)
        ) {
          return false;
        }
        const candidateName = firstAndLast(fullNameOf(candidate));
        const sourceName = firstAndLast(source.fullName);
        return (
          candidateName.last === sourceName.last ||
          nameSimilarity(fullNameOf(candidate), source.fullName) >= 0.84
        );
      });
      match = selectUniqueCandidate(candidates, source);
    }

    if (!match && candidates.length > 1) {
      candidates.forEach((candidate) => protectedExistingIds.add(candidate.id));
      issues.push({
        sourceId: source.sourceId,
        nhlApiId: source.nhlApiId,
        fullName: source.fullName,
        candidateIds: candidates.map((candidate) => candidate.id),
        reason: "ambiguousName",
      });
      continue;
    }

    if (match) {
      const existingNhlApiId = toText(match.nhlApiId);
      if (existingNhlApiId && existingNhlApiId !== source.nhlApiId) {
        protectedExistingIds.add(match.id);
        issues.push({
          sourceId: source.sourceId,
          nhlApiId: source.nhlApiId,
          fullName: source.fullName,
          candidateIds: [match.id],
          reason: "existingNhlApiIdConflict",
        });
        continue;
      }
      if (matchedExistingIds.has(match.id)) {
        protectedExistingIds.add(match.id);
        issues.push({
          sourceId: source.sourceId,
          nhlApiId: source.nhlApiId,
          fullName: source.fullName,
          candidateIds: [match.id],
          reason: "sourceIdentityCollision",
        });
        continue;
      }

      matchedExistingIds.add(match.id);
      const patch = sourcePatch(source, options.currentDate);
      const changed = changedPatch(match, patch);
      if (Object.keys(changed).length === 0) {
        unchanged += 1;
      } else {
        updates.push({ id: match.id, data: changed, reason });
      }
      continue;
    }

    const patch = sourcePatch(source, options.currentDate);
    insertReviews.push(buildInsertReview(existingPlayers, source));
    inserts.push({
      legacyId: String(legacyId++),
      nhlApiId: source.nhlApiId,
      firstName: source.firstName,
      lastName: source.lastName,
      fullName: source.fullName,
      isSignable: false,
      isResignable: "DRAFT",
      ...patch,
    });
  }

  const missingSourceRows = existingPlayers.filter(
    (player) =>
      !matchedExistingIds.has(player.id) &&
      !protectedExistingIds.has(player.id),
  );
  const unmatchedActiveRows = missingSourceRows.filter(
    (player) => player.isActive === true,
  );
  const unmatchedActivePlayers = unmatchedActiveRows
    .map(buildUnmatchedActiveReview)
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
  const deactivationReviews = unmatchedActiveRows
    .map((player): PlayerDeactivationReview => {
      const review = buildUnmatchedActiveReview(player);
      const evidence = options.activityEvidenceByPlayerId?.get(player.id);
      const fallbackEvidence: PlayerActivityEvidence = {
        evidenceComplete: false,
        currentSeasonId: "",
        currentSeasonYear: null,
        currentSeasonGames: 0,
        previousSeasonId: "",
        previousSeasonYear: null,
        previousSeasonGames: 0,
      };
      const resolvedEvidence = evidence ?? fallbackEvidence;
      const decision: PlayerDeactivationReview["decision"] =
        !resolvedEvidence.evidenceComplete
          ? "keepIncompleteEvidence"
          : resolvedEvidence.currentSeasonGames > 0
            ? "keepCurrentSeasonGames"
            : resolvedEvidence.previousSeasonGames > 0
              ? "keepPreviousSeasonGames"
              : "deactivate";
      return { ...review, ...resolvedEvidence, decision };
    })
    .sort((left, right) => left.fullName.localeCompare(right.fullName));
  const deactivationIds = new Set(
    deactivationReviews
      .filter((review) => review.decision === "deactivate")
      .map((review) => review.id),
  );
  const deactivations = options.deactivateMissing
    ? unmatchedActiveRows
        .filter((player) => deactivationIds.has(player.id))
        .map((player) => ({
          id: player.id,
          data: { isActive: false as const },
        }))
    : [];
  for (const player of missingSourceRows) {
    const patch = missingFromPuckPediaPatch();
    if (options.deactivateMissing && deactivationIds.has(player.id)) {
      patch.isActive = false;
    }
    const changed = changedPatch(player, patch);
    if (Object.keys(changed).length > 0) {
      updates.push({
        id: player.id,
        data: changed,
        reason: "missingFromPuckPedia",
      });
    }
  }

  return {
    updates,
    inserts,
    insertReviews,
    unmatchedActivePlayers,
    deactivationReviews,
    deactivations,
    issues,
    duplicateSourceRows,
    unchanged,
  };
}
