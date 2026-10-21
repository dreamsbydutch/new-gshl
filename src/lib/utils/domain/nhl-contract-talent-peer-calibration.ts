import type { NhlTalentForecastProfile } from "../../types/nhl-contract-talent-forecast";
import type {
  NhlTalentPeerCalibration,
  NhlTalentPeerCalibrationFit,
  NhlTalentPeerCalibrationRow,
} from "../../types/nhl-contract-talent-peer-calibration";

const GROUPS = [
  "young:high",
  "young:low",
  "prime:high",
  "prime:low",
  "older:high",
  "older:low",
];
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const integer = (x: unknown, min = 0): x is number =>
  Number.isSafeInteger(x) && Number(x) >= min;
const weight = (cross: number, square: number) =>
  Math.max(0, Math.min(1, -cross / (square + 100)));
function usable(p: NhlTalentForecastProfile) {
  if (
    !integer(p.nhlPlayerId, 1) ||
    !integer(p.originYear, 1900) ||
    p.features.length !== 15 ||
    Array.from(p.features).some(
      (v, i) => !Object.hasOwn(p.features, i) || !finite(v),
    )
  )
    throw Error("Invalid NHL peer calibration profile");
  return (
    p.features[8] === 1 &&
    p.features[9] === 1 &&
    p.features[11] === 1 &&
    p.features[6]! > 0
  );
}

/** Origin-only cohort label. This is not a classification by eventual career success. */
export function classifyNhlTalentPeerGroup(
  profile: NhlTalentForecastProfile,
  sameOriginRoleProfiles: readonly NhlTalentForecastProfile[],
): string | null {
  if (!usable(profile)) return null;
  const values: number[] = [],
    ids = new Set<number>();
  const age = profile.features[6]!;
  for (const p of sameOriginRoleProfiles) {
    if (
      p.nhlPlayerId === profile.nhlPlayerId ||
      p.position !== profile.position ||
      p.originYear !== profile.originYear ||
      !usable(p) ||
      Math.abs(p.features[6]! - age) > 2
    )
      continue;
    if (ids.has(p.nhlPlayerId))
      throw Error("Duplicate NHL calibration cohort player");
    ids.add(p.nhlPlayerId);
    values.push(p.features[0]!);
  }
  if (values.length < 10) return null;
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median =
    values.length % 2
      ? values[middle]!
      : (values[middle - 1]! + values[middle]!) / 2;
  const phase = age <= 23 ? "young" : age >= 30 ? "older" : "prime";
  return `${phase}:${profile.features[0]! >= median ? "high" : "low"}`;
}

function fit(
  rows: readonly NhlTalentPeerCalibrationRow[],
): NhlTalentPeerCalibrationFit {
  let crossProduct = 0,
    sumSquaredDifference = 0;
  const origins = new Set<number>(),
    players = new Set<number>();
  for (const r of rows) {
    const difference = r.peerPrediction - r.positionPrediction;
    crossProduct += (r.positionPrediction - r.target) * difference;
    sumSquaredDifference += difference * difference;
    origins.add(r.originYear);
    players.add(r.nhlPlayerId);
  }
  if (!finite(crossProduct) || !finite(sumSquaredDifference))
    throw Error("NHL peer calibration overflow");
  const supported =
    rows.length >= 100 && origins.size >= 2 && players.size >= 20;
  return {
    weight: supported ? weight(crossProduct, sumSquaredDifference) : 0,
    rows: rows.length,
    origins: origins.size,
    players: players.size,
    crossProduct,
    sumSquaredDifference,
    ridge: 100,
    supported,
  };
}

/** Caller supplies genuinely out-of-fold predictions fitted at each historical origin.
 * A cutoff filter cannot repair predictions that were themselves trained on future data.
 * Overlapping horizons and repeated players are not independent observations. */
export function fitNhlTalentPeerCalibration(
  rows: readonly NhlTalentPeerCalibrationRow[],
  knownThrough: number,
): NhlTalentPeerCalibration {
  if (!integer(knownThrough, 1900) || knownThrough > 2200)
    throw Error("Invalid NHL calibration cutoff");
  const selected: NhlTalentPeerCalibrationRow[] = [],
    seen = new Set<string>();
  for (const r of rows) {
    if (
      !integer(r.nhlPlayerId, 1) ||
      !integer(r.originYear, 1900) ||
      !integer(r.targetYear, 1900) ||
      !integer(r.horizon, 1) ||
      r.targetYear !== r.originYear + r.horizon ||
      (r.group !== null && !GROUPS.includes(r.group)) ||
      !finite(r.target) ||
      !finite(r.positionPrediction) ||
      !finite(r.peerPrediction)
    )
      throw Error("Invalid NHL peer calibration row");
    if (
      r.horizon < 2 ||
      r.horizon > 5 ||
      r.originYear >= knownThrough ||
      r.targetYear > knownThrough
    )
      continue;
    const key = `${r.nhlPlayerId}:${r.originYear}:${r.horizon}`;
    if (seen.has(key)) throw Error("Duplicate NHL peer calibration outcome");
    seen.add(key);
    selected.push(r);
  }
  return {
    version: "nhl-talent-peer-calibration-v1",
    throughYear: knownThrough,
    overall: fit(selected),
    groups: Object.fromEntries(
      GROUPS.map((group) => [
        group,
        fit(selected.filter((r) => r.group === group)),
      ]),
    ),
  };
}

export function peerCalibrationWeight(
  model: NhlTalentPeerCalibration,
  group: string | null,
): number {
  return group !== null &&
    Object.hasOwn(model.groups, group) &&
    model.groups[group]!.supported
    ? model.groups[group]!.weight
    : model.overall.supported
      ? model.overall.weight
      : 0;
}

export function validateNhlTalentPeerCalibration(
  value: unknown,
): asserts value is NhlTalentPeerCalibration {
  function fail(): never {
    throw Error("Invalid NHL peer calibration model");
  }
  const object = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x);
  function keys(x: Record<string, unknown>, names: readonly string[]) {
    if (
      Object.keys(x).length !== names.length ||
      names.some((k) => !Object.hasOwn(x, k))
    )
      fail();
  }
  function check(x: unknown): asserts x is NhlTalentPeerCalibrationFit {
    if (!object(x)) fail();
    keys(x, [
      "weight",
      "rows",
      "origins",
      "players",
      "crossProduct",
      "sumSquaredDifference",
      "ridge",
      "supported",
    ]);
    if (
      !integer(x.rows) ||
      !integer(x.origins) ||
      !integer(x.players) ||
      x.origins > x.rows ||
      x.players > x.rows ||
      (x.rows === 0 && (x.origins !== 0 || x.players !== 0)) ||
      (x.rows > 0 && (x.origins === 0 || x.players === 0)) ||
      !finite(x.crossProduct) ||
      !finite(x.sumSquaredDifference) ||
      x.sumSquaredDifference < 0 ||
      x.ridge !== 100 ||
      x.supported !== (x.rows >= 100 && x.origins >= 2 && x.players >= 20) ||
      x.weight !==
        (x.supported ? weight(x.crossProduct, x.sumSquaredDifference) : 0) ||
      (x.sumSquaredDifference === 0 && x.crossProduct !== 0)
    )
      fail();
  }
  if (!object(value)) fail();
  keys(value, ["version", "throughYear", "overall", "groups"]);
  if (
    value.version !== "nhl-talent-peer-calibration-v1" ||
    !integer(value.throughYear, 1900) ||
    value.throughYear > 2200
  )
    fail();
  check(value.overall);
  if (!object(value.groups)) fail();
  keys(value.groups, GROUPS);
  let rows = 0;
  for (const group of GROUPS) {
    const fitted = value.groups[group];
    check(fitted);
    if (
      fitted.rows > value.overall.rows ||
      fitted.origins > value.overall.origins ||
      fitted.players > value.overall.players ||
      fitted.sumSquaredDifference >
        value.overall.sumSquaredDifference +
          1e-8 * Math.max(1, value.overall.sumSquaredDifference)
    )
      fail();
    rows += fitted.rows;
  }
  if (rows > value.overall.rows) fail();
}
