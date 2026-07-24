import type { Player, Season } from "@gshl-types";
import { getTorontoDate } from "../domain/contracts";
import { UFA_OFFER_MS } from "./ufa-deadline";

export { UFA_OFFER_MS } from "./ufa-deadline";

export function calculateUfaSalary(baseSalary: unknown): number {
  const parsed = Number(baseSalary);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed * 1.25) : 0;
}

export function getUfaWindow(
  season: Pick<Season, "signingEndDate"> | null,
  referenceDate = new Date(),
) {
  const afterSigning = Boolean(
    season?.signingEndDate &&
      getTorontoDate(referenceDate) > season.signingEndDate,
  );
  const now = referenceDate.getTime();
  return {
    isOpen: afterSigning,
    deadlineForFirstOffer: afterSigning ? now + UFA_OFFER_MS : null,
  };
}

export function calculateUfaProbabilities(
  entries: Array<{ id: string; score: number }>,
) {
  if (entries.length === 0) return [];
  if (entries.length === 1) return [{ id: entries[0]!.id, probability: 1 }];
  const max = Math.max(...entries.map((entry) => entry.score * 3));
  const weights = entries.map((entry) => Math.exp(entry.score * 3 - max));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const remainder = Math.max(0, 1 - entries.length * 0.05);
  return entries.map((entry, index) => ({
    id: entry.id,
    probability: 0.05 + remainder * ((weights[index] ?? 0) / total),
  }));
}

export function calculateUfaFitScore(input: {
  years: 1 | 2 | 3;
  franchisePerformance: number;
  ownerLadder: number;
  draftCapital: number;
  playerPerformance: number;
  rosterQuality: number;
  positionalOpportunity: number;
}) {
  const p = Math.max(0, Math.min(1, input.playerPerformance));
  const term = (input.years - 1) / 2;
  const rosterFit =
    (0.35 + 0.3 * p) * input.rosterQuality +
    (0.65 - 0.3 * p) * input.positionalOpportunity;
  return {
    rosterFit,
    score:
      0.25 * term +
      (0.1 + 0.1 * p) * input.franchisePerformance +
      0.25 * rosterFit +
      0.15 * input.ownerLadder +
      (0.25 - 0.1 * p) * input.draftCapital,
  };
}

export function selectUfaOffer(
  probabilities: Array<{ id: string; probability: number }>,
  roll: number,
) {
  if (!probabilities.length) return null;
  let cumulative = 0;
  for (const entry of probabilities) {
    cumulative += entry.probability;
    if (roll < cumulative) return entry.id;
  }
  return probabilities.at(-1)!.id;
}

export function rankUfas<
  T extends Pick<Player, "fullName"> & {
    salary: number;
  },
>(players: T[]): T[] {
  return [...players].sort(
    (left, right) =>
      right.salary - left.salary || left.fullName.localeCompare(right.fullName),
  );
}

export function selectTopAffordableUfas<
  T extends { affordableTerms: readonly unknown[] },
>(players: T[], limit = 15): T[] {
  return selectAffordableUfas(players).slice(0, limit);
}

export function selectAffordableUfas<
  T extends { affordableTerms: readonly unknown[] },
>(players: T[]): T[] {
  return players.filter((player) => player.affordableTerms.length > 0);
}

export function indexLatestUfaNhlStats<
  T extends { playerId: string | number; seasonId: string | number },
>(
  stats: T[],
  seasons: Array<{ id: string | number; year: unknown }>,
  signingSeasonYear?: unknown,
): Map<string, T> {
  const seasonYearById = new Map(
    seasons.map((season) => [String(season.id), Number(season.year)]),
  );
  const maximumYear = Number(signingSeasonYear);
  const eligible = stats.flatMap((row) => {
    const year = seasonYearById.get(String(row.seasonId));
    if (
      year === undefined ||
      !Number.isFinite(year) ||
      (Number.isFinite(maximumYear) && year > maximumYear)
    ) {
      return [];
    }
    return [{ row, year }];
  });
  const latestYear = Math.max(
    Number.NEGATIVE_INFINITY,
    ...eligible.map(({ year }) => year),
  );

  return new Map(
    eligible
      .filter(({ year }) => year === latestYear)
      .map(({ row }) => [String(row.playerId), row]),
  );
}
