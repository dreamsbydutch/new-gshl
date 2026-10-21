import type { Doc } from "../_generated/dataModel";
import type { NhlContractTalentSeason } from "../../src/lib/types/nhl-contract-talent";

export type TalentSeasonReference = {
  teamGames: number;
  expectedPlayers: number;
  populationSha256: string;
  sourceSha256: string;
};

export function nhlContractPlayerId(value: unknown): number | null {
  const number =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** The complete official identity/GP population, not just the supported rating subset. */
export async function talentPopulationDigest(
  rows: readonly Doc<"playerNhlStatLines">[],
) {
  const identities: Array<[string, number]> = [];
  const players = new Set<string>();
  for (const row of rows) {
    const games = number(row.GP);
    if (games === null || games < 0 || !Number.isInteger(games))
      throw Error("Invalid NHL talent population workload");
    if (!games) continue;
    if (!row.playerId.trim() || players.has(row.playerId))
      throw Error("Duplicate or missing NHL talent player identity");
    players.add(row.playerId);
    identities.push([row.playerId, games]);
  }
  identities.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(identities)),
  );
  return {
    players: identities.length,
    sha256: Array.from(new Uint8Array(digest), (value) =>
      value.toString(16).padStart(2, "0"),
    ).join(""),
  };
}

/** Compact read model. Only a current, exact reviewed source binding exposes a value. */
export async function projectNhlContractTalentSeason(input: {
  rows: readonly Doc<"playerNhlStatLines">[];
  sources: ReadonlyMap<string, Doc<"nhlSeasonValues">>;
  seasonStartYear: number;
  currentSeasonStartYear: number;
  reference?: TalentSeasonReference;
}) {
  const { rows, sources, seasonStartYear, currentSeasonStartYear, reference } =
    input;
  const population = await talentPopulationDigest(rows);
  const populationComplete =
    !!reference &&
    seasonStartYear < currentSeasonStartYear &&
    population.players === reference.expectedPlayers &&
    population.sha256 === reference.populationSha256;
  const observations: Array<
    NhlContractTalentSeason & { nhlPlayerId: number | null }
  > = [];
  for (const row of rows) {
    const games = number(row.GP)!;
    if (!games) continue;
    if (!["F", "D", "G"].includes(row.posGroup))
      throw Error("Unknown NHL talent position");
    const minutes = number(row.TOI);
    const rating = row.hockeyRating;
    const source = rating?.sourceId ? sources.get(rating.sourceId) : undefined;
    const role = row.posGroup as "F" | "D" | "G";
    const officialMinutes = source?.hockeyOverall
      ? Math.round(
          source.minutes * source.hockeyOverall.coverage.officialMinutes * 100,
        ) / 100
      : null;
    const bindingValid =
      !!source &&
      !!rating &&
      rating.modelVersion === "nhl-hockey-overall-reviewed-v1" &&
      rating.qualification === "ranked" &&
      Number.isFinite(rating.seasonValue) &&
      source.modelVersion === rating.modelVersion &&
      source.gameType === 2 &&
      source.profile === "core" &&
      source.seasonId === row.seasonId &&
      source.nhlSeason === seasonStartYear * 10000 + seasonStartYear + 1 &&
      source.playerId === row.playerId &&
      source.nhlPlayerId === rating.nhlPlayerId &&
      source.games === games &&
      rating.sourceGames === games &&
      source.position === role &&
      rating.sourcePosition === role &&
      source.status === "rated" &&
      source.hockeyOverall?.qualification === "ranked" &&
      source.hockeyOverall.sourceStatus === "rated" &&
      source.seasonValue === rating.seasonValue &&
      (rating.sourceFetchedAt === undefined ||
        rating.sourceFetchedAt === source.sourceFetchedAt) &&
      minutes !== null &&
      officialMinutes === Math.round(minutes * 100) / 100;
    const available = bindingValid && minutes !== null && minutes > 0;
    observations.push({
      playerId: row.playerId,
      nhlPlayerId: rating?.nhlPlayerId ?? null,
      seasonStartYear,
      position: role,
      games,
      minutes: minutes !== null && minutes >= 0 ? minutes : 0,
      age: number(row.age),
      teamGames: reference?.teamGames ?? null,
      complete: populationComplete,
      goalsAboveReplacement: available ? rating.seasonValue : null,
      qualification: available
        ? "ranked"
        : rating?.qualification === "provisional"
          ? "provisional"
          : rating?.qualification === "insufficient-reference"
            ? "insufficient-reference"
            : "missing-source",
      modelVersion: "nhl-hockey-overall-reviewed-v1",
      ...(rating?.sourceId ? { sourceId: rating.sourceId } : {}),
      ...(source?.sourceHash ? { sourceHash: source.sourceHash } : {}),
      ...(source?.sourceFetchedAt
        ? { sourceFetchedAt: source.sourceFetchedAt }
        : {}),
    });
  }
  return {
    seasonStartYear,
    populationComplete,
    populationSha256: population.sha256,
    teamGames: reference?.teamGames ?? null,
    observations,
  };
}
