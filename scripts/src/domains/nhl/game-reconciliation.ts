import { clockSeconds } from "./game-value-input";
import { parseCsv } from "../ranking/nhl-rating-diagnostics";

export type OfficialAppearance = { gameId: number; seconds: number };
export type ProviderAppearance = {
  gameId: number;
  seconds: number;
  rows: Record<string, string>[];
};

export function reconcileSeasonExposure(
  games: Array<{ players: Array<{ id: number; seconds: number }> }>,
  reference: Array<{ playerId: number; games: number; minutes: number }>,
) {
  const totals = new Map<number, { games: number; minutes: number }>();
  for (const game of games)
    for (const p of game.players) {
      const total = totals.get(p.id) ?? { games: 0, minutes: 0 };
      total.games++;
      total.minutes += p.seconds / 60;
      totals.set(p.id, total);
    }
  const ids = new Set(reference.map((p) => p.playerId));
  if (ids.size !== reference.length)
    throw new Error("Duplicate season reference identity");
  const extraPlayerIds = [...totals.keys()].filter((id) => !ids.has(id));
  const mismatches = reference.flatMap((p) => {
    const total = totals.get(p.playerId) ?? { games: 0, minutes: 0 };
    return total.games !== p.games || Math.abs(total.minutes - p.minutes) > 1
      ? [
          {
            playerId: p.playerId,
            expectedGames: p.games,
            sourceGames: total.games,
            expectedMinutes: p.minutes,
            sourceMinutes: total.minutes,
          },
        ]
      : [];
  });
  return {
    matches: !extraPlayerIds.length && !mismatches.length,
    extraPlayerIds,
    mismatches,
  };
}

/** A second official report distinguishes confirmed zero exposure from an omitted clock. */
export function parseOfficialStatAppearances(
  value: unknown,
  playerId: number,
  season: number,
  goalie: boolean,
) {
  if (
    !value ||
    typeof value !== "object" ||
    !("data" in value) ||
    !Array.isArray(value.data) ||
    !("total" in value) ||
    value.data.length !== value.total
  )
    throw new Error("Incomplete official per-game statistics");
  const appearances: OfficialAppearance[] = [],
    nonAppearanceGameIds: number[] = [],
    seen = new Set<number>();
  for (const raw of value.data) {
    if (
      !raw ||
      typeof raw !== "object" ||
      !("playerId" in raw) ||
      raw.playerId !== playerId ||
      !("gameId" in raw) ||
      !("gamesPlayed" in raw)
    )
      throw new Error("Mixed official per-game player identity");
    const gameId = Number(raw.gameId);
    if (
      !Number.isInteger(gameId) ||
      Math.floor(gameId / 1e6) !== Math.floor(season / 10000) ||
      Math.floor(gameId / 10000) % 100 !== 2 ||
      seen.has(gameId)
    )
      throw new Error("Mixed or duplicate official per-game scope");
    seen.add(gameId);
    if (raw.gamesPlayed === 0) {
      nonAppearanceGameIds.push(gameId);
      continue;
    }
    const field = goalie ? "timeOnIce" : "timeOnIcePerGame";
    const seconds = field in raw ? raw[field as keyof typeof raw] : undefined;
    if (
      raw.gamesPlayed !== 1 ||
      typeof seconds !== "number" ||
      !Number.isInteger(seconds) ||
      seconds < 0
    )
      throw new Error("Missing official per-game exposure");
    appearances.push({ gameId, seconds });
  }
  return { appearances, nonAppearanceGameIds };
}
export function parseOfficialAppearances(
  value: unknown,
  season: number,
): OfficialAppearance[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("gameLog" in value) ||
    !Array.isArray(value.gameLog)
  )
    throw new Error("Malformed official game log");
  const result: OfficialAppearance[] = [];
  for (const raw of value.gameLog) {
    if (
      !raw ||
      typeof raw !== "object" ||
      !("gameId" in raw) ||
      !("toi" in raw)
    )
      throw new Error("Malformed official appearance");
    const gameId = Number(raw.gameId);
    if (
      !Number.isInteger(gameId) ||
      Math.floor(gameId / 1e6) !== Math.floor(season / 10000) ||
      result.some((g) => g.gameId === gameId)
    )
      throw new Error("Duplicate or wrong-season official appearance");
    result.push({ gameId, seconds: clockSeconds(raw.toi) });
  }
  return result;
}
export function parseProviderAppearances(
  text: string,
  playerId: number,
  season: number,
): ProviderAppearance[] {
  const map = new Map<number, Record<string, string>[]>();
  for (const row of parseCsv(text)) {
    if (Number(row.playerId) !== playerId)
      throw new Error("Wrong player in provider career file");
    if (Number(row.season) !== Math.floor(season / 10000)) continue;
    const id = Number(row.gameId),
      rows = map.get(id) ?? [];
    if (
      !Number.isInteger(id) ||
      Math.floor(id / 1e6) !== Math.floor(season / 10000) ||
      rows.some((p) => p.situation === row.situation)
    )
      throw new Error("Duplicate or wrong-season provider game/situation");
    rows.push(row);
    map.set(id, rows);
  }
  return [...map].map(([gameId, rows]) => {
    const all = rows.find((r) => r.situation === "all");
    const seconds = all?.icetime?.trim() ? Number(all.icetime) : NaN;
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new Error("Missing provider all-situation exposure");
    return { gameId, seconds, rows };
  });
}
export function reconcileGameLedger(
  official: OfficialAppearance[],
  provider: ProviderAppearance[],
) {
  const officialMap = new Map(official.map((g) => [g.gameId, g]));
  const providerMap = new Map(provider.map((g) => [g.gameId, g]));
  if (
    officialMap.size !== official.length ||
    providerMap.size !== provider.length
  )
    throw new Error("Duplicate appearance ledger");
  return {
    officialGames: official.length,
    providerGames: provider.length,
    missing: official
      .filter((g) => !providerMap.has(g.gameId))
      .map((g) => g.gameId),
    extra: provider
      .filter((g) => !officialMap.has(g.gameId))
      .map((g) => g.gameId),
    toiConflicts: official.flatMap((g) => {
      const p = providerMap.get(g.gameId);
      return p &&
        Math.abs(g.seconds - p.seconds) > Math.max(15, g.seconds * 0.02)
        ? [
            {
              gameId: g.gameId,
              officialSeconds: g.seconds,
              providerSeconds: p.seconds,
            },
          ]
        : [];
    }),
    retainedGameIds: official
      .filter((g) => providerMap.has(g.gameId))
      .map((g) => g.gameId),
  };
}
