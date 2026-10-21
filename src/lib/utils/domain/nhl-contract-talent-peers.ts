import type {
  NhlTalentAnnualPlayer,
  NhlTalentAnnualSeason,
  NhlTalentForecastProfile,
  NhlTalentPosition,
} from "../../types/nhl-contract-talent-forecast";
import type { NhlTalentPeerAging } from "../../types/nhl-contract-talent-peers";

const VERSION = "nhl-talent-peer-aging-v1";
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const integer = (x: unknown, min = 0): x is number =>
  Number.isSafeInteger(x) && Number(x) >= min;
type Cohort = NhlTalentAnnualSeason & {
  byId: Map<number, NhlTalentAnnualPlayer>;
};
type Candidate = {
  profile: NhlTalentForecastProfile;
  distance: number;
  weight: number;
};
type Pair = { age: number; delta: number; share: number };
type Episode = { steps: number; pairs: Pair[] };
function standardDeviation(values: number[], floor: number) {
  if (!values.length) return floor;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return Math.max(
    floor,
    Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length),
  );
}
function usable(profile: NhlTalentForecastProfile) {
  if (
    !integer(profile.nhlPlayerId, 1) ||
    !integer(profile.originYear, 1900) ||
    profile.features.length !== 15 ||
    Array.from(profile.features).some(
      (v, i) => !Object.hasOwn(profile.features, i) || !finite(v),
    )
  )
    throw Error("Invalid peer NHL origin profile");
  return (
    profile.features[8] === 1 &&
    profile.features[9] === 1 &&
    profile.features[11] === 1 &&
    profile.features[6]! > 0
  );
}
const near = (a: number, b: number) =>
  Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));
function checkOrigin(
  profile: NhlTalentForecastProfile,
  cohorts: Map<number, Cohort>,
) {
  const season = cohorts.get(profile.originYear),
    p = season?.byId.get(profile.nhlPlayerId);
  if (
    !season ||
    p?.position !== profile.position ||
    p.age === null ||
    p.goalsAboveReplacement === null
  )
    throw Error("Peer profile has no matching measured origin source");
  const x = profile.features;
  if (
    !near(x[0]!, (p.goalsAboveReplacement * 82) / season.teamGames) ||
    !near(x[2]!, (p.minutes * 82) / season.teamGames) ||
    !near(x[4]!, p.games / season.teamGames) ||
    x[6] !== p.age
  )
    throw Error("Peer origin features differ from known source");
  const previous = cohorts.get(profile.originYear - 1),
    q = previous?.byId.get(profile.nhlPlayerId);
  const previousValue = !previous
    ? null
    : !q
      ? 0
      : q.goalsAboveReplacement === null
        ? null
        : (q.goalsAboveReplacement * 82) / previous.teamGames;
  if (
    x[10] !== Number(previousValue !== null) ||
    x[12] !== Number(!!q) ||
    !near(x[1]!, previousValue ?? 0) ||
    !near(x[3]!, q && previous ? (q.minutes * 82) / previous.teamGames : 0) ||
    !near(x[5]!, q && previous ? q.games / previous.teamGames : 0)
  )
    throw Error("Peer history features differ from known source");
}

/** Construct once per role/origin. Peers are selected from origin histories,
 * never by whether they subsequently prospered, remained in the NHL or had
 * supported GAR. Missing follow-up reduces evidence; it never selects a replacement peer.
 * The resulting curve is still conditional on measured returners. Exits must
 * remain in the separate full-cohort participation model. */
export function createNhlTalentPeerFitter(
  seasons: readonly NhlTalentAnnualSeason[],
  historicalProfiles: readonly NhlTalentForecastProfile[],
  position: NhlTalentPosition,
): (query: NhlTalentForecastProfile) => NhlTalentPeerAging | null {
  if (!["F", "D", "G"].includes(position))
    throw Error("Known peer NHL role required");
  const cohorts = new Map<number, Cohort>();
  for (const season of seasons) {
    if (
      !integer(season.year, 1900) ||
      season.year > 2200 ||
      typeof season.seasonComplete !== "boolean" ||
      typeof season.officialCohortComplete !== "boolean"
    )
      throw Error("Invalid peer NHL cohort");
    if (!season.seasonComplete || !season.officialCohortComplete) continue;
    if (
      cohorts.has(season.year) ||
      !finite(season.teamGames) ||
      season.teamGames <= 0 ||
      season.modelVersion !== "nhl-hockey-overall-reviewed-v1"
    )
      throw Error("Duplicate or incompatible peer NHL cohort");
    const byId = new Map<number, NhlTalentAnnualPlayer>();
    for (const p of season.players) {
      if (
        !integer(p.nhlPlayerId, 1) ||
        byId.has(p.nhlPlayerId) ||
        !integer(p.games, 1) ||
        !finite(p.minutes) ||
        p.minutes < 0 ||
        !["F", "D", "G"].includes(p.position) ||
        (p.age !== null && (!finite(p.age) || p.age <= 0 || p.age > 100)) ||
        (p.goalsAboveReplacement !== null && !finite(p.goalsAboveReplacement))
      )
        throw Error("Invalid official peer player cohort");
      byId.set(p.nhlPlayerId, p);
    }
    cohorts.set(season.year, { ...season, byId });
  }
  const years = [...cohorts.keys()].sort((a, b) => a - b),
    throughYear = years.at(-1);
  if (throughYear === undefined) return () => null;
  const seen = new Set<string>();
  const candidates = historicalProfiles.filter((p) => {
    if (
      p.position !== position ||
      p.originYear >= throughYear ||
      !cohorts.has(p.originYear) ||
      !cohorts.has(p.originYear + 1)
    )
      return false;
    const key = `${p.nhlPlayerId}:${p.originYear}`;
    if (seen.has(key)) throw Error("Duplicate peer player/origin episode");
    seen.add(key);
    if (!usable(p)) return false;
    checkOrigin(p, cohorts);
    return true;
  });
  const garScale = standardDeviation(
    candidates.map((p) => p.features[0]!),
    2,
  );
  const changeScale = standardDeviation(
    candidates
      .filter((p) => p.features[10] === 1)
      .map((p) => p.features[0]! - p.features[1]!),
    2,
  );
  const minutesScale = standardDeviation(
    candidates.map((p) => p.features[2]!),
    200,
  );
  const ageIndex = new Map<number, NhlTalentForecastProfile[]>();
  for (const profile of candidates) {
    const bucket = Math.floor(profile.features[6]!);
    const group = ageIndex.get(bucket) ?? [];
    group.push(profile);
    ageIndex.set(bucket, group);
  }
  const episodes = new Map<string, Episode>();
  function episode(profile: NhlTalentForecastProfile): Episode {
    const key = `${profile.nhlPlayerId}:${profile.originYear}`,
      saved = episodes.get(key);
    if (saved) return saved;
    const pairs: Pair[] = [];
    let steps = 0;
    // The one-year forecast already handles the matched-origin transition,
    // including regression after a temporary spike. Estimate subsequent aging only.
    for (let y = profile.originYear + 1; y < throughYear!; y++) {
      const current = cohorts.get(y),
        next = cohorts.get(y + 1);
      if (!current || !next) continue;
      steps++;
      const p = current.byId.get(profile.nhlPlayerId),
        q = next.byId.get(profile.nhlPlayerId);
      if (
        !p ||
        !q ||
        p.position !== position ||
        q.position !== position ||
        p.goalsAboveReplacement === null ||
        q.goalsAboveReplacement === null ||
        p.age === null ||
        q.age === null ||
        Math.abs(q.age - p.age - 1) > 1e-6
      )
        continue;
      pairs.push({
        age: (p.age + q.age) / 2,
        delta:
          (q.goalsAboveReplacement * 82) / next.teamGames -
          (p.goalsAboveReplacement * 82) / current.teamGames,
        share: Math.min(p.games / current.teamGames, q.games / next.teamGames),
      });
    }
    const result = { steps, pairs };
    episodes.set(key, result);
    return result;
  }
  function distance(a: NhlTalentForecastProfile, b: NhlTalentForecastProfile) {
    const x = a.features,
      y = b.features;
    let d =
      ((x[6]! - y[6]!) / 2) ** 2 +
      ((x[0]! - y[0]!) / garScale) ** 2 +
      ((x[2]! - y[2]!) / minutesScale) ** 2 +
      ((x[4]! - y[4]!) / 0.25) ** 2;
    if (x[10] === 1 && y[10] === 1)
      d +=
        ((x[1]! - y[1]!) / garScale) ** 2 +
        ((x[0]! - x[1]! - (y[0]! - y[1]!)) / changeScale) ** 2 +
        ((x[3]! - y[3]!) / minutesScale) ** 2 +
        ((x[5]! - y[5]!) / 0.25) ** 2;
    return (
      d +
      (x[10]! - y[10]!) ** 2 +
      (x[12]! - y[12]!) ** 2 +
      ((x[14]! - y[14]!) / 2) ** 2
    );
  }
  return (query) => {
    if (query.position !== position || query.originYear !== throughYear)
      throw Error("Peer query must match fitted role and known-through origin");
    if (!usable(query)) return null;
    checkOrigin(query, cohorts);
    const best = new Map<number, Candidate>(),
      age = query.features[6]!;
    for (
      let bucket = Math.floor(age - 2);
      bucket <= Math.floor(age + 2);
      bucket++
    )
      for (const profile of ageIndex.get(bucket) ?? []) {
        if (
          profile.nhlPlayerId === query.nhlPlayerId ||
          Math.abs(profile.features[6]! - age) > 2
        )
          continue;
        const d = distance(query, profile);
        if (!finite(d)) continue;
        const prior = best.get(profile.nhlPlayerId);
        if (
          !prior ||
          d < prior.distance ||
          (d === prior.distance &&
            profile.originYear < prior.profile.originYear)
        )
          best.set(profile.nhlPlayerId, {
            profile,
            distance: d,
            weight: Math.exp(-d / 2),
          });
      }
    const selected = [...best.values()]
      .sort(
        (a, b) =>
          a.distance - b.distance ||
          a.profile.nhlPlayerId - b.profile.nhlPlayerId,
      )
      .slice(0, 60)
      .filter((p) => p.weight > 0);
    if (!selected.length) return null;
    const maximumWeight = selected[0]!.weight,
      weighted: Array<Pair & { weight: number }> = [],
      peerWeights: number[] = [];
    for (const peer of selected) {
      const follow = episode(peer.profile);
      let total = 0;
      for (const pair of follow.pairs) {
        const weight =
          (pair.share * (peer.weight / maximumWeight)) / follow.steps;
        if (weight > 0) {
          weighted.push({ ...pair, weight });
          total += weight;
        }
      }
      if (total > 0) peerWeights.push(total);
    }
    if (peerWeights.length < 5 || weighted.length < 10) return null;
    const weightSum = peerWeights.reduce((s, w) => s + w, 0),
      effectivePeers =
        weightSum ** 2 / peerWeights.reduce((s, w) => s + w * w, 0);
    let curve: NhlTalentPeerAging["curve"] | null = null,
      bestLoss = Infinity;
    for (let peakAge = 20; peakAge <= 32; peakAge++) {
      let devN = 0,
        devD = 0,
        decN = 0,
        decD = 0;
      for (const p of weighted) {
        const a = Math.max(0, peakAge - p.age),
          b = Math.max(0, p.age - peakAge);
        devN += p.weight * a * p.delta;
        devD += p.weight * a * a;
        decN -= p.weight * b * p.delta;
        decD += p.weight * b * b;
      }
      if (!devD || !decD) continue;
      const developmentRate = Math.max(0, devN / devD),
        declineRate = Math.max(0, decN / decD);
      const loss =
        weighted.reduce(
          (s, p) =>
            s +
            p.weight *
              (p.delta -
                developmentRate * Math.max(0, peakAge - p.age) +
                declineRate * Math.max(0, p.age - peakAge)) **
                2,
          0,
        ) / weightSum;
      if (loss < bestLoss) {
        bestLoss = loss;
        curve = { peakAge, developmentRate, declineRate };
      }
    }
    if (!curve) return null;
    return {
      version: VERSION,
      throughYear,
      position,
      playerId: query.nhlPlayerId,
      originYear: query.originYear,
      curve,
      similarityWeight: maximumWeight,
      blendWeight: (maximumWeight * effectivePeers) / (effectivePeers + 20),
      effectivePeers,
      selectedPeers: selected.length,
      contributingPeers: peerWeights.length,
      pairs: weighted.length,
      nearest: selected.slice(0, 10).map((p) => ({
        nhlPlayerId: p.profile.nhlPlayerId,
        originYear: p.profile.originYear,
        distance: p.distance,
        weight: p.weight,
      })),
      selection: {
        ageWindow: 2,
        maximumPeers: 60,
        priorPeers: 20,
        garScale,
        changeScale,
        minutesScale,
        outcomeBlind: true,
        description:
          "One closest origin per other NHL player; origin age/GAR/change/exposure and missing-history masks only. First transition omitted because the one-year baseline already handles initial regression. Later measured same-role pairs weighted by game share, origin kernel and inverse eligible calendar steps. Effective peers uses total contributed pair weights; absolute nearest similarity further shrinks the blend. Survivor curve remains conditional, exits belong to the full-cohort return model.",
      },
    };
  };
}

export function validateNhlTalentPeerAging(
  value: unknown,
): asserts value is NhlTalentPeerAging {
  function fail(): never {
    throw Error("Invalid NHL talent peer-aging model");
  }
  const object = (x: unknown): x is Record<string, unknown> =>
    !!x && typeof x === "object" && !Array.isArray(x);
  const keys = (x: Record<string, unknown>, wanted: readonly string[]) => {
    if (
      Object.keys(x).length !== wanted.length ||
      wanted.some((k) => !Object.hasOwn(x, k))
    )
      fail();
  };
  if (!object(value)) fail();
  keys(value, [
    "version",
    "throughYear",
    "position",
    "playerId",
    "originYear",
    "curve",
    "blendWeight",
    "similarityWeight",
    "effectivePeers",
    "selectedPeers",
    "contributingPeers",
    "pairs",
    "nearest",
    "selection",
  ]);
  if (
    value.version !== VERSION ||
    !integer(value.throughYear, 1900) ||
    value.throughYear > 2200 ||
    value.originYear !== value.throughYear ||
    !integer(value.playerId, 1) ||
    !["F", "D", "G"].some((p) => p === value.position) ||
    !integer(value.selectedPeers, 5) ||
    value.selectedPeers > 60 ||
    !integer(value.contributingPeers, 5) ||
    value.contributingPeers > value.selectedPeers ||
    !integer(value.pairs, 10) ||
    !finite(value.effectivePeers) ||
    value.effectivePeers <= 0 ||
    value.effectivePeers > value.contributingPeers + 1e-8 ||
    !finite(value.similarityWeight) ||
    value.similarityWeight <= 0 ||
    value.similarityWeight > 1 ||
    value.blendWeight !==
      (value.similarityWeight * value.effectivePeers) /
        (value.effectivePeers + 20)
  )
    fail();
  if (!object(value.curve)) fail();
  keys(value.curve, ["peakAge", "developmentRate", "declineRate"]);
  if (
    !integer(value.curve.peakAge, 20) ||
    value.curve.peakAge > 32 ||
    !finite(value.curve.developmentRate) ||
    value.curve.developmentRate < 0 ||
    !finite(value.curve.declineRate) ||
    value.curve.declineRate < 0
  )
    fail();
  if (
    !Array.isArray(value.nearest) ||
    value.nearest.length !== Math.min(10, value.selectedPeers)
  )
    fail();
  const seen = new Set<number>();
  let distance = -Infinity;
  let nearestWeight: number | undefined;
  for (const peer of Array.from(value.nearest)) {
    if (!object(peer)) fail();
    keys(peer, ["nhlPlayerId", "originYear", "distance", "weight"]);
    if (
      !integer(peer.nhlPlayerId, 1) ||
      peer.nhlPlayerId === value.playerId ||
      seen.has(peer.nhlPlayerId) ||
      !integer(peer.originYear, 1900) ||
      peer.originYear >= value.throughYear ||
      !finite(peer.distance) ||
      peer.distance < 0 ||
      peer.distance < distance ||
      !finite(peer.weight) ||
      peer.weight <= 0 ||
      peer.weight !== Math.exp(-peer.distance / 2)
    )
      fail();
    seen.add(peer.nhlPlayerId);
    nearestWeight ??= peer.weight;
    distance = peer.distance;
  }
  if (value.similarityWeight !== nearestWeight) fail();
  if (!object(value.selection)) fail();
  keys(value.selection, [
    "ageWindow",
    "maximumPeers",
    "priorPeers",
    "garScale",
    "changeScale",
    "minutesScale",
    "outcomeBlind",
    "description",
  ]);
  if (
    value.selection.ageWindow !== 2 ||
    value.selection.maximumPeers !== 60 ||
    value.selection.priorPeers !== 20 ||
    !finite(value.selection.garScale) ||
    value.selection.garScale < 2 ||
    !finite(value.selection.changeScale) ||
    value.selection.changeScale < 2 ||
    !finite(value.selection.minutesScale) ||
    value.selection.minutesScale < 200 ||
    value.selection.outcomeBlind !== true ||
    typeof value.selection.description !== "string"
  )
    fail();
}
