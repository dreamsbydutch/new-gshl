import { canonicalName } from "./player-directory";
import type { ScrapedYahooPlayer } from "../yahoo/player-yahoo-id-backfill";

export type PositionSeason = Record<string, unknown> & {
  id: string;
  legacyId?: unknown;
  name?: unknown;
  year?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

export type PositionPlayer = Record<string, unknown> & {
  id: string;
  yahooId?: unknown;
  firstName?: unknown;
  lastName?: unknown;
  fullName?: unknown;
  nhlPos?: unknown;
  posGroup?: unknown;
};

export type LatestPlayerDayPosition = Record<string, unknown> & {
  playerId?: unknown;
  date?: unknown;
  nhlPos?: unknown;
};

export type PlayerPositionSource = "yahoo" | "playerDay";

export type PlayerPositionResolution = {
  positions: string[];
  posGroup: "F" | "D" | "G";
  source: PlayerPositionSource;
  sourceDate: string;
  yahooId: string;
};

export type PlayerPositionReview = PlayerPositionResolution & {
  playerId: string;
  fullName: string;
  previousPositions: string[];
  previousPosGroup: string;
  changed: boolean;
  yahooMatch: "id" | "name" | "";
};

export type PlayerPositionReconciliation = {
  eligibilityByPlayerId: ReadonlyMap<string, PlayerPositionResolution>;
  uniqueYahooEligibilityByName: ReadonlyMap<string, PlayerPositionResolution>;
  updates: Array<{ id: string; data: Record<string, unknown> }>;
  reviews: PlayerPositionReview[];
  yahooMatches: number;
  yahooIdMatches: number;
  yahooNameMatches: number;
  playerDayFallbacks: number;
  preservedExisting: number;
  missingEligibility: number;
  ambiguousYahooRows: number;
};

const POSITION_ORDER = ["C", "LW", "RW", "D", "G"] as const;
const VALID_POSITIONS = new Set<string>(POSITION_ORDER);

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

function dateOnly(value: unknown): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(toText(value));
  return match?.[1] ?? "";
}

function numericYear(value: unknown): number {
  const parsed = Number(toText(value));
  return Number.isInteger(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function playerName(player: PositionPlayer): string {
  return (
    toText(player.fullName) ||
    `${toText(player.firstName)} ${toText(player.lastName)}`.trim()
  );
}

export function normalizeEligiblePositions(value: unknown): string[] {
  const rawValues = Array.isArray(value) ? value : [value];
  const positions = new Set<string>();
  for (const rawValue of rawValues) {
    if (rawValue === null || rawValue === undefined) continue;
    let values: unknown[] = [rawValue];
    if (typeof rawValue === "string" && rawValue.trim().startsWith("[")) {
      try {
        const parsed = JSON.parse(rawValue) as unknown;
        if (Array.isArray(parsed)) values = parsed;
      } catch {
        values = [rawValue];
      }
    }
    for (const entry of values) {
      for (const token of toText(entry).split(/[,/|;]+/)) {
        const normalized = token
          .replace(/^[\s'"\[]+|[\s'"\]]+$/g, "")
          .trim()
          .toUpperCase();
        if (VALID_POSITIONS.has(normalized)) positions.add(normalized);
      }
    }
  }
  return POSITION_ORDER.filter((position) => positions.has(position));
}

export function positionGroup(positions: readonly string[]): "F" | "D" | "G" {
  if (positions.includes("G")) return "G";
  if (
    positions.includes("C") ||
    positions.includes("LW") ||
    positions.includes("RW")
  ) {
    return "F";
  }
  return "D";
}

export function resolveMostRecentPositionSeason(
  seasons: readonly PositionSeason[],
  referenceDate: Date,
): PositionSeason | null {
  const today = referenceDate.toISOString().slice(0, 10);
  const started = seasons.filter((season) => {
    const startDate = dateOnly(season.startDate);
    return Boolean(startDate && startDate <= today);
  });
  return (
    [...started]
      .sort((left, right) => {
        const dateDelta = dateOnly(left.startDate).localeCompare(
          dateOnly(right.startDate),
        );
        if (dateDelta) return dateDelta;
        const yearDelta = numericYear(left.year) - numericYear(right.year);
        return yearDelta || left.id.localeCompare(right.id);
      })
      .at(-1) ?? null
  );
}

function positionsEqual(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((position, index) => position === right[index])
  );
}

type YahooMatch = {
  eligibility: PlayerPositionResolution;
  match: "id" | "name";
};

function buildYahooMatches(
  players: readonly PositionPlayer[],
  yahooPlayers: readonly ScrapedYahooPlayer[],
): {
  ambiguousYahooRows: number;
  matchesByPlayerId: Map<string, YahooMatch>;
  uniqueByName: Map<string, PlayerPositionResolution>;
} {
  const playersByYahooId = new Map<string, PositionPlayer[]>();
  const playersByName = new Map<string, PositionPlayer[]>();
  for (const player of players) {
    const yahooId = toText(player.yahooId);
    if (yahooId) {
      const matches = playersByYahooId.get(yahooId) ?? [];
      matches.push(player);
      playersByYahooId.set(yahooId, matches);
    }
    const name = canonicalName(playerName(player));
    if (name) {
      const matches = playersByName.get(name) ?? [];
      matches.push(player);
      playersByName.set(name, matches);
    }
  }

  const yahooByName = new Map<string, ScrapedYahooPlayer[]>();
  const eligibleYahooPlayers = yahooPlayers.filter(
    (player) => normalizeEligiblePositions(player.positions).length > 0,
  );
  for (const yahooPlayer of eligibleYahooPlayers) {
    const name = canonicalName(yahooPlayer.playerName);
    if (!name) continue;
    const matches = yahooByName.get(name) ?? [];
    matches.push(yahooPlayer);
    yahooByName.set(name, matches);
  }

  const uniqueByName = new Map<string, PlayerPositionResolution>();
  let ambiguousYahooRows = 0;
  for (const [name, rows] of yahooByName) {
    if (rows.length !== 1) {
      ambiguousYahooRows += rows.length;
      continue;
    }
    const row = rows[0]!;
    const positions = normalizeEligiblePositions(row.positions);
    uniqueByName.set(name, {
      positions,
      posGroup: positionGroup(positions),
      source: "yahoo",
      sourceDate: "",
      yahooId: row.yahooId,
    });
  }

  const matchesByPlayerId = new Map<string, YahooMatch>();
  for (const yahooPlayer of eligibleYahooPlayers) {
    const positions = normalizeEligiblePositions(yahooPlayer.positions);
    const eligibility: PlayerPositionResolution = {
      positions,
      posGroup: positionGroup(positions),
      source: "yahoo",
      sourceDate: "",
      yahooId: yahooPlayer.yahooId,
    };
    const idMatches = playersByYahooId.get(yahooPlayer.yahooId) ?? [];
    if (idMatches.length === 1) {
      matchesByPlayerId.set(idMatches[0]!.id, {
        eligibility,
        match: "id",
      });
      continue;
    }
    if (idMatches.length > 1) {
      ambiguousYahooRows += 1;
      continue;
    }

    const nameMatches =
      playersByName.get(canonicalName(yahooPlayer.playerName)) ?? [];
    if (nameMatches.length === 1) {
      const player = nameMatches[0]!;
      if (!matchesByPlayerId.has(player.id)) {
        matchesByPlayerId.set(player.id, {
          eligibility,
          match: "name",
        });
      }
    } else if (nameMatches.length > 1) {
      ambiguousYahooRows += 1;
    }
  }

  return { ambiguousYahooRows, matchesByPlayerId, uniqueByName };
}

export function reconcilePlayerPositions(options: {
  players: readonly PositionPlayer[];
  playerDays: readonly LatestPlayerDayPosition[];
  yahooPlayers: readonly ScrapedYahooPlayer[];
}): PlayerPositionReconciliation {
  const { players, playerDays, yahooPlayers } = options;
  const yahoo = buildYahooMatches(players, yahooPlayers);
  const latestPlayerDayByPlayerId = new Map<string, PlayerPositionResolution>();
  for (const row of playerDays) {
    const playerId = toText(row.playerId);
    const positions = normalizeEligiblePositions(row.nhlPos);
    if (!playerId || positions.length === 0) continue;
    latestPlayerDayByPlayerId.set(playerId, {
      positions,
      posGroup: positionGroup(positions),
      source: "playerDay",
      sourceDate: dateOnly(row.date),
      yahooId: "",
    });
  }

  const eligibilityByPlayerId = new Map<string, PlayerPositionResolution>();
  const updates: PlayerPositionReconciliation["updates"] = [];
  const reviews: PlayerPositionReview[] = [];
  let yahooIdMatches = 0;
  let yahooNameMatches = 0;
  let playerDayFallbacks = 0;
  let preservedExisting = 0;
  let missingEligibility = 0;

  for (const player of players) {
    const yahooMatch = yahoo.matchesByPlayerId.get(player.id);
    const resolution =
      yahooMatch?.eligibility ??
      latestPlayerDayByPlayerId.get(player.id) ??
      null;
    const previousPositions = normalizeEligiblePositions(player.nhlPos);
    if (!resolution) {
      if (previousPositions.length > 0) preservedExisting += 1;
      else missingEligibility += 1;
      continue;
    }

    eligibilityByPlayerId.set(player.id, resolution);
    if (yahooMatch?.match === "id") yahooIdMatches += 1;
    else if (yahooMatch?.match === "name") yahooNameMatches += 1;
    else playerDayFallbacks += 1;

    const previousPosGroup = toText(player.posGroup);
    const changed =
      !positionsEqual(previousPositions, resolution.positions) ||
      previousPosGroup !== resolution.posGroup;
    if (changed) {
      updates.push({
        id: player.id,
        data: {
          nhlPos: resolution.positions,
          posGroup: resolution.posGroup,
        },
      });
    }
    reviews.push({
      playerId: player.id,
      fullName: playerName(player),
      previousPositions,
      previousPosGroup,
      changed,
      yahooMatch: yahooMatch?.match ?? "",
      ...resolution,
    });
  }

  return {
    eligibilityByPlayerId,
    uniqueYahooEligibilityByName: yahoo.uniqueByName,
    updates,
    reviews,
    yahooMatches: yahooIdMatches + yahooNameMatches,
    yahooIdMatches,
    yahooNameMatches,
    playerDayFallbacks,
    preservedExisting,
    missingEligibility,
    ambiguousYahooRows: yahoo.ambiguousYahooRows,
  };
}
