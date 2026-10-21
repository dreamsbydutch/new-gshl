import type { NhlContractAnalyticsInput } from "../../types/nhl-contract-analytics";
import type { NhlContractTalentSeason } from "../../types/nhl-contract-talent";
import type { NhlTalentForecastArtifact } from "../../types/nhl-contract-talent-forecast";
import type {
  NhlContractTalentPopulation,
  NhlContractTalentView,
} from "../../types/nhl-contract-talent-view";
import { summarizeContractTalent } from "./nhl-contract-talent";
import { predictNhlContractTalent } from "./nhl-contract-talent-forecast";

/** Computes no salaries; the full closed official cohort is required to assert absence. */
export function buildNhlContractTalentViews(
  contracts: readonly NhlContractAnalyticsInput[],
  populations: readonly NhlContractTalentPopulation[],
  artifact: NhlTalentForecastArtifact,
  currentSeasonStartYear: number,
): Map<string, NhlContractTalentView> {
  const byPlayer = new Map<string, NhlContractTalentSeason[]>();
  const nhlIds = new Map<string, Set<number>>();
  for (const population of populations)
    for (const row of population.observations) {
      const group = byPlayer.get(row.playerId) ?? [];
      group.push(row);
      byPlayer.set(row.playerId, group);
      if (row.nhlPlayerId !== null) {
        const ids = nhlIds.get(row.playerId) ?? new Set<number>();
        ids.add(row.nhlPlayerId);
        nhlIds.set(row.playerId, ids);
      }
    }
  const results = new Map<string, NhlContractTalentView>();
  for (const contract of contracts) {
    const result: NhlContractTalentView = {
      actual: null,
      error: null,
      forecast: {
        status: "unavailable",
        averageGar82: null,
        originYear: artifact.cutoffYear,
        years: [],
        reasons: [],
      },
    };
    try {
      if (!contract.playerId) throw Error("Missing canonical player identity");
      const identities = nhlIds.get(contract.playerId);
      if (
        identities &&
        (identities.size > 1 ||
          (contract.nhlPlayerId && !identities.has(contract.nhlPlayerId)))
      )
        throw Error("Conflicting canonical NHL player identity");
      const history = [...(byPlayer.get(contract.playerId) ?? [])];
      const role = ["F", "D", "G"].includes(contract.position)
        ? (contract.position as "F" | "D" | "G")
        : history.at(-1)?.position;
      const nhlPlayerId =
        contract.nhlPlayerId ??
        (identities?.size === 1 ? [...identities][0] : undefined);
      if (role && nhlPlayerId)
        for (const population of populations) {
          if (
            population.populationComplete &&
            population.teamGames !== null &&
            !history.some(
              (row) => row.seasonStartYear === population.seasonStartYear,
            )
          )
            history.push({
              playerId: contract.playerId,
              seasonStartYear: population.seasonStartYear,
              position: role,
              games: 0,
              minutes: 0,
              teamGames: population.teamGames,
              goalsAboveReplacement: 0,
              qualification: "no-nhl-games",
              complete: true,
              modelVersion: "nhl-hockey-overall-reviewed-v1",
            });
        }
      result.actual = summarizeContractTalent(contract, history, {
        currentSeasonStartYear,
      });
      if (contract.expirySeasonStartYear < currentSeasonStartYear) {
        result.forecast.status = "expired";
        result.forecast.reasons = ["No contract seasons remain"];
      } else if (currentSeasonStartYear !== artifact.cutoffYear) {
        result.forecast.status = "stale";
        result.forecast.reasons = [
          "A forecast reference for the current preseason is required",
        ];
      } else if (!nhlPlayerId) {
        result.forecast.reasons = ["No verified NHL identity for this player"];
      } else {
        for (
          let year = Math.max(
            currentSeasonStartYear,
            contract.startSeasonStartYear,
          );
          year <= contract.expirySeasonStartYear;
          year++
        ) {
          result.forecast.years.push({
            seasonStartYear: year,
            prediction: predictNhlContractTalent(artifact, {
              nhlPlayerId,
              targetYear: year + 1,
            }),
          });
        }
        const qualified =
          result.forecast.years.length > 0 &&
          result.forecast.years.every(
            (row) =>
              row.prediction.status === "qualified" &&
              row.prediction.valuePer82 !== null,
          );
        if (qualified) {
          result.forecast.status = "qualified";
          result.forecast.averageGar82 =
            result.forecast.years.reduce(
              (sum, row) => sum + row.prediction.valuePer82!,
              0,
            ) / result.forecast.years.length;
        } else
          result.forecast.reasons = [
            ...new Set(
              result.forecast.years
                .filter((row) => row.prediction.status !== "qualified")
                .flatMap((row) => row.prediction.reasons),
            ),
          ];
      }
    } catch (error) {
      result.error =
        error instanceof Error
          ? error.message
          : "Contract talent calculation unavailable";
      result.actual = null;
      result.forecast.status = "unavailable";
      result.forecast.averageGar82 = null;
      result.forecast.reasons = [result.error];
    }
    results.set(contract.id, result);
  }
  return results;
}
