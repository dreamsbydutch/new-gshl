import type {
  NhlTalentForecastDataset,
  NhlTalentPosition,
} from "../../types/nhl-contract-talent-forecast";
import type { NhlConditionalTalentArtifact } from "../../types/nhl-conditional-talent";
import type {
  NhlAverageTalentArtifact,
  NhlAverageTalentPrediction,
  NhlAverageTalentReference,
  NhlAverageTalentWorkload,
} from "../../types/nhl-average-talent";
import {
  fitConditionalNhlTalent,
  parseConditionalNhlTalentArtifact,
  predictConditionalNhlTalent,
} from "./nhl-conditional-talent";

const positions: NhlTalentPosition[] = ["F", "D", "G"];
const slots = { F: 12, D: 6, G: 1 } as const;
const adapters = new WeakMap<object, NhlConditionalTalentArtifact>();
const finite = (n: number) => Number.isFinite(n);

/** Internal numeric adapter only: its generic `gar` slot contains centered labels,
 * never published historical GAR. The public artifact has distinct units/fields. */
function numericAdapter(
  a: NhlAverageTalentArtifact,
): NhlConditionalTalentArtifact {
  return {
    version: "nhl-conditional-talent-v3",
    units: "goals-above-replacement-per-60-minutes",
    cutoffYear: a.cutoffYear,
    sourceSha256: a.sourceSha256,
    references: a.references,
    validation: a.validation,
    profiles: a.profiles.map((p) => ({
      ...p,
      observations: p.observations.map(({ goalsAboveAverage, ...o }) => ({
        ...o,
        gar: goalsAboveAverage,
      })),
    })),
  };
}

function workloadMinutes(
  position: NhlTalentPosition,
  rows: NhlAverageTalentWorkload["seasons"],
): number {
  return position === "G"
    ? rows.reduce((sum, s) => sum + (s.minutes * 82) / s.teamGames, 0) /
        rows.reduce((sum, s) => sum + s.players, 0)
    : (82 * rows.reduce((sum, s) => sum + s.minutes, 0)) /
        rows.reduce((sum, s) => sum + s.games, 0);
}

export function fitAverageNhlTalent(
  input: NhlTalentForecastDataset,
  cutoffYear: number,
  sourceSha256: string,
) {
  if (!Number.isSafeInteger(cutoffYear) || !/^[a-f0-9]{64}$/.test(sourceSha256))
    throw Error("Invalid average talent fit request");
  const seasons = input.seasons
    .filter((s) => s.year <= cutoffYear)
    .sort((a, b) => a.year - b.year);
  if (
    seasons.length < 3 ||
    seasons.at(-1)?.year !== cutoffYear ||
    seasons.some(
      (s) =>
        !s.seasonComplete ||
        !s.officialCohortComplete ||
        !finite(s.teamGames) ||
        s.teamGames <= 0,
    )
  )
    throw Error("Verified complete NHL seasons and cutoff required");
  const seasonalReferences: NhlAverageTalentReference[] = [];
  const centered: NhlTalentForecastDataset = {
    seasons: seasons.map((s) => {
      const means = new Map<NhlTalentPosition, number>();
      for (const position of positions) {
        const rated = s.players.filter(
          (p) =>
            p.position === position &&
            p.minutes > 0 &&
            p.goalsAboveReplacement !== null,
        );
        const ratedMinutes = rated.reduce((sum, p) => sum + p.minutes, 0);
        const mean =
          (60 * rated.reduce((sum, p) => sum + p.goalsAboveReplacement!, 0)) /
          ratedMinutes;
        if (
          !rated.length ||
          !finite(mean) ||
          !finite(ratedMinutes) ||
          ratedMinutes <= 0
        )
          throw Error("Missing rated position baseline");
        means.set(position, mean);
        const residual = rated.reduce(
          (sum, p) => sum + p.goalsAboveReplacement! - (mean * p.minutes) / 60,
          0,
        );
        const magnitude = rated.reduce(
          (sum, p) => sum + Math.abs(p.goalsAboveReplacement!),
          0,
        );
        if (Math.abs(residual) > 1e-9 * Math.max(1, magnitude))
          throw Error("Position-centered labels failed zero-sum validation");
        seasonalReferences.push({
          year: s.year,
          position,
          ratedPlayers: rated.length,
          ratedMinutes,
          goalsAboveReplacementPer60: mean,
        });
      }
      return {
        ...s,
        players: s.players.map((p) => ({
          ...p,
          goalsAboveReplacement:
            p.goalsAboveReplacement === null
              ? null
              : p.goalsAboveReplacement -
                (means.get(p.position)! * p.minutes) / 60,
        })),
      };
    }),
  };
  const recent = seasons.slice(-3);
  if (recent.some((s, i) => s.year !== cutoffYear - 2 + i))
    throw Error("Three consecutive completed workload seasons required");
  const standardWorkloads = positions.map((position) => {
    const rows = recent.map((s) => {
      if (
        s.players.some(
          (p) =>
            !p.teams?.length || p.teams.some((t) => !/^[A-Z]{2,4}$/.test(t)),
        )
      )
        throw Error(
          "Verified season club sets required for workload benchmark",
        );
      const teamCount = new Set(s.players.flatMap((p) => [...p.teams!])).size;
      const cohort = s.players
        .filter((p) => p.position === position && p.minutes > 0)
        .sort((a, b) => b.minutes - a.minutes || a.nhlPlayerId - b.nhlPlayerId)
        .slice(0, slots[position] * teamCount);
      if (!teamCount || cohort.length !== slots[position] * teamCount)
        throw Error("Incomplete standard workload cohort");
      return {
        year: s.year,
        teamCount,
        players: cohort.length,
        minutes: cohort.reduce((sum, p) => sum + p.minutes, 0),
        games: cohort.reduce((sum, p) => sum + p.games, 0),
        teamGames: s.teamGames,
      };
    });
    return {
      position,
      rolesPerTeam: slots[position],
      standardMinutes: workloadMinutes(position, rows),
      seasons: rows,
    };
  });
  const fitted = fitConditionalNhlTalent(centered, cutoffYear, sourceSha256);
  const artifact: NhlAverageTalentArtifact = {
    version: "nhl-average-talent-v1",
    units: "goals-above-average-per-60-minutes",
    baseline: "season-position-exposure-weighted-rated-player",
    cutoffYear,
    sourceSha256,
    seasonalReferences,
    workloadPolicy:
      "latest-three-complete-seasons-top-12F-6D-1G-team-equivalents-by-minutes-v1",
    standardWorkloads,
    references: fitted.artifact.references,
    validation: fitted.artifact.validation,
    profiles: fitted.artifact.profiles.map((p) => ({
      ...p,
      observations: p.observations.map(({ gar, ...o }) => ({
        ...o,
        goalsAboveAverage: gar,
      })),
    })),
  };
  return {
    artifact: parseAverageNhlTalentArtifact(artifact),
    validationRows: fitted.validationRows,
  };
}

export function parseAverageNhlTalentArtifact(
  input: unknown,
): NhlAverageTalentArtifact {
  if (!input || typeof input !== "object")
    throw Error("Invalid average talent artifact");
  if (adapters.has(input)) return input as NhlAverageTalentArtifact;
  const a = input as NhlAverageTalentArtifact;
  if (
    a.version !== "nhl-average-talent-v1" ||
    a.units !== "goals-above-average-per-60-minutes" ||
    a.baseline !== "season-position-exposure-weighted-rated-player" ||
    a.workloadPolicy !==
      "latest-three-complete-seasons-top-12F-6D-1G-team-equivalents-by-minutes-v1" ||
    !Array.isArray(a.seasonalReferences) ||
    !a.seasonalReferences.length ||
    !Array.isArray(a.standardWorkloads) ||
    a.standardWorkloads.length !== 3 ||
    !Array.isArray(a.profiles)
  )
    throw Error("Invalid average talent artifact");
  const keys = new Set<string>();
  for (const r of a.seasonalReferences) {
    const key = `${r.year}:${r.position}`;
    if (
      !Number.isSafeInteger(r.year) ||
      r.year < 1900 ||
      r.year > a.cutoffYear ||
      !positions.includes(r.position) ||
      keys.has(key) ||
      !Number.isSafeInteger(r.ratedPlayers) ||
      r.ratedPlayers <= 0 ||
      !finite(r.ratedMinutes) ||
      r.ratedMinutes <= 0 ||
      !finite(r.goalsAboveReplacementPer60)
    )
      throw Error("Invalid seasonal average baseline");
    keys.add(key);
  }
  for (const year of new Set(a.seasonalReferences.map((r) => r.year)))
    if (positions.some((p) => !keys.has(`${year}:${p}`)))
      throw Error("Missing seasonal position baseline");
  const roles = new Set<string>();
  for (const w of a.standardWorkloads) {
    if (
      !positions.includes(w.position) ||
      roles.has(w.position) ||
      w.rolesPerTeam !== slots[w.position] ||
      !Array.isArray(w.seasons) ||
      w.seasons.length !== 3 ||
      !finite(w.standardMinutes) ||
      w.standardMinutes <= 0 ||
      w.standardMinutes > 82 * 65
    )
      throw Error("Invalid standard opportunity workload");
    roles.add(w.position);
    for (const [i, s] of w.seasons.entries())
      if (
        s.year !== a.cutoffYear - 2 + i ||
        !keys.has(`${s.year}:${w.position}`) ||
        !Number.isSafeInteger(s.teamCount) ||
        s.teamCount <= 0 ||
        s.teamCount > 40 ||
        s.players !== s.teamCount * w.rolesPerTeam ||
        !finite(s.minutes) ||
        s.minutes <= 0 ||
        !Number.isSafeInteger(s.games) ||
        s.games <= 0 ||
        !finite(s.teamGames) ||
        s.teamGames <= 0
      )
        throw Error("Invalid standard workload support");
    if (
      Math.abs(w.standardMinutes - workloadMinutes(w.position, w.seasons)) >
      1e-8
    )
      throw Error("Inconsistent standard opportunity minutes");
  }
  for (const p of a.profiles)
    for (const o of p.observations)
      if (
        !keys.has(`${o.year}:${p.position}`) ||
        !finite(o.goalsAboveAverage) ||
        "gar" in o
      )
        throw Error("Invalid centered talent observation");
  const adapter = parseConditionalNhlTalentArtifact(numericAdapter(a));
  const seen = new WeakSet<object>();
  const freeze = (v: unknown): void => {
    if (!v || typeof v !== "object" || seen.has(v)) return;
    seen.add(v);
    for (const c of Object.values(v)) freeze(c);
    Object.freeze(v);
  };
  freeze(a);
  adapters.set(a, adapter);
  return a;
}

export function predictAverageNhlTalent(
  artifact: NhlAverageTalentArtifact,
  nhlPlayerId: number,
  targetYear: number,
): NhlAverageTalentPrediction {
  const a = parseAverageNhlTalentArtifact(artifact);
  const { ratePer60, ...prediction } = predictConditionalNhlTalent(
    adapters.get(a)!,
    nhlPlayerId,
    targetYear,
  );
  const standardMinutes =
    a.standardWorkloads.find((w) => w.position === prediction.position)
      ?.standardMinutes ?? null;
  return {
    ...prediction,
    rateAboveAveragePer60: ratePer60,
    standardMinutes,
    standardSeasonGoalsAboveAverage:
      ratePer60 === null || standardMinutes === null
        ? null
        : (ratePer60 * standardMinutes) / 60,
  };
}
