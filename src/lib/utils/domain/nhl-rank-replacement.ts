import type { NhlTalentPosition } from "../../types/nhl-contract-talent-forecast";
import type { NhlAverageTalentArtifact } from "../../types/nhl-average-talent";
import type { NhlOrganizations } from "../../types/nhl-organizations";
import type {
  NhlRankReplacementCalibration,
  NhlRankReplacementPrediction,
  NhlRankReplacementReference,
} from "../../types/nhl-rank-replacement";
import {
  parseAverageNhlTalentArtifact,
  predictAverageNhlTalent,
} from "./nhl-average-talent";
import { nhlOrganizationsSchema } from "../features/nhl-organizations";

export const NHL_REPLACEMENT_RANKS = Object.freeze({ F: 350, D: 175, G: 55 });
const positions = ["F", "D", "G"] as const;
const predictionIndexes = new WeakMap<
  NhlRankReplacementCalibration,
  ReadonlyMap<number, NhlRankReplacementPrediction>
>();

/** Modern complete NHL organization counts, not inferred from the submitted
 * population: a missing club must never silently move every replacement line. */
function expectedTeams(targetYear: number): number {
  if (targetYear >= 2022) return 32;
  if (targetYear >= 2018) return 31;
  if (targetYear >= 2001) return 30;
  throw Error("Ranked replacement requires a supported modern NHL season");
}

/** Calibrates a positional replacement *ability*, then leaves personal workload
 * to the shared lineup allocator. Any common positional goal-rate offset cancels
 * exactly: (ability + offset) - (boundary + offset) = ability - boundary.
 * The centered fitter supplies physical goal differences, not percentiles.
 * This defines a projected reference; it never rewrites recorded historical GAR.
 */
export function fitNhlRankReplacement(
  organizations: NhlOrganizations,
  average: NhlAverageTalentArtifact,
  targetYear: number,
): NhlRankReplacementCalibration {
  if (
    !Number.isSafeInteger(targetYear) ||
    targetYear < 2001 ||
    targetYear > 2200 ||
    average.cutoffYear !== targetYear - 1 ||
    organizations.seasonId !== (targetYear - 1) * 10000 + targetYear
  )
    throw Error("Replacement reference season and model cutoff must match");
  const a = parseAverageNhlTalentArtifact(average);
  const org = nhlOrganizationsSchema.parse(organizations);
  if (org.teams.length !== expectedTeams(targetYear))
    throw Error("A complete NHL organization population is required");
  const clubs = new Set<string>();
  const ids = new Set<number>();
  const inputs = org.teams.flatMap((team) => {
    if (clubs.has(team.abbr)) throw Error("Duplicate NHL organization club");
    clubs.add(team.abbr);
    if (!team.roster.length) throw Error("Empty NHL organization population");
    return team.roster.map((player) => {
      if (ids.has(player.nhlPlayerId))
        throw Error("Duplicate NHL organization player identity");
      ids.add(player.nhlPlayerId);
      const ability = predictAverageNhlTalent(
        a,
        player.nhlPlayerId,
        targetYear,
      );
      if (
        ability.rateAboveAveragePer60 !== null &&
        !Number.isFinite(ability.rateAboveAveragePer60)
      )
        throw Error("Non-finite NHL playing ability cannot define replacement");
      const matches = ability.position === player.position;
      return { player, teamAbbr: team.abbr, ability, matches };
    });
  });
  const references = Object.fromEntries(
    positions.map((position) => {
      const candidates = inputs
        .filter(
          (p) =>
            p.player.position === position &&
            p.matches &&
            p.ability.rateAboveAveragePer60 !== null,
        )
        .sort(
          (x, y) =>
            y.ability.rateAboveAveragePer60! -
              x.ability.rateAboveAveragePer60! ||
            x.player.nhlPlayerId - y.player.nhlPlayerId,
        );
      const rank = NHL_REPLACEMENT_RANKS[position];
      const boundary = candidates[rank - 1];
      if (!boundary)
        throw Error(
          `Insufficient rated ${position} population for rank ${rank}`,
        );
      const excludedPlayers =
        inputs.filter((p) => p.player.position === position).length -
        candidates.length;
      const reference: NhlRankReplacementReference = {
        position,
        rank,
        rateAboveAveragePer60: boundary.ability.rateAboveAveragePer60!,
        boundaryPlayerId: boundary.player.nhlPlayerId,
        eligiblePlayers: candidates.length,
        excludedPlayers,
        evidence: excludedPlayers
          ? "unrated-organization-players"
          : "complete-rated-population",
      };
      return [position, Object.freeze(reference)];
    }),
  ) as Record<NhlTalentPosition, NhlRankReplacementReference>;
  const predictions: NhlRankReplacementPrediction[] = inputs.map(
    ({ player, ability, matches }) => {
      const { rateAboveAveragePer60 } = ability;
      const ref = references[player.position];
      const known = matches && rateAboveAveragePer60 !== null;
      return Object.freeze({
        nhlPlayerId: ability.nhlPlayerId,
        position: player.position,
        targetYear: ability.targetYear,
        latentStandardDeviation: ability.latentStandardDeviation,
        lastObservedYear: ability.lastObservedYear,
        absentSeasons: ability.absentSeasons,
        staleSeasons: ability.staleSeasons,
        observedMinutes: ability.observedMinutes,
        measuredSeasons: ability.measuredSeasons,
        ...(ability.adaptation
          ? { adaptation: Object.freeze({ ...ability.adaptation }) }
          : {}),
        confidenceReasons: Object.freeze([...ability.confidenceReasons]),
        ratePer60: known
          ? rateAboveAveragePer60 - ref.rateAboveAveragePer60
          : null,
        abilityRateAboveAveragePer60: known ? rateAboveAveragePer60 : null,
        replacementRateAboveAveragePer60: ref.rateAboveAveragePer60,
        replacementRank: ref.rank,
        replacementEvidence: ref.evidence,
        status: known ? ability.status : "unavailable",
      }) as NhlRankReplacementPrediction;
    },
  );
  const calibration: NhlRankReplacementCalibration = Object.freeze({
    version: "nhl-ranked-replacement-v1",
    units: "goals-above-replacement-per-60-minutes",
    policy: "current-organizations-playing-ability-350F-175D-55G-v1",
    cutoffYear: a.cutoffYear,
    targetYear,
    sourceSha256: a.sourceSha256,
    organizationSeasonId: org.seasonId,
    organizationUpdatedAt: org.updatedAt,
    population: Object.freeze(
      inputs
        .map(({ player, teamAbbr, ability, matches }) =>
          Object.freeze({
            nhlPlayerId: player.nhlPlayerId,
            position: player.position,
            teamAbbr,
            membership: player.membership,
            eligibility:
              ability.position === null
                ? ("no-projection" as const)
                : !matches
                  ? ("position-mismatch" as const)
                  : ability.rateAboveAveragePer60 === null
                    ? ("no-projection" as const)
                    : ("eligible" as const),
          }),
        )
        .sort((x, y) => x.nhlPlayerId - y.nhlPlayerId),
    ),
    references: Object.freeze(references),
    predictions: Object.freeze(predictions),
  });
  predictionIndexes.set(
    calibration,
    new Map(
      predictions.map((prediction) => [prediction.nhlPlayerId, prediction]),
    ),
  );
  return calibration;
}

/** Unknown organization members remain unavailable, never replacement-zero. */
export function projectNhlRankReplacement(
  calibration: NhlRankReplacementCalibration,
  nhlPlayerId: number,
): NhlRankReplacementPrediction {
  const index = predictionIndexes.get(calibration);
  if (!index) throw Error("Use a fitted immutable NHL replacement calibration");
  if (!Number.isSafeInteger(nhlPlayerId) || nhlPlayerId <= 0)
    throw Error("Invalid NHL player identity");
  return (
    index.get(nhlPlayerId) ?? {
      nhlPlayerId,
      position: null,
      targetYear: calibration.targetYear,
      ratePer60: null,
      abilityRateAboveAveragePer60: null,
      replacementRateAboveAveragePer60: null,
      replacementRank: null,
      replacementEvidence: null,
      latentStandardDeviation: null,
      lastObservedYear: null,
      absentSeasons: 0,
      staleSeasons: 0,
      observedMinutes: 0,
      measuredSeasons: 0,
      confidenceReasons: ["no-rated-history"],
      status: "unavailable",
    }
  );
}

/** A reference fitted to one full league snapshot cannot be reused after
 * filtering teams, changing affiliations/positions, or refreshing rosters. */
export function assertNhlRankReplacementPopulation(
  calibration: NhlRankReplacementCalibration,
  organizations: NhlOrganizations,
  targetYear: number,
): void {
  if (
    !predictionIndexes.has(calibration) ||
    calibration.targetYear !== targetYear ||
    calibration.cutoffYear !== targetYear - 1 ||
    calibration.organizationSeasonId !== organizations.seasonId ||
    calibration.organizationUpdatedAt !== organizations.updatedAt
  )
    throw Error(
      "NHL replacement calibration does not match the organization snapshot",
    );
  const canonical = organizations.teams
    .flatMap((team) =>
      team.roster.map((player) => ({
        nhlPlayerId: player.nhlPlayerId,
        position: player.position,
        teamAbbr: team.abbr,
        membership: player.membership,
      })),
    )
    .sort((x, y) => x.nhlPlayerId - y.nhlPlayerId);
  if (
    organizations.teams.length !== expectedTeams(targetYear) ||
    canonical.length !== calibration.population.length ||
    canonical.some((player, i) => {
      const saved = calibration.population[i]!;
      return (
        player.nhlPlayerId !== saved.nhlPlayerId ||
        player.position !== saved.position ||
        player.teamAbbr !== saved.teamAbbr ||
        player.membership !== saved.membership
      );
    })
  )
    throw Error(
      "NHL replacement calibration requires its complete original population",
    );
}
